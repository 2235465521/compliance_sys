"""合规评价编排：上传、各步 GET/confirm、指标与证书占位。"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from django.conf import settings
from django.db import connection
from django.utils import timezone
from ninja.errors import HttpError

from apps.compliance.db import REFERENCE_LATEST_REQUIRES_MYSQL_MSG, is_mysql, require_mysql
from apps.core import regulation_subject as reg
from apps.compliance.models import ComplianceEvaluationSnapshot, ComplianceEvaluationTask
from apps.compliance.schemas.api_schemas import (
    ArtifactItem,
    ComparePairIn,
    ComplianceTaskListOut,
    ComplianceTaskOut,
    MissingGbFileItem,
    NationalIndicatorListOut,
    NationalIndicatorReviewIn,
    NationalIndicatorReviewOut,
    NationalIndicatorRowOut,
    NationalIndicatorSaveIn,
    NationalIndicatorSaveOut,
    Step1ConfirmIn,
    Step2ConfirmIn,
    Step3ConfirmIn,
    Step4IndicatorsEnsureIn,
    Step4IndicatorsEnsureOut,
    Step4IndicatorsOut,
    Step5CompareOut,
    StdCodeOrchestrationStatus,
    SummaryOut,
    SupplementRowIn,
)
from apps.compliance.services.parse_service import workflow1_parse_uploaded_file
from apps.compliance.services.task_status import (
    apply_list_status_filter,
    compute_display_status,
    progress_percent_for_task,
    step_label_for_task,
)
from apps.engine.dify_client import DifyApiError, DifyClient
from apps.compliance.state_machine import (
    TaskStateView,
    assert_confirm_step1,
    assert_confirm_step2,
    assert_confirm_step3,
    assert_confirm_step4,
    assert_confirm_step5,
    assert_upload_allowed,
    next_step_after_confirm,
)
from apps.standards.services.reference_bundle import (
    FILE_COMPLIANCE_NO_REFERENCES,
    attach_normative_reference_std_names,
    compute_normative_reference_file_outcome,
    normative_reference_row_core,
)
from apps.standards.services.reference_resolution import (
    list_latest_side_std_codes_for_task,
    resolve_reference_for_task,
)

logger = logging.getLogger(__name__)


def _maybe_expire_stale_async_parse(task: ComplianceEvaluationTask) -> None:
    """异步解析长期 pending（常见原因：未起 Worker）时标记失败，避免任务卡死。"""
    if not getattr(settings, "COMPLIANCE_DIFY_PARSE_ASYNC", False):
        return
    if (getattr(task, "parse_status", None) or "") != "pending":
        return
    ref = task.updated_at
    if ref is None:
        return
    timeout = float(getattr(settings, "COMPLIANCE_PARSE_ASYNC_PENDING_TIMEOUT_SECONDS", 600.0))
    if (timezone.now() - ref).total_seconds() <= timeout:
        return
    task.parse_status = "failed"
    task.parse_error = (
        "异步解析等待超时：请确认已启动 Celery Worker 且 Broker 可连；或关闭环境变量 COMPLIANCE_DIFY_PARSE_ASYNC 后重新上传企标。"
    )
    task.save(update_fields=["parse_status", "parse_error", "updated_at"])


def _auth_tenant_subject(request: Any | None) -> str | None:
    """开启 COMPLIANCE_API_AUTH_REQUIRED 时从 Ninja `request.auth` 取租户标识；未开启或未鉴权路由返回 None。"""
    if not getattr(settings, "COMPLIANCE_API_AUTH_REQUIRED", False):
        return None
    if request is None:
        return None
    auth = getattr(request, "auth", None)
    if not isinstance(auth, dict):
        return None
    sub = auth.get("subject")
    if sub is None or (isinstance(sub, str) and not sub.strip()):
        return None
    return str(sub)


def _assert_task_tenant_access(task: ComplianceEvaluationTask, request: Any | None) -> None:
    """多租户隔离：`created_by` 与当前 Bearer subject 不一致则 403；`created_by` 为空视为历史数据仍允许访问。"""
    sub = _auth_tenant_subject(request)
    if sub is None:
        return
    owner = (task.created_by or "").strip()
    if not owner:
        return
    if owner != sub:
        raise HttpError(403, "无权访问该合规评价任务")


def _task_view(task: ComplianceEvaluationTask) -> TaskStateView:
    return TaskStateView(
        current_step=task.current_step,
        step4_indicators_confirmed=task.step4_indicators_confirmed,
        step5_compare_confirmed=task.step5_compare_confirmed,
        has_parse_result=bool(task.parse_result_json),
        parse_status=getattr(task, "parse_status", None) or "completed",
        parse_error=getattr(task, "parse_error", None),
    )


def _require_subject_code(task: ComplianceEvaluationTask) -> str:
    code = (task.subject_code or "").strip()
    if not code:
        raise HttpError(422, "缺少 subject_code")
    return code


def _anchor_id_for_task(task: ComplianceEvaluationTask) -> int | None:
    code = (task.subject_code or "").strip()
    if not code:
        return None
    with connection.cursor() as c:
        return reg.get_enterprise_anchor_id(c, code)


def _require_anchor_id(task: ComplianceEvaluationTask) -> int:
    aid = _anchor_id_for_task(task)
    if aid is None:
        raise HttpError(422, "主体锚未建立，请先完成审核 1")
    return aid


def _er_where_sql_params(task: ComplianceEvaluationTask) -> tuple[str, list[Any]]:
    return reg.evaluation_result_where(task.id)


def _ensure_evaluation_result_row(task: ComplianceEvaluationTask) -> None:
    anchor_id = _anchor_id_for_task(task)
    if anchor_id is None:
        return
    with connection.cursor() as c:
        reg.ensure_evaluation_result_row(c, task_id=task.id, anchor_id=anchor_id)


def _has_compare_result(task: ComplianceEvaluationTask) -> bool:
    cr = task.compare_result_json
    return isinstance(cr, dict) and len(cr) > 0


def _compare_result_updated_at(task: ComplianceEvaluationTask) -> str | None:
    if not _has_compare_result(task):
        return None
    meta = task.dify_run_metadata_json if isinstance(task.dify_run_metadata_json, dict) else {}
    saved = meta.get("compare_result_saved_at")
    if isinstance(saved, str) and saved.strip():
        return saved
    if task.updated_at:
        return task.updated_at.isoformat()
    return None


def _subject_name_from_task(task: ComplianceEvaluationTask) -> str | None:
    pr = task.parse_result_json
    if isinstance(pr, dict):
        for key in ("subject_name", "qb_name"):
            val = pr.get(key)
            if val is not None and str(val).strip():
                return str(val).strip()
    return None


def _stamp_compare_saved_metadata(task: ComplianceEvaluationTask) -> dict[str, Any]:
    prev = task.dify_run_metadata_json if isinstance(task.dify_run_metadata_json, dict) else {}
    prev = dict(prev)
    prev["compare_result_saved_at"] = timezone.now().isoformat()
    return prev


def _invalidate_step5_compare(task: ComplianceEvaluationTask, *, reset_step4: bool) -> None:
    task.compare_result_json = None
    task.step5_compare_confirmed = False
    if reset_step4:
        task.step4_indicators_confirmed = False
    meta = task.dify_run_metadata_json if isinstance(task.dify_run_metadata_json, dict) else {}
    meta = dict(meta)
    meta.pop("compare_result_saved_at", None)
    task.dify_run_metadata_json = meta


def task_to_out(task: ComplianceEvaluationTask) -> ComplianceTaskOut:
    return ComplianceTaskOut(
        id=task.id,
        catalog_std_type_no=task.catalog_std_type_no,
        subject_code=task.subject_code,
        current_step=task.current_step,
        status=task.status,
        uploaded_file_name=task.uploaded_file_name,
        has_parse_result=bool(task.parse_result_json),
        parse_status=getattr(task, "parse_status", None) or "completed",
        parse_error=getattr(task, "parse_error", None),
        has_compare_result=_has_compare_result(task),
        compare_result_updated_at=_compare_result_updated_at(task),
        step4_indicators_confirmed=bool(task.step4_indicators_confirmed),
        step5_compare_confirmed=bool(task.step5_compare_confirmed),
        company_name=_company_name_from_task(task),
        subject_name=_subject_name_from_task(task),
        updated_at=task.updated_at.isoformat() if task.updated_at else None,
        progress_percent=progress_percent_for_task(task),
        step_label=step_label_for_task(task),
        display_status=compute_display_status(task),
    )


def _company_name_from_task(task: ComplianceEvaluationTask) -> str | None:
    pr = task.parse_result_json
    if not isinstance(pr, dict):
        return None
    name = pr.get("company_name")
    if name is None:
        return None
    s = str(name).strip()
    return s or None


def build_step2_suggested_references(parse_result: dict | None) -> list[dict[str, Any]]:
    """审核 2 GET：规范性引用展示（标准编号 + 是否含年 + 原文描述；`latest_std_code` 固定为 null 供人工填写）。"""
    if not parse_result:
        return []
    detail = parse_result.get("references_detail") or []
    out: list[dict[str, Any]] = []
    if isinstance(detail, list) and detail:
        for item in detail:
            if not isinstance(item, dict):
                continue
            sid = (item.get("standard_id") or item.get("referenced_std_code") or "").strip() or None
            out.append(
                {
                    "referenced_std_code": sid,
                    "latest_std_code": None,
                    "has_year": item.get("has_year"),
                    "full_text": item.get("full_text"),
                }
            )
        if out:
            return out
    codes = parse_result.get("referenced_std_codes") or []
    return [
        {
            "referenced_std_code": str(c).strip() or None,
            "latest_std_code": None,
            "has_year": None,
            "full_text": None,
        }
        for c in codes
        if c is not None and str(c).strip()
    ]


def create_task(request: Any | None = None) -> ComplianceEvaluationTask:
    created_by: str | None = None
    sub = _auth_tenant_subject(request)
    if sub is not None:
        created_by = sub
    elif request is not None:
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            created_by = getattr(user, "username", None) or (str(user.pk) if getattr(user, "pk", None) is not None else None)
    return ComplianceEvaluationTask.objects.create(created_by=created_by)


def get_compliance_task_or_404(task_id: int, request: Any | None = None) -> ComplianceEvaluationTask:
    """按主键取任务；不存在时返回 HTTP 404，避免未捕获 DoesNotExist 变成 500。"""
    try:
        task = ComplianceEvaluationTask.objects.get(pk=task_id)
    except ComplianceEvaluationTask.DoesNotExist as e:
        raise HttpError(
            404,
            f"合规评价任务不存在（id={task_id}）。请先调用 POST /api/v1/compliance/evaluations 创建任务，"
            "并使用响应 JSON 中的 id 作为路径参数 task_id（文档里的示例数字不一定是当前数据库中的有效 id）。",
        ) from e
    _maybe_expire_stale_async_parse(task)
    _assert_task_tenant_access(task, request)
    return task


def _assert_task_tenant_delete_access(task: ComplianceEvaluationTask, request: Any | None) -> None:
    sub = _auth_tenant_subject(request)
    if sub is None:
        return
    owner = (task.created_by or "").strip()
    if not owner:
        return
    if owner != sub:
        raise HttpError(403, "无权删除该任务")


def _remove_task_media_dirs(task_id: int) -> None:
    base = Path(settings.MEDIA_ROOT)
    for sub in ("compliance_certs", "compliance_uploads"):
        root = base / sub / str(task_id)
        if root.is_dir():
            shutil.rmtree(root, ignore_errors=True)


def delete_evaluation_task(task_id: int, request: Any | None = None) -> None:
    """
    删除合规评价任务、关联快照与任务目录下制品（含已完成 current_step >= 6）。
    MySQL 下同时删除 evaluation_result 对应行。
    """
    try:
        task = ComplianceEvaluationTask.objects.get(pk=task_id)
    except ComplianceEvaluationTask.DoesNotExist as e:
        raise HttpError(404, "评价任务不存在") from e

    _assert_task_tenant_delete_access(task, request)

    parse_status = (getattr(task, "parse_status", None) or "").strip()
    if parse_status in ("pending", "running"):
        raise HttpError(409, "任务正在处理中，请稍后再试")

    pk = task.id
    if is_mysql():
        with connection.cursor() as c:
            if reg.table_exists(reg.EVAL_RESULT_TABLE):
                reg.delete_evaluation_result_for_task(c, pk)

    task.delete()
    _remove_task_media_dirs(pk)


def _base_evaluation_queryset(request: Any | None = None):
    qs = ComplianceEvaluationTask.objects.order_by("-updated_at", "-id")
    sub = _auth_tenant_subject(request)
    if sub is not None:
        qs = qs.filter(created_by=sub)
    return qs


def iter_evaluation_tasks(request: Any | None = None):
    return list(_base_evaluation_queryset(request)[:100])


def query_evaluation_tasks(
    request: Any | None = None,
    *,
    status: str | None = None,
    current_step_max: int | None = None,
    subject_code: str | None = None,
):
    qs = _base_evaluation_queryset(request)
    qs = apply_list_status_filter(qs, status)
    if current_step_max is not None:
        qs = qs.filter(current_step__lte=current_step_max)
    if subject_code and subject_code.strip():
        qs = qs.filter(subject_code__icontains=subject_code.strip())
    return qs


def list_evaluations_paged(
    request: Any | None = None,
    *,
    status: str | None = None,
    current_step_max: int | None = None,
    subject_code: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> ComplianceTaskListOut:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    qs = query_evaluation_tasks(
        request,
        status=status,
        current_step_max=current_step_max,
        subject_code=subject_code,
    )
    total = qs.count()
    offset = (page - 1) * page_size
    items = [task_to_out(t) for t in qs[offset : offset + page_size]]
    return ComplianceTaskListOut(items=items, total=total, page=page, page_size=page_size)


def save_snapshot(task: ComplianceEvaluationTask, step: int, payload: dict) -> None:
    ComplianceEvaluationSnapshot.objects.create(task=task, step=step, payload_json=payload)


def save_upload_file(task: ComplianceEvaluationTask, uploaded_file) -> None:
    view = _task_view(task)
    try:
        assert_upload_allowed(view)
    except ValueError as e:
        raise HttpError(422, str(e)) from e
    base = Path(settings.MEDIA_ROOT) / "compliance_uploads" / str(task.id)
    base.mkdir(parents=True, exist_ok=True)
    dest = base / uploaded_file.name
    with dest.open("wb") as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)
    task.uploaded_file_path = str(dest)
    task.uploaded_file_name = uploaded_file.name
    task.parse_result_json = None

    use_async = getattr(settings, "COMPLIANCE_DIFY_PARSE_ASYNC", False)
    if use_async:
        try:
            from apps.compliance.tasks import parse_enterprise_standard_async

            task.parse_status = "pending"
            task.parse_error = None
            task.save(
                update_fields=[
                    "uploaded_file_path",
                    "uploaded_file_name",
                    "parse_result_json",
                    "parse_status",
                    "parse_error",
                    "updated_at",
                ]
            )
            parse_enterprise_standard_async.delay(task.id)
            return
        except Exception:
            pass

    task.parse_status = "running"
    task.parse_error = None
    task.save(
        update_fields=[
            "uploaded_file_path",
            "uploaded_file_name",
            "parse_result_json",
            "parse_status",
            "parse_error",
            "updated_at",
        ]
    )
    try:
        parse_dict, meta = workflow1_parse_uploaded_file(dest, uploaded_file.name, task.id)
    except DifyApiError as e:
        task.parse_status = "failed"
        task.parse_error = str(e)[:2000]
        task.save(update_fields=["parse_status", "parse_error", "updated_at"])
        raise HttpError(502, str(e)) from e
    task.parse_result_json = parse_dict
    task.parse_status = "completed"
    task.parse_error = None
    if meta:
        prev = task.dify_run_metadata_json if isinstance(task.dify_run_metadata_json, dict) else {}
        prev = dict(prev)
        prev["workflow1"] = meta
        task.dify_run_metadata_json = prev
    task.save(
        update_fields=[
            "uploaded_file_path",
            "uploaded_file_name",
            "parse_result_json",
            "parse_status",
            "parse_error",
            "dify_run_metadata_json",
            "updated_at",
        ]
    )


def confirm_step1(task_id: int, body: Step1ConfirmIn, request: Any | None = None) -> ComplianceEvaluationTask:
    task = get_compliance_task_or_404(task_id, request)
    try:
        assert_confirm_step1(_task_view(task))
    except ValueError as e:
        raise HttpError(422, str(e)) from e
    require_mysql()
    code = body.subject_code.strip()
    if is_mysql():
        with connection.cursor() as c:
            reg.upsert_enterprise_anchor(
                c,
                subject_code=code,
                company_name=body.company_name or "",
                subject_name=body.subject_name or "",
            )
    task.catalog_std_type_no = None
    task.subject_code = code
    task.current_step = next_step_after_confirm("confirm_step1")
    task.save(update_fields=["catalog_std_type_no", "subject_code", "current_step", "updated_at"])
    save_snapshot(task, 1, body.model_dump())
    if is_mysql():
        _ensure_evaluation_result_row(task)
        where_sql, where_params = _er_where_sql_params(task)
        with connection.cursor() as c:
            c.execute(
                f"UPDATE {reg.EVAL_RESULT_TABLE} SET descriptive_result = %s WHERE {where_sql}",
                ["compliant", *where_params],
            )
    return task


def confirm_step2(task_id: int, body: Step2ConfirmIn, request: Any | None = None) -> ComplianceEvaluationTask:
    task = get_compliance_task_or_404(task_id, request)
    try:
        assert_confirm_step2(_task_view(task))
    except ValueError as e:
        raise HttpError(422, str(e)) from e
    anchor_id = _require_anchor_id(task)
    require_mysql()
    task.current_step = next_step_after_confirm("confirm_step2")
    task.save(update_fields=["current_step", "updated_at"])
    save_snapshot(task, 2, body.model_dump())
    if is_mysql():
        with connection.cursor() as c:
            reg.delete_reference_mappings_for_anchor(c, anchor_id)
            for row in body.references:
                reg.insert_reference_mapping_row(
                    c,
                    anchor_id=anchor_id,
                    compliance_task_id=task.id,
                    referenced_std_code=(row.referenced_std_code or "").strip() or None,
                    latest_std_code=(row.latest_std_code or "").strip() or None,
                )
            reg.update_anchor_indicator_set_json(
                c,
                task.subject_code,
                json.dumps([i for i in body.indicator_set], ensure_ascii=False),
            )
    return task


def get_reference_latest_bundle(task_id: int, request: Any | None = None) -> dict[str, Any]:
    task = get_compliance_task_or_404(task_id, request)
    if task.current_step < 3:
        raise HttpError(422, "请先完成审核 2")
    require_mysql()
    if not task.subject_code:
        return {"references": [], "file_compliance_outcome": FILE_COMPLIANCE_NO_REFERENCES}
    if not is_mysql():
        raise HttpError(503, REFERENCE_LATEST_REQUIRES_MYSQL_MSG)
    anchor_id = _anchor_id_for_task(task)
    if anchor_id is None:
        return {"references": [], "file_compliance_outcome": FILE_COMPLIANCE_NO_REFERENCES}
    with connection.cursor() as c:
        refs = reg.list_reference_std_codes_for_anchor(c, anchor_id)
    out: list[dict[str, Any]] = []
    for ref in refs:
        raw = resolve_reference_for_task(task, ref)
        out.append(normative_reference_row_core(raw))
    attach_normative_reference_std_names(out)
    return {
        "references": out,
        "file_compliance_outcome": compute_normative_reference_file_outcome(out),
    }


def add_supplements(task_id: int, rows: list[SupplementRowIn], request: Any | None = None) -> None:
    task = get_compliance_task_or_404(task_id, request)
    anchor_id = _require_anchor_id(task)
    require_mysql()
    if is_mysql():
        with connection.cursor() as c:
            for r in rows:
                reg.insert_supplement_mapping_row(
                    c,
                    anchor_id=anchor_id,
                    compliance_task_id=task.id,
                    latest_std_code=r.latest_std_code.strip(),
                )


def confirm_step3(task_id: int, body: Step3ConfirmIn, request: Any | None = None) -> ComplianceEvaluationTask:
    task = get_compliance_task_or_404(task_id, request)
    try:
        assert_confirm_step3(_task_view(task))
    except ValueError as e:
        raise HttpError(422, str(e)) from e
    require_mysql()
    if body.rows and is_mysql():
        with connection.cursor() as c:
            for row in body.rows:
                rid = row.get("id")
                st = row.get("manual_review_status")
                if rid is None:
                    continue
                reg.update_mapping_manual_review_status(c, int(rid), st)
    from apps.compliance.services.certificate_service import write_reference_certificate_placeholder

    path = write_reference_certificate_placeholder(task)
    if is_mysql():
        _ensure_evaluation_result_row(task)
        where_sql, where_params = _er_where_sql_params(task)
        with connection.cursor() as c:
            if path:
                c.execute(
                    f"UPDATE {reg.EVAL_RESULT_TABLE} SET reference_result_report_file_path = %s, reference_result = %s WHERE {where_sql}",
                    [path, "compliant", *where_params],
                )
            else:
                c.execute(
                    f"UPDATE {reg.EVAL_RESULT_TABLE} SET reference_result = %s WHERE {where_sql}",
                    ["compliant", *where_params],
                )
    was_reconfirm = task.current_step > 3
    if was_reconfirm:
        _invalidate_step5_compare(task, reset_step4=True)
        task.current_step = 4
    else:
        task.current_step = next_step_after_confirm("confirm_step3")
    task.save(
        update_fields=[
            "current_step",
            "compare_result_json",
            "step4_indicators_confirmed",
            "step5_compare_confirmed",
            "dify_run_metadata_json",
            "updated_at",
        ]
    )
    save_snapshot(task, 3, body.model_dump())
    try:
        from apps.novelty.services.baseline_service import record_baseline_from_compliance_task

        record_baseline_from_compliance_task(task)
    except Exception:
        import logging

        logging.getLogger(__name__).exception(
            "baseline snapshot after confirm_step3 failed task_id=%s", task.id
        )
    return task


def _enterprise_indicators_from_task(task: ComplianceEvaluationTask) -> list[dict]:
    if task.parse_result_json and task.parse_result_json.get("indicators"):
        return list(task.parse_result_json.get("indicators") or [])
    return []


def _has_indicator_rows(std_code: str) -> bool:
    with connection.cursor() as c:
        return reg.has_gb_indicator_rows(c, std_code)


def _indicator_count_from_rows(rows: list[dict[str, Any]]) -> int:
    """从库行统计指标条数：specific_indicator_value 为 JSON 数组时取 len(array)。"""
    total = 0
    for row in rows:
        raw = row.get("specific_indicator_value")
        if raw is None:
            continue
        val = str(raw).strip()
        if not val or val == "[]":
            continue
        try:
            parsed = json.loads(val)
        except json.JSONDecodeError:
            total += 1
            continue
        if isinstance(parsed, list):
            total += len(parsed)
        else:
            total += 1
    return total


def _upsert_national_indicator_json(std_code: str, indexes_json: str) -> None:
    with connection.cursor() as c:
        reg.upsert_gb_indicator_json(c, std_code, indexes_json)


def _national_std_row(std_code: str) -> tuple[bool, str | None, str | None]:
    """(是否有可用文件, file_path, std_name)"""
    with connection.cursor() as c:
        override = reg.get_file_override_path(c, std_code)
        if override and str(override).strip():
            in_db, _pth, std_name = reg.l1_national_std_row(c, std_code)
            return True, override, std_name if in_db else None
        return reg.l1_national_std_row(c, std_code)


def _mock_dify2_fill(std_code: str) -> None:
    mock_indexes = [
        {
            "index_name": "Mock",
            "index_type": "其他",
            "index_content": {"说明": f"Mock解析指标({std_code})"},
        }
    ]
    _upsert_national_indicator_json(std_code, json.dumps(mock_indexes, ensure_ascii=False))


def _indexes_json_from_std_index_result(result_dict: dict[str, Any]) -> str:
    """从国标指标入库工作流 output 提取 indexes 数组并校验。"""
    indexes = list(result_dict.get("indexes") or [])
    if result_dict.get("index_name") or result_dict.get("index_content"):
        root_index = {k: v for k, v in result_dict.items() if k not in ("bz_id", "indexes")}
        indexes.append(root_index)
    if not indexes:
        raise DifyApiError("国标指标工作流返回空的 indexes 数组")
    return _validate_indexes_json_string(json.dumps(indexes, ensure_ascii=False))


def _dify2_fill_from_gb_file(task_id: int, std_code: str, gb_path: Path) -> dict[str, Any] | None:
    """解析国标文件并写入 indexes JSON；优先工作流②，回退 STD_INDEX 工作流，均未配置时 Mock。"""
    client = DifyClient()
    user = f"compliance-task-{task_id}-wf2"
    trace_id = f"compliance-wf2-{task_id}-{std_code}"

    if client.is_workflow2_configured():
        lines, meta = client.run_workflow_2_national_standard_indicators(
            gb_path,
            user=user,
            std_code=std_code,
            trace_id=trace_id,
        )
        if not lines:
            raise DifyApiError("工作流 ② 未返回可解析的 indexes 数组")
        indexes_json = (lines[0] or "").strip()
        if not indexes_json or indexes_json == "[]":
            raise DifyApiError("工作流 ② 返回空的 indexes 数组")
        _upsert_national_indicator_json(std_code, indexes_json)
        meta = dict(meta)
        meta["dify_source"] = "workflow2"
        return meta

    if client.is_std_index_configured():
        result_dict, meta = client.run_std_index_import_workflow(
            gb_path,
            user=user,
            trace_id=trace_id,
        )
        indexes_json = _indexes_json_from_std_index_result(result_dict)
        _upsert_national_indicator_json(std_code, indexes_json)
        meta = dict(meta)
        meta["dify_source"] = "std_index"
        meta["std_code"] = std_code
        meta["dify_bz_id"] = result_dict.get("bz_id")
        meta["indexes_count"] = len(json.loads(indexes_json))
        return meta

    _mock_dify2_fill(std_code)
    return None


@dataclass
class _OrchestrateSingleResult:
    std_code: str
    status: Literal["ready", "parsed_via_dify2", "missing_file", "pending_parse", "parse_failed"]
    indicator_rows: list[dict[str, Any]]
    missing: MissingGbFileItem | None
    std_name: str | None
    wf2_meta: dict[str, Any] | None
    invoked_dify2: bool
    error_message: str | None = None


def _fetch_national_indicator_rows(std_code: str) -> list[dict[str, Any]]:
    with connection.cursor() as c:
        return reg.fetch_gb_indicator_rows(c, std_code)


def _validate_indexes_json_string(raw: str) -> str:
    """校验 specific_indicator_value 为合法 indexes JSON 数组，返回规范化后的 JSON 字符串。"""
    text = (raw or "").strip()
    if not text:
        raise HttpError(422, "specific_indicator_value 必填")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise HttpError(422, f"specific_indicator_value 不是合法 JSON: {e}") from e
    if not isinstance(parsed, list):
        raise HttpError(422, "specific_indicator_value 必须是 JSON 数组")
    for i, item in enumerate(parsed):
        if not isinstance(item, dict):
            raise HttpError(422, f"indexes[{i}] 必须是对象")
        for key in ("index_name", "index_type", "index_content"):
            if key not in item:
                raise HttpError(422, f"indexes[{i}] 缺少字段 {key}")
    return json.dumps(parsed, ensure_ascii=False)


def get_national_indicators_by_std_code(
    task_id: int,
    std_code: str,
    request: Any | None = None,
) -> NationalIndicatorListOut:
    """查询单个国标号的指标明细（含 manual_review_status）。"""
    get_compliance_task_or_404(task_id, request)
    std_code = std_code.strip()
    if not std_code:
        raise HttpError(422, "std_code 必填")
    require_mysql()
    if not is_mysql():
        raise HttpError(503, REFERENCE_LATEST_REQUIRES_MYSQL_MSG)
    rows = _fetch_national_indicator_rows(std_code)
    if not rows:
        raise HttpError(404, f"未找到标准号 {std_code} 的国标指标记录")
    _, _, std_name = _national_std_row(std_code)
    return NationalIndicatorListOut(
        std_code=std_code,
        std_name=std_name,
        rows=[NationalIndicatorRowOut.model_validate(r) for r in rows],
    )


def review_national_indicator(
    task_id: int,
    body: NationalIndicatorReviewIn,
    request: Any | None = None,
) -> NationalIndicatorReviewOut:
    """人工审核国标指标（按 std_code 更新 manual_review_status）。"""
    get_compliance_task_or_404(task_id, request)
    std_code = body.std_code.strip()
    if not std_code:
        raise HttpError(422, "std_code 必填")
    require_mysql()
    if not is_mysql():
        raise HttpError(503, REFERENCE_LATEST_REQUIRES_MYSQL_MSG)
    with connection.cursor() as c:
        n = reg.update_gb_indicator_review(c, std_code, body.manual_review_status)
        if n == 0:
            raise HttpError(404, f"未找到标准号 {std_code} 的国标指标记录")
        rows = reg.fetch_gb_indicator_rows(c, std_code)
        row = (rows[0]["id"], rows[0]["std_code"], rows[0]["manual_review_status"]) if rows else None
    if not row:
        raise HttpError(404, f"未找到标准号 {std_code} 的国标指标记录")
    return NationalIndicatorReviewOut(
        id=row[0],
        std_code=row[1],
        manual_review_status=row[2],
    )


def save_national_indicator(
    task_id: int,
    body: NationalIndicatorSaveIn,
    request: Any | None = None,
) -> NationalIndicatorSaveOut:
    """保存用户编辑后的 indexes JSON；不修改 manual_review_status。"""
    get_compliance_task_or_404(task_id, request)
    std_code = body.std_code.strip()
    if not std_code:
        raise HttpError(422, "std_code 必填")
    indexes_json = _validate_indexes_json_string(body.specific_indicator_value)
    require_mysql()
    if not is_mysql():
        raise HttpError(503, REFERENCE_LATEST_REQUIRES_MYSQL_MSG)
    with connection.cursor() as c:
        n = reg.update_gb_indicator_value(c, std_code, indexes_json)
        if n == 0:
            raise HttpError(404, f"未找到标准号 {std_code} 的国标指标记录")
        rows = reg.fetch_gb_indicator_rows(c, std_code)
        row = (
            (rows[0]["id"], rows[0]["std_code"], rows[0]["specific_indicator_value"], rows[0]["manual_review_status"])
            if rows
            else None
        )
    if not row:
        raise HttpError(404, f"未找到标准号 {std_code} 的国标指标记录")
    return NationalIndicatorSaveOut(
        id=row[0],
        std_code=row[1],
        specific_indicator_value=row[2] or indexes_json,
        manual_review_status=row[3],
    )


def _orchestrate_single_std_code(
    task: ComplianceEvaluationTask,
    std_code: str,
    *,
    invoke_dify: bool = True,
) -> _OrchestrateSingleResult:
    """对单个标准号检查指标表 / 国标文件；invoke_dify=False 时仅扫描，不调用 Dify。"""
    if _has_indicator_rows(std_code):
        rows = _fetch_national_indicator_rows(std_code)
        _, _, std_name = _national_std_row(std_code)
        return _OrchestrateSingleResult(
            std_code=std_code,
            status="ready",
            indicator_rows=rows,
            missing=None,
            std_name=std_name,
            wf2_meta=None,
            invoked_dify2=False,
        )
    in_db, pth, std_name = _national_std_row(std_code)
    if not in_db:
        miss = MissingGbFileItem(std_code=std_code, std_name=std_name, reason="empty_std_file_path")
        return _OrchestrateSingleResult(
            std_code=std_code,
            status="missing_file",
            indicator_rows=[],
            missing=miss,
            std_name=std_name,
            wf2_meta=None,
            invoked_dify2=False,
        )
    if not pth or not str(pth).strip():
        miss = MissingGbFileItem(std_code=std_code, std_name=std_name, reason="empty_std_file_path")
        return _OrchestrateSingleResult(
            std_code=std_code,
            status="missing_file",
            indicator_rows=[],
            missing=miss,
            std_name=std_name,
            wf2_meta=None,
            invoked_dify2=False,
        )
    if not Path(str(pth)).is_file():
        miss = MissingGbFileItem(std_code=std_code, std_name=std_name, reason="file_not_found")
        return _OrchestrateSingleResult(
            std_code=std_code,
            status="missing_file",
            indicator_rows=[],
            missing=miss,
            std_name=std_name,
            wf2_meta=None,
            invoked_dify2=False,
        )
    if not invoke_dify:
        return _OrchestrateSingleResult(
            std_code=std_code,
            status="pending_parse",
            indicator_rows=[],
            missing=None,
            std_name=std_name,
            wf2_meta=None,
            invoked_dify2=False,
        )
    m = _dify2_fill_from_gb_file(task.id, std_code, Path(str(pth)))
    rows = _fetch_national_indicator_rows(std_code)
    return _OrchestrateSingleResult(
        std_code=std_code,
        status="parsed_via_dify2",
        indicator_rows=rows,
        missing=None,
        std_name=std_name,
        wf2_meta=m,
        invoked_dify2=True,
    )


def _unique_std_codes_from_compare_pairs(pairs: list[ComparePairIn]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for pair in pairs:
        for raw in (pair.publication_std_code, pair.latest_std_code):
            if raw is None:
                continue
            s = str(raw).strip()
            if not s or s in seen:
                continue
            seen.add(s)
            out.append(s)
    return out


def _split_compare_pairs_to_sides(
    pairs: list[ComparePairIn],
) -> tuple[list[str], list[str]]:
    """N 侧 publication 去重列表 + N+M latest 去重列表（M 行 publication 为 null 不入 publication）。"""
    pub_seen: set[str] = set()
    pub_out: list[str] = []
    lat_seen: set[str] = set()
    lat_out: list[str] = []
    for pair in pairs:
        lat_raw = pair.latest_std_code
        if lat_raw is not None:
            lat_s = str(lat_raw).strip()
            if lat_s and lat_s not in lat_seen:
                lat_seen.add(lat_s)
                lat_out.append(lat_s)
        pub_raw = pair.publication_std_code
        if pub_raw is None:
            continue
        pub_s = str(pub_raw).strip()
        if pub_s and pub_s not in pub_seen:
            pub_seen.add(pub_s)
            pub_out.append(pub_s)
    return pub_out, lat_out


def _subset_national_by_std_code(
    national: dict[str, list[dict[str, Any]]],
    std_codes: list[str],
) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for std in std_codes:
        if std in national and national[std]:
            out[std] = national[std]
    return out


def _resolve_compare_sides_from_bundle(bundle: dict[str, Any]) -> tuple[list[str], list[str]]:
    pub = bundle.get("publication_std_codes")
    lat = bundle.get("latest_std_codes")
    if not isinstance(pub, list) or not isinstance(lat, list):
        raise HttpError(
            422,
            "indicator_bundle_json 缺少 publication_std_codes / latest_std_codes，请重新 POST ensure",
        )
    return [str(x).strip() for x in pub if str(x).strip()], [str(x).strip() for x in lat if str(x).strip()]


def _build_workflow3_enterprise_data(bundle: dict[str, Any], subject_code: str | None) -> dict[str, Any]:
    pub_codes, _lat_codes = _resolve_compare_sides_from_bundle(bundle)
    national = bundle.get("national_by_std_code") or {}
    return {
        "qb_code": subject_code,
        "enterprise_indicators": bundle.get("enterprise_indicators") or [],
        "publication_side": {
            "label": "发布时引用的国标指标（N侧）",
            "std_codes": pub_codes,
            "national_by_std_code": _subset_national_by_std_code(national, pub_codes),
        },
    }


def _build_workflow3_reference_data(bundle: dict[str, Any]) -> dict[str, Any]:
    _pub_codes, lat_codes = _resolve_compare_sides_from_bundle(bundle)
    national = bundle.get("national_by_std_code") or {}
    return {
        "latest_side": {
            "label": "最新国标指标（N+M侧，含补充M）",
            "std_codes": lat_codes,
            "national_by_std_code": _subset_national_by_std_code(national, lat_codes),
        },
    }


def _truncate_workflow3_json_str(raw: str) -> str:
    max_chars = int(os.environ.get("DIFY_WORKFLOW3_MAX_INPUT_CHARS", "48000") or "48000")
    if len(raw) <= max_chars:
        return raw
    return raw[:max_chars] + "\n…[truncated]"


def _workflow3_payload_logging_enabled() -> bool:
    return os.environ.get("COMPLIANCE_WF3_LOG_PAYLOAD", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _log_workflow3_compare_payload(
    task_id: int,
    *,
    publication_std_codes: list[str],
    latest_std_codes: list[str],
    ent_obj: dict[str, Any],
    ref_obj: dict[str, Any],
    ent_json: str,
    ref_json: str,
) -> None:
    """联调时在运行服务的终端打印 Dify③ 拼装结果（默认开启，设 COMPLIANCE_WF3_LOG_PAYLOAD=0 关闭）。"""
    if not _workflow3_payload_logging_enabled():
        return
    ent_raw = json.dumps(ent_obj, ensure_ascii=False)
    ref_raw = json.dumps(ref_obj, ensure_ascii=False)
    summary = {
        "task_id": task_id,
        "publication_std_codes": publication_std_codes,
        "latest_std_codes": latest_std_codes,
        "enterprise_json_chars": len(ent_json),
        "reference_json_chars": len(ref_json),
        "enterprise_truncated": len(ent_json) < len(ent_raw),
        "reference_truncated": len(ref_json) < len(ref_raw),
    }
    lines = [
        "",
        "=" * 72,
        f"[compliance] Dify③ 工作流③ 入参 task_id={task_id}",
        json.dumps(summary, ensure_ascii=False, indent=2),
        "--- enterprise_data (拼装对象) ---",
        json.dumps(ent_obj, ensure_ascii=False, indent=2),
        "--- reference_data (拼装对象) ---",
        json.dumps(ref_obj, ensure_ascii=False, indent=2),
        "=" * 72,
        "",
    ]
    text = "\n".join(lines)
    logger.info("Dify③ compare payload task_id=%s", task_id)
    print(text, file=sys.stderr, flush=True)


def _run_orchestration_for_std_codes(
    task: ComplianceEvaluationTask,
    std_codes: list[str],
    *,
    dify_std_codes: set[str] | None = None,
) -> tuple[
    dict[str, list[dict[str, Any]]],
    list[MissingGbFileItem],
    list[str],
    list[StdCodeOrchestrationStatus],
    dict[str, Any],
]:
    national: dict[str, list[dict]] = {}
    missing: list[MissingGbFileItem] = []
    invoked: list[str] = []
    statuses: list[StdCodeOrchestrationStatus] = []
    wf2_runs: dict[str, Any] = {}
    dify_targets = set(dify_std_codes or ())
    for std in std_codes:
        try:
            one = _orchestrate_single_std_code(
                task,
                std,
                invoke_dify=std in dify_targets,
            )
        except DifyApiError as e:
            _, _, std_name = _national_std_row(std)
            one = _OrchestrateSingleResult(
                std_code=std,
                status="parse_failed",
                indicator_rows=[],
                missing=None,
                std_name=std_name,
                wf2_meta=None,
                invoked_dify2=False,
                error_message=str(e)[:500],
            )
        if one.missing is not None:
            missing.append(one.missing)
        if one.indicator_rows:
            national[std] = one.indicator_rows
        if one.invoked_dify2:
            invoked.append(std)
        if one.wf2_meta:
            wf2_runs[std] = one.wf2_meta
        statuses.append(
            StdCodeOrchestrationStatus(
                std_code=std,
                std_name=one.std_name,
                status=one.status,
                indicator_count=_indicator_count_from_rows(one.indicator_rows),
                reason=one.missing.reason if one.missing is not None else None,
                error_message=one.error_message,
            )
        )
    return national, missing, invoked, statuses, wf2_runs


def _persist_indicator_bundle(
    task: ComplianceEvaluationTask,
    out: Step4IndicatorsOut,
    wf2_runs: dict[str, Any],
    *,
    extra: dict[str, Any] | None = None,
) -> None:
    data = out.model_dump()
    if extra:
        data.update(extra)
    task.indicator_bundle_json = data
    upd = ["indicator_bundle_json", "updated_at"]
    if wf2_runs:
        prev = task.dify_run_metadata_json if isinstance(task.dify_run_metadata_json, dict) else {}
        prev = dict(prev)
        nest = dict(prev.get("workflow2") or {})
        nest.update(wf2_runs)
        prev["workflow2"] = nest
        task.dify_run_metadata_json = prev
        upd.insert(0, "dify_run_metadata_json")
    task.save(update_fields=upd)


def build_step4_indicators(task_id: int, request: Any | None = None) -> Step4IndicatorsOut:
    task = get_compliance_task_or_404(task_id, request)
    if task.current_step < 4:
        raise HttpError(422, "请先完成审核 3")
    require_mysql()
    if not is_mysql():
        out = Step4IndicatorsOut(
            subject_code=task.subject_code,
            enterprise_indicators=_enterprise_indicators_from_task(task),
            national_by_std_code={},
            missing_gb_files=[],
            dify2_invoked_std_codes=[],
        )
        _persist_indicator_bundle(task, out, {})
        return out
    latest_codes: list[str] = []
    if task.subject_code:
        latest_codes = list_latest_side_std_codes_for_task(task.subject_code)
    national, missing, invoked, _, wf2_runs = _run_orchestration_for_std_codes(
        task, latest_codes, dify_std_codes=set()
    )
    out = Step4IndicatorsOut(
        subject_code=task.subject_code,
        enterprise_indicators=_enterprise_indicators_from_task(task),
        national_by_std_code=national,
        missing_gb_files=missing,
        dify2_invoked_std_codes=invoked,
    )
    _persist_indicator_bundle(task, out, wf2_runs)
    return out


def ensure_step4_indicators(
    task_id: int,
    body: Step4IndicatorsEnsureIn,
    request: Any | None = None,
) -> Step4IndicatorsEnsureOut:
    """按前端 ③ 表格 compare_pairs 编排指标；不使用映射表全量 latest 扩展范围。"""
    task = get_compliance_task_or_404(task_id, request)
    if task.current_step < 4:
        raise HttpError(422, "请先完成审核 3")
    require_mysql()
    if not is_mysql():
        raise HttpError(503, REFERENCE_LATEST_REQUIRES_MYSQL_MSG)
    std_codes = _unique_std_codes_from_compare_pairs(body.compare_pairs)
    if not std_codes:
        raise HttpError(422, "暂无可编排的标准号")
    dify_std_codes: set[str] = set()
    if body.target_std_codes:
        allowed = set(std_codes)
        dify_std_codes = set()
        for raw in body.target_std_codes:
            code = str(raw).strip()
            if not code:
                continue
            if code not in allowed:
                raise HttpError(
                    422,
                    f"target_std_codes 中的 {code!r} 不在 compare_pairs 展开的标准号集合内",
                )
            dify_std_codes.add(code)
        if not dify_std_codes:
            raise HttpError(422, "target_std_codes 不能为空字符串")
    national, missing, invoked, statuses, wf2_runs = _run_orchestration_for_std_codes(
        task, std_codes, dify_std_codes=dify_std_codes
    )
    publication_std_codes, latest_std_codes = _split_compare_pairs_to_sides(body.compare_pairs)
    base = Step4IndicatorsOut(
        subject_code=task.subject_code,
        enterprise_indicators=_enterprise_indicators_from_task(task),
        national_by_std_code=national,
        missing_gb_files=missing,
        dify2_invoked_std_codes=invoked,
    )
    extra = {
        "compare_pairs": [p.model_dump() for p in body.compare_pairs],
        "publication_std_codes": publication_std_codes,
        "latest_std_codes": latest_std_codes,
        "std_statuses": [s.model_dump() for s in statuses],
    }
    _persist_indicator_bundle(task, base, wf2_runs, extra=extra)
    return Step4IndicatorsEnsureOut(
        **base.model_dump(),
        all_ready=all(s.status == "ready" for s in statuses) and bool(statuses),
        std_statuses=statuses,
        publication_std_codes=publication_std_codes,
        latest_std_codes=latest_std_codes,
    )


def _sync_task_std_status_after_file_change(
    task_id: int,
    std_code: str,
    *,
    status: Literal["pending_parse", "missing_file"],
    error_message: str | None = None,
    request: Any | None = None,
) -> None:
    """上传/清除国标文件后，同步任务 indicator_bundle 中该标准号的状态，便于前端刷新。"""
    task = get_compliance_task_or_404(task_id, request)
    bundle = dict(task.indicator_bundle_json or {})
    statuses = list(bundle.get("std_statuses") or [])
    updated = False
    for row in statuses:
        if (row.get("std_code") or "").strip() == std_code:
            row["status"] = status
            row["indicator_count"] = 0
            row["reason"] = "empty_std_file_path" if status == "missing_file" else None
            row["error_message"] = error_message
            updated = True
            break
    if not updated:
        _, _, std_name = _national_std_row(std_code)
        statuses.append(
            {
                "std_code": std_code,
                "std_name": std_name,
                "status": status,
                "indicator_count": 0,
                "reason": "empty_std_file_path" if status == "missing_file" else None,
                "error_message": error_message,
            }
        )
    bundle["std_statuses"] = statuses
    if status == "missing_file":
        bundle["missing_gb_files"] = [
            *(m for m in (bundle.get("missing_gb_files") or []) if m.get("std_code") != std_code),
            MissingGbFileItem(std_code=std_code, std_name=_national_std_row(std_code)[2], reason="empty_std_file_path").model_dump(),
        ]
    else:
        bundle["missing_gb_files"] = [
            m for m in (bundle.get("missing_gb_files") or []) if m.get("std_code") != std_code
        ]
    task.indicator_bundle_json = bundle
    task.save(update_fields=["indicator_bundle_json", "updated_at"])


def upload_national_standard_file(
    std_code: str,
    uploaded_file,
    *,
    task_id: int | None = None,
    request: Any | None = None,
) -> dict[str, Any]:
    std_code = std_code.strip()
    if not std_code:
        raise HttpError(422, "std_code 必填")
    require_mysql()
    base = Path(settings.MEDIA_ROOT) / "national_gb" / std_code.replace("/", "_")
    base.mkdir(parents=True, exist_ok=True)
    dest = base / uploaded_file.name
    had_path = False
    if is_mysql():
        with connection.cursor() as c:
            existing = reg.get_file_override_path(c, std_code)
            if not existing:
                in_db, pth, _ = reg.l1_national_std_row(c, std_code)
                existing = pth if in_db else None
            had_path = bool(existing and str(existing).strip())
    with dest.open("wb") as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)
    rel = str(dest)
    indicators_cleared = False
    if is_mysql():
        with connection.cursor() as c:
            reg.upsert_file_override(c, std_code, rel)
            c.execute(
                f"""
                DELETE FROM {reg.INDICATOR_TABLE}
                WHERE subject_code = %s AND catalog_std_type_no = %s
                """,
                [std_code, reg.GB_CATALOG_TYPE_NO],
            )
            indicators_cleared = c.rowcount > 0
    if task_id is not None:
        _sync_task_std_status_after_file_change(
            task_id, std_code, status="pending_parse", error_message=None, request=request
        )
    return {
        "std_code": std_code,
        "std_file_path": rel,
        "replaced": had_path,
        "indicators_cleared": indicators_cleared,
        "message": "文件已保存，可再次上传以更换文件；请调用 ensure 并传入 target_std_codes 解析",
    }


def clear_national_standard_file(
    std_code: str,
    *,
    task_id: int | None = None,
    request: Any | None = None,
) -> dict[str, Any]:
    """清除国标文件路径与指标，恢复为缺文件状态（可重新上传）。"""
    std_code = std_code.strip()
    if not std_code:
        raise HttpError(422, "std_code 必填")
    require_mysql()
    if is_mysql():
        with connection.cursor() as c:
            reg.clear_file_override(c, std_code)
    if task_id is not None:
        _sync_task_std_status_after_file_change(
            task_id, std_code, status="missing_file", error_message=None, request=request
        )
    return {
        "std_code": std_code,
        "cleared": True,
        "message": "已清除文件路径，可重新上传其他 PDF",
    }


def confirm_step4(task_id: int, request: Any | None = None) -> ComplianceEvaluationTask:
    task = get_compliance_task_or_404(task_id, request)
    try:
        assert_confirm_step4(_task_view(task))
    except ValueError as e:
        raise HttpError(422, str(e)) from e
    bundle = task.indicator_bundle_json or {}
    miss = bundle.get("missing_gb_files") or []
    if miss:
        raise HttpError(422, json.dumps({"missing_gb_files": miss}, ensure_ascii=False))
    blocked = [
        s.get("std_code")
        for s in (bundle.get("std_statuses") or [])
        if s.get("status") in ("pending_parse", "parse_failed")
    ]
    if blocked:
        raise HttpError(
            422,
            f"尚有国标未完成指标解析，请先解析成功或重新上传文件后再确认：{', '.join(str(x) for x in blocked if x)}",
        )
    task.step4_indicators_confirmed = True
    was_reconfirm = task.current_step > 4
    if was_reconfirm:
        _invalidate_step5_compare(task, reset_step4=False)
        task.current_step = 5
    else:
        task.current_step = next_step_after_confirm("confirm_step4")
    task.save(
        update_fields=[
            "step4_indicators_confirmed",
            "current_step",
            "compare_result_json",
            "step5_compare_confirmed",
            "dify_run_metadata_json",
            "updated_at",
        ]
    )
    save_snapshot(task, 4, {"confirmed": True})
    return task


def get_step5_compare_result(task_id: int, request: Any | None = None) -> Step5CompareOut:
    """只读已持久化的对比结果，不调用 Dify③。"""
    task = get_compliance_task_or_404(task_id, request)
    if not _has_compare_result(task):
        raise HttpError(404, "尚未生成对比结果，请先构建技术指标对比")
    assert isinstance(task.compare_result_json, dict)
    return Step5CompareOut(compare_result=task.compare_result_json)


def run_step5_compare(
    task_id: int,
    request: Any | None = None,
    *,
    compare_pairs: list[ComparePairIn] | None = None,
) -> Step5CompareOut:
    if compare_pairs:
        ensure_step4_indicators(
            task_id,
            Step4IndicatorsEnsureIn(compare_pairs=compare_pairs),
            request,
        )
    task = get_compliance_task_or_404(task_id, request)
    if task.current_step < 5:
        raise HttpError(422, "请先完成审核 4 并进入步骤 5")
    if not task.step4_indicators_confirmed:
        raise HttpError(422, "须先完成审核 4")

    bundle = task.indicator_bundle_json or {}
    if not bundle:
        raise HttpError(422, "请先执行指标编排（POST step/4/indicators/ensure）")
    miss = bundle.get("missing_gb_files") or []
    if miss:
        raise HttpError(422, json.dumps({"missing_gb_files": miss}, ensure_ascii=False))
    pub_codes, lat_codes = _resolve_compare_sides_from_bundle(bundle)
    if not lat_codes:
        raise HttpError(422, "缺少 latest_std_codes，请重新执行 ensure")

    client = DifyClient()
    if client.is_workflow3_configured():
        ent_obj = _build_workflow3_enterprise_data(bundle, task.subject_code)
        ref_obj = _build_workflow3_reference_data(bundle)
        ent = _truncate_workflow3_json_str(json.dumps(ent_obj, ensure_ascii=False))
        ref = _truncate_workflow3_json_str(json.dumps(ref_obj, ensure_ascii=False))
        _log_workflow3_compare_payload(
            task_id,
            publication_std_codes=pub_codes,
            latest_std_codes=lat_codes,
            ent_obj=ent_obj,
            ref_obj=ref_obj,
            ent_json=ent,
            ref_json=ref,
        )
        try:
            payload, meta3 = client.run_workflow_3_index_compare(
                enterprise_data=ent,
                reference_data=ref,
                user=f"compliance-task-{task_id}",
                trace_id=f"compliance-wf3-{task_id}",
            )
        except DifyApiError as e:
            raise HttpError(502, str(e)) from e
        prev = _stamp_compare_saved_metadata(task)
        prev["workflow3"] = meta3
        task.dify_run_metadata_json = prev
        task.compare_result_json = payload
        task.save(update_fields=["compare_result_json", "dify_run_metadata_json", "updated_at"])
        return Step5CompareOut(compare_result=payload)

    payload = {
        "summary": "Mock 指标对比结论（未配置 DIFY_WORKFLOW3_API_KEY）",
        "details": [{"pair": "企标 vs 国标", "result": "示例一致项"}],
        "markdown": "",
    }
    task.dify_run_metadata_json = _stamp_compare_saved_metadata(task)
    task.compare_result_json = payload
    task.save(update_fields=["compare_result_json", "dify_run_metadata_json", "updated_at"])
    return Step5CompareOut(compare_result=payload)


def confirm_step5(task_id: int, request: Any | None = None) -> ComplianceEvaluationTask:
    task = get_compliance_task_or_404(task_id, request)
    try:
        assert_confirm_step5(_task_view(task))
    except ValueError as e:
        raise HttpError(422, str(e)) from e
    if not task.compare_result_json:
        raise HttpError(422, "请先拉取或生成对比结果")
    require_mysql()
    from apps.compliance.services.certificate_service import write_indicator_certificate_placeholder

    path = write_indicator_certificate_placeholder(task)
    if is_mysql():
        _ensure_evaluation_result_row(task)
        where_sql, where_params = _er_where_sql_params(task)
        if path:
            with connection.cursor() as c:
                c.execute(
                    f"""
                    UPDATE {reg.EVAL_RESULT_TABLE} SET indicator_result_report_file_path = %s,
                        indicator_result = %s, overall_result = %s
                    WHERE {where_sql}
                    """,
                    [path, "compliant", "compliant", *where_params],
                )
        else:
            with connection.cursor() as c:
                c.execute(
                    f"""
                    UPDATE {reg.EVAL_RESULT_TABLE} SET indicator_result = %s, overall_result = %s
                    WHERE {where_sql}
                    """,
                    ["compliant", "compliant", *where_params],
                )
    task.step5_compare_confirmed = True
    task.current_step = next_step_after_confirm("confirm_step5")
    task.save(update_fields=["step5_compare_confirmed", "current_step", "updated_at"])
    save_snapshot(task, 5, {"confirmed": True})
    _ensure_compliance_report(task)
    return task


def _fetch_evaluation_result(task: ComplianceEvaluationTask) -> dict[str, Any] | None:
    if not (task.subject_code or "").strip() or not is_mysql():
        return None
    where_sql, where_params = _er_where_sql_params(task)
    with connection.cursor() as c:
        c.execute(
            f"""
            SELECT descriptive_result, reference_result, indicator_result, overall_result,
                   descriptive_result_report_file_path, reference_result_report_file_path,
                   indicator_result_report_file_path, certificate_file_path
            FROM {reg.EVAL_RESULT_TABLE} WHERE {where_sql} LIMIT 1
            """,
            where_params,
        )
        row = c.fetchone()
    if not row:
        return None
    keys = [
        "descriptive_result",
        "reference_result",
        "indicator_result",
        "overall_result",
        "descriptive_result_report_file_path",
        "reference_result_report_file_path",
        "indicator_result_report_file_path",
        "certificate_file_path",
    ]
    out = dict(zip(keys, row))
    out["subject_code"] = (task.subject_code or "").strip() or None
    return out


def _normalize_artifact_rel_path(rel: str) -> str:
    return rel.replace("\\", "/")


def _ensure_compliance_report(task: ComplianceEvaluationTask, er: dict[str, Any] | None = None) -> str | None:
    if task.current_step < 6:
        return None
    from apps.compliance.services.report_service import generate_compliance_report

    if er is None:
        er = _fetch_evaluation_result(task)
    return generate_compliance_report(task, er)


def get_summary(task_id: int, request: Any | None = None) -> SummaryOut:
    task = get_compliance_task_or_404(task_id, request)
    require_mysql()
    er = _fetch_evaluation_result(task)
    report_path: str | None = None
    if task.current_step >= 6:
        report_path = _ensure_compliance_report(task, er)
    arts = list_artifacts(task)
    return SummaryOut(
        task=task_to_out(task).model_dump(),
        evaluation_result=er,
        artifacts=arts,
        report_path=report_path,
    )


def _artifact_content_type(path: Path) -> str | None:
    import mimetypes

    guessed, _ = mimetypes.guess_type(path.name)
    return guessed


def list_artifacts(task: ComplianceEvaluationTask | None = None, task_id: int | None = None, request: Any | None = None) -> list[ArtifactItem]:
    if task is None and task_id is not None:
        task = get_compliance_task_or_404(task_id, request)
    assert task is not None
    base_media = Path(settings.MEDIA_ROOT)
    items: list[ArtifactItem] = []

    if task.uploaded_file_path:
        upload_path = Path(task.uploaded_file_path)
        if upload_path.is_file():
            try:
                rel = _normalize_artifact_rel_path(str(upload_path.resolve().relative_to(base_media.resolve())))
            except ValueError:
                rel = _normalize_artifact_rel_path(str(upload_path))
            items.append(
                ArtifactItem(
                    kind="uploaded_qb",
                    label=task.uploaded_file_name or upload_path.name,
                    path=rel,
                    content_type=_artifact_content_type(upload_path),
                )
            )

    root = base_media / "compliance_certs" / str(task.id)
    if root.is_dir():
        for p in sorted(root.glob("**/*")):
            if not p.is_file():
                continue
            rel = _normalize_artifact_rel_path(str(p.relative_to(base_media)))
            if p.name == "compliance_evaluation_report.html":
                items.append(
                    ArtifactItem(
                        kind="report",
                        label="合规评价汇总报告（HTML）",
                        path=rel,
                        content_type=_artifact_content_type(p),
                    )
                )
            else:
                kind = "compare_cert_pdf" if "indicator" in p.name.lower() or "对比" in p.name else "other"
                items.append(
                    ArtifactItem(
                        kind=kind,
                        label=p.name,
                        path=rel,
                        content_type=_artifact_content_type(p),
                    )
                )
    items.sort(key=lambda a: (0 if a.kind == "report" else 1, a.path))
    return items


def artifact_file_path_for_task(task_id: int, rel_path: str, request: Any | None = None) -> Path:
    get_compliance_task_or_404(task_id, request)
    rel_path = _normalize_artifact_rel_path(rel_path)
    task = get_compliance_task_or_404(task_id, request)
    base = Path(settings.MEDIA_ROOT).resolve()
    target = (base / rel_path).resolve()
    if not str(target).startswith(str(base)):
        raise HttpError(400, "非法路径")
    allowed_roots = [
        (base / "compliance_certs" / str(task_id)).resolve(),
        (base / "compliance_uploads" / str(task_id)).resolve(),
    ]
    if task.uploaded_file_path:
        try:
            allowed_roots.append(Path(task.uploaded_file_path).resolve())
        except OSError:
            pass
    if not any(str(target).startswith(str(root)) for root in allowed_roots):
        raise HttpError(403, "仅允许下载本任务目录下的制品")
    return target
