"""查新任务 CRUD 与状态机。"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from ninja.errors import HttpError

from apps.compliance.db import require_mysql
from apps.novelty.models import NoveltySearchTask
from apps.novelty.services.compare_service import build_compare_rows, compute_task_conclusion
from apps.novelty.services.history_aggregator import find_history_for_qb_code

EMPTY_HISTORY_MSG = "该企标号在系统中无合规评价或批量规范性引用记录，无法汇聚引用（empty_history）"


def _auth_subject(request: Any | None) -> str | None:
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


def _assert_task_access(task: NoveltySearchTask, request: Any | None) -> None:
    sub = _auth_subject(request)
    if sub is None:
        return
    owner = (task.created_by or "").strip()
    if not owner:
        return
    if owner != sub:
        raise HttpError(403, "无权访问该查新任务")


def get_task_or_404(task_id: int, request: Any | None = None) -> NoveltySearchTask:
    task = NoveltySearchTask.objects.filter(pk=task_id).first()
    if not task:
        raise HttpError(404, "查新任务不存在")
    _assert_task_access(task, request)
    return task


def delete_task_for_request(task_id: int, request: Any | None = None) -> None:
    """
    删除单条查新任务记录（历史查询记录）。

    - 删除 ``novelty_search_task`` 表对应行；
    - 尽量删除 ``MEDIA_ROOT/novelty_search/{task_id}/`` 下上传文件；
    - **不**删除 ``novelty_reference_baseline_snapshot``（基线为企标+引用维度，多任务共享）。
    """
    task = get_task_or_404(task_id, request)
    pk = task.id
    upload_dir = Path(settings.MEDIA_ROOT) / "novelty_search" / str(pk)
    task.delete()
    if upload_dir.is_dir():
        shutil.rmtree(upload_dir, ignore_errors=True)


def _default_title(subject_code: str) -> str:
    today = timezone.localdate().strftime("%Y-%m-%d")
    return f"{subject_code.strip()} {today}"


def _apply_history_to_task(task: NoveltySearchTask, history: Any) -> None:
    task.reference_sheet_json = list(history.reference_sheet_rows)
    task.compare_total = len(history.reference_sheet_rows)
    task.compare_done = 0
    task.compare_rows_json = []
    task.indicators_json = history.indicators
    task.source_evaluations_json = history.source_evaluations
    task.status = NoveltySearchTask.Status.PENDING_CONFIRM
    task.error_summary = None


def create_task(
    *,
    request: Any | None,
    subject_code: str,
    source: str = "upload",
    file: Any | None = None,
    file_name: str | None = None,
) -> NoveltySearchTask:
    require_mysql()
    code = (subject_code or "").strip()
    if not code:
        raise HttpError(400, "subject_code 必填")

    history = find_history_for_qb_code(code)
    if history is None:
        raise HttpError(422, EMPTY_HISTORY_MSG)

    sub = _auth_subject(request)
    task = NoveltySearchTask.objects.create(
        title=_default_title(code),
        subject_code=code,
        status=NoveltySearchTask.Status.LOADING_HISTORY,
        source=source
        if source in {c.value for c in NoveltySearchTask.Source}
        else NoveltySearchTask.Source.UPLOAD,
        created_by=sub,
    )

    if file is not None:
        media_root = Path(settings.MEDIA_ROOT)
        dest_dir = media_root / "novelty_search" / str(task.id)
        dest_dir.mkdir(parents=True, exist_ok=True)
        raw_name = file_name or getattr(file, "name", None) or "upload.pdf"
        from django.utils.text import get_valid_filename

        safe = get_valid_filename(raw_name) or "upload.pdf"
        dest = dest_dir / safe
        with dest.open("wb") as out_f:
            for chunk in file.chunks():
                out_f.write(chunk)
        task.file_name = raw_name
        task.uploaded_file_path = str(dest.relative_to(media_root))

    _apply_history_to_task(task, history)
    task.save()
    return task


def list_tasks(
    *,
    request: Any | None,
    page: int = 1,
    page_size: int = 20,
    subject_code: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    qs = NoveltySearchTask.objects.all().order_by("-id")
    sub = _auth_subject(request)
    if sub is not None:
        qs = qs.filter(created_by=sub)
    if subject_code and subject_code.strip():
        qs = qs.filter(subject_code__icontains=subject_code.strip())
    if status and status.strip():
        qs = qs.filter(status=status.strip())
    if keyword and keyword.strip():
        qs = qs.filter(Q(title__icontains=keyword.strip()) | Q(subject_code__icontains=keyword.strip()))
    total = qs.count()
    start = (page - 1) * page_size
    rows = list(qs[start : start + page_size])
    return {"results": rows, "total": total, "page": page, "page_size": page_size}


def patch_reference_sheet(
    task_id: int,
    rows: list[dict[str, Any]],
    request: Any | None = None,
) -> NoveltySearchTask:
    task = get_task_or_404(task_id, request)
    if task.status != NoveltySearchTask.Status.PENDING_CONFIRM:
        raise HttpError(422, "当前任务状态不允许编辑专用表（invalid_status）")
    if task.sheet_confirmed:
        raise HttpError(422, "专用表已确认，不可再编辑（sheet_not_confirmed）")
    clean: list[dict[str, Any]] = []
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            raise HttpError(422, f"rows[{i}] 须为对象")
        rid = str(row.get("id") or i + 1)
        clean.append(
            {
                "id": rid,
                "std_no": (row.get("std_no") or "").strip(),
                "std_name": (row.get("std_name") or "").strip(),
                "tech_fragment": row.get("tech_fragment"),
                "remark": row.get("remark") or "",
            }
        )
    task.reference_sheet_json = clean
    task.compare_total = len(clean)
    task.save(update_fields=["reference_sheet_json", "compare_total", "updated_at"])
    return task


def confirm_sheet(
    task_id: int,
    rows: list[dict[str, Any]] | None,
    request: Any | None = None,
) -> NoveltySearchTask:
    require_mysql()
    task = get_task_or_404(task_id, request)
    if task.status != NoveltySearchTask.Status.PENDING_CONFIRM:
        raise HttpError(422, "当前任务状态不允许确认专用表（invalid_status）")
    if task.sheet_confirmed:
        raise HttpError(422, "专用表已确认（sheet_not_confirmed）")

    if rows is not None:
        task = patch_reference_sheet(task_id, rows, request)

    sheet = task.reference_sheet_json if isinstance(task.reference_sheet_json, list) else []
    if not sheet:
        raise HttpError(422, "专用表为空，无法比对")

    history = find_history_for_qb_code(task.subject_code)
    full_map = history.full_std_by_ref_norm if history else {}

    task.sheet_confirmed = True
    task.status = NoveltySearchTask.Status.COMPARING
    task.save(update_fields=["sheet_confirmed", "status", "updated_at"])

    compare_rows = build_compare_rows(sheet, task.subject_code, aggregated_full_by_ref=full_map)
    task_conclusion, task_summary = compute_task_conclusion(compare_rows)

    task.compare_rows_json = compare_rows
    task.compare_done = len(compare_rows)
    task.compare_total = len(compare_rows)
    task.task_conclusion = task_conclusion
    task.task_summary = task_summary
    task.status = NoveltySearchTask.Status.COMPLETED
    task.save(
        update_fields=[
            "compare_rows_json",
            "compare_done",
            "compare_total",
            "task_conclusion",
            "task_summary",
            "status",
            "updated_at",
        ]
    )
    return task


def retry_task(task_id: int, request: Any | None = None) -> NoveltySearchTask:
    require_mysql()
    task = get_task_or_404(task_id, request)
    if task.status != NoveltySearchTask.Status.FAILED:
        raise HttpError(422, "仅失败任务可重试（invalid_status）")

    history = find_history_for_qb_code(task.subject_code)
    if history is None:
        task.status = NoveltySearchTask.Status.FAILED
        task.error_summary = EMPTY_HISTORY_MSG
        task.save(update_fields=["status", "error_summary", "updated_at"])
        raise HttpError(422, EMPTY_HISTORY_MSG)

    task.status = NoveltySearchTask.Status.LOADING_HISTORY
    task.sheet_confirmed = False
    task.task_conclusion = None
    task.task_summary = None
    task.error_summary = None
    task.compare_done = 0
    _apply_history_to_task(task, history)
    task.save()
    return task
