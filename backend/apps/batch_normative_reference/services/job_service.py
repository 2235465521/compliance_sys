"""批量规范性引用评价：创建任务、序列化、访问控制。"""

from __future__ import annotations

import os
import shutil
import threading
from pathlib import Path
from typing import Any

from django.conf import settings
from django.utils.text import get_valid_filename
from ninja.errors import HttpError

from apps.batch_normative_reference.models import (
    BatchNormativeReferenceItem,
    BatchNormativeReferenceJob,
)
from apps.batch_normative_reference.enterprise_display import enterprise_fields_from_parse_result
from apps.batch_normative_reference.tasks import process_batch_normative_reference_job
from apps.compliance.db import require_mysql
from apps.engine.dify_client import DifyClient
from apps.standards.services.reference_bundle import (
    attach_normative_reference_std_names,
    compute_normative_reference_file_outcome,
    enrich_normative_reference_row,
)

BATCH_REF_MISSING_DIFY_MSG = (
    "批量规范性引用评价未配置 Dify：请设置 BATCH_NORMATIVE_REF_DIFY_API_KEY，"
    "以及 BATCH_NORMATIVE_REF_DIFY_API_BASE（或共用 DIFY_API_BASE）与 BATCH_NORMATIVE_REF_FILES_INPUT_KEY（默认 QB_file）。"
)


def _enqueue_process_job(job_id: int) -> None:
    """投递 Celery；本地未启 Worker 时改后台线程执行（与国标指标批量入库一致）。"""
    use_thread = getattr(settings, "BATCH_NORMATIVE_REF_USE_THREAD", False)
    if use_thread:
        threading.Thread(
            target=_run_process_job_in_thread,
            args=(job_id,),
            daemon=True,
            name=f"batch-normative-ref-{job_id}",
        ).start()
        return
    try:
        process_batch_normative_reference_job.delay(job_id)
    except Exception:
        threading.Thread(
            target=_run_process_job_in_thread,
            args=(job_id,),
            daemon=True,
            name=f"batch-normative-ref-fallback-{job_id}",
        ).start()


def _run_process_job_in_thread(job_id: int) -> None:
    import logging

    from django.db import close_old_connections

    close_old_connections()
    try:
        process_batch_normative_reference_job(job_id)
    except Exception:
        logging.getLogger(__name__).exception(
            "batch normative ref background thread failed job_id=%s", job_id
        )
    finally:
        close_old_connections()


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


def _assert_job_access(job: BatchNormativeReferenceJob, request: Any | None) -> None:
    sub = _auth_subject(request)
    if sub is None:
        return
    owner = (job.created_by or "").strip()
    if not owner:
        return
    if owner != sub:
        raise HttpError(403, "无权访问该批量任务")


def get_job_or_404(job_id: int, request: Any | None) -> BatchNormativeReferenceJob:
    job = BatchNormativeReferenceJob.objects.prefetch_related("items").filter(pk=job_id).first()
    if not job:
        raise HttpError(404, "批量任务不存在")
    _assert_job_access(job, request)
    return job


def delete_job_for_request(job_id: int, request: Any | None) -> None:
    """
    删除批量任务及其子项（数据库级联）；并尽量删除本任务上传目录
    ``MEDIA_ROOT/batch_normative_reference/{job_id}/``。
    """
    job = get_job_or_404(job_id, request)
    pk = job.id
    upload_dir = Path(settings.MEDIA_ROOT) / "batch_normative_reference" / str(pk)
    job.delete()
    if upload_dir.is_dir():
        shutil.rmtree(upload_dir, ignore_errors=True)


def item_to_out(it: BatchNormativeReferenceItem) -> dict[str, Any]:
    meta = enterprise_fields_from_parse_result(it.parse_result_json if isinstance(it.parse_result_json, dict) else None)
    refs_out: list[dict[str, Any]] | None = None
    file_out: str | None = None
    if it.status == BatchNormativeReferenceItem.Status.COMPLETED:
        raw_refs = it.reference_resolution_json
        if isinstance(raw_refs, list):
            refs_out = []
            for row in raw_refs:
                if isinstance(row, dict):
                    d = dict(row)
                    enrich_normative_reference_row(d)
                    refs_out.append(d)
                else:
                    refs_out.append(row)  # type: ignore[arg-type]
            attach_normative_reference_std_names(refs_out)
            file_out = compute_normative_reference_file_outcome(refs_out)
        else:
            refs_out = None
            file_out = None
    return {
        "id": it.id,
        "sort_order": it.sort_order,
        "original_filename": it.original_filename,
        "status": it.status,
        "error_message": it.error_message,
        **meta,
        "references_resolved": refs_out,
        "file_compliance_outcome": file_out,
    }


def job_summary_to_out(job: BatchNormativeReferenceJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "status": job.status,
        "label": job.label,
        "total_items": job.total_items,
        "completed_items": job.completed_items,
        "failed_items": job.failed_items,
        "error_summary": job.error_summary,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


def list_jobs_for_request(request: Any | None, *, page: int, page_size: int) -> dict[str, Any]:
    try:
        page = int(page)
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(page_size)
    except (TypeError, ValueError):
        page_size = 20
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    qs = BatchNormativeReferenceJob.objects.order_by("-id")
    sub = _auth_subject(request)
    if sub is not None:
        qs = qs.filter(created_by=sub)
    total = qs.count()
    start = (page - 1) * page_size
    rows = list(qs[start : start + page_size])
    results = [job_summary_to_out(j) for j in rows]
    return {
        "results": results,
        "count": total,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def patch_item_references_resolved(
    job_id: int,
    item_id: int,
    request: Any | None,
    references_resolved: list[Any],
) -> BatchNormativeReferenceItem:
    job = get_job_or_404(job_id, request)
    it = job.items.filter(pk=item_id).first()
    if not it:
        raise HttpError(404, "子项不存在")
    if it.status != BatchNormativeReferenceItem.Status.COMPLETED:
        raise HttpError(422, "仅 completed 状态的子项可编辑 references_resolved（查新完成后）")
    if not isinstance(references_resolved, list):
        raise HttpError(422, "references_resolved 须为 JSON 数组")
    clean: list[dict[str, Any]] = []
    for i, row in enumerate(references_resolved):
        if not isinstance(row, dict):
            raise HttpError(422, f"references_resolved[{i}] 须为对象")
        d = dict(row)
        enrich_normative_reference_row(d)
        clean.append(d)
    it.reference_resolution_json = clean
    it.save(update_fields=["reference_resolution_json", "updated_at"])
    try:
        from apps.novelty.services.baseline_service import record_baseline_from_batch_item

        record_baseline_from_batch_item(it)
    except Exception:
        import logging

        logging.getLogger(__name__).exception(
            "baseline snapshot after patch references failed item_id=%s", it.id
        )
    return it


def _max_batch_files() -> int:
    raw = (os.environ.get("BATCH_NORMATIVE_REF_MAX_FILES", "100") or "100").strip()
    try:
        n = int(raw)
    except ValueError:
        return 100
    return max(1, min(n, 100))


def create_job_from_uploads(
    *,
    request: Any | None,
    files: list[Any],
    label: str | None,
) -> BatchNormativeReferenceJob:
    if not files:
        raise HttpError(422, "请至少上传一个企标文件（multipart 字段名：files）")

    max_n = _max_batch_files()
    if len(files) > max_n:
        raise HttpError(422, f"单次最多上传 {max_n} 个文件")

    client = DifyClient()
    if not client.is_batch_normative_ref_configured():
        raise HttpError(503, BATCH_REF_MISSING_DIFY_MSG)

    require_mysql()

    sub = _auth_subject(request)
    job = BatchNormativeReferenceJob.objects.create(
        status=BatchNormativeReferenceJob.Status.PENDING,
        label=(label or "").strip() or None,
        total_items=len(files),
        created_by=sub,
    )

    media_root = Path(settings.MEDIA_ROOT)
    base_dir = media_root / "batch_normative_reference" / str(job.id)
    base_dir.mkdir(parents=True, exist_ok=True)

    for idx, uf in enumerate(files):
        raw_name = getattr(uf, "name", None) or f"upload_{idx}"
        safe = get_valid_filename(raw_name) or f"file_{idx}"
        dest = base_dir / f"{idx:04d}_{safe}"
        with dest.open("wb") as out_f:
            for chunk in uf.chunks():
                out_f.write(chunk)
        BatchNormativeReferenceItem.objects.create(
            job=job,
            sort_order=idx,
            original_filename=raw_name,
            stored_file_path=str(dest.resolve()),
            status=BatchNormativeReferenceItem.Status.PENDING,
        )

    _enqueue_process_job(job.id)
    return job


def job_to_out(job: BatchNormativeReferenceJob) -> dict[str, Any]:
    items_out: list[dict[str, Any]] = []
    for it in job.items.all():
        items_out.append(item_to_out(it))
    job_company: str | None = None
    for row in items_out:
        cn = row.get("company_name")
        if isinstance(cn, str) and cn.strip():
            job_company = cn.strip()
            break
    return {
        "id": job.id,
        "status": job.status,
        "label": job.label,
        "company_name": job_company,
        "total_items": job.total_items,
        "completed_items": job.completed_items,
        "failed_items": job.failed_items,
        "error_summary": job.error_summary,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "items": items_out,
    }
