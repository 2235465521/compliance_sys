"""国标主表维护与指标批量入库异步任务。"""

from __future__ import annotations

import logging
from pathlib import Path

from celery import shared_task

from apps.standards.services.standard_status_sync import sync_national_standard_status
from django.db.models import Count, Q
from django.utils import timezone

from apps.engine.dify_client import DifyApiError, DifyClient
from apps.standards.models import (
    NationalStandardIndexImportItem,
    NationalStandardIndexImportJob,
)
from apps.standards.services.std_index_import import (
    STD_INDEX_MISSING_DIFY_MSG,
    _extract_gb_code_from_text,
    import_std_index_from_upload,
)

logger = logging.getLogger(__name__)


class _StoredUpload:
    """从批次持久化路径模拟 UploadedFile。"""

    def __init__(self, path: Path, name: str) -> None:
        self.name = name
        self._path = path

    def chunks(self, chunk_size: int = 65536):
        with self._path.open("rb") as f:
            while True:
                data = f.read(chunk_size)
                if not data:
                    break
                yield data


def _refresh_job_status(job_id: int) -> None:
    agg = NationalStandardIndexImportItem.objects.filter(job_id=job_id).aggregate(
        total=Count("id"),
        done=Count(
            "id",
            filter=Q(
                status__in=[
                    NationalStandardIndexImportItem.Status.COMPLETED,
                    NationalStandardIndexImportItem.Status.FAILED,
                    NationalStandardIndexImportItem.Status.SKIPPED,
                ]
            ),
        ),
        failed=Count(
            "id",
            filter=Q(
                status__in=[
                    NationalStandardIndexImportItem.Status.FAILED,
                    NationalStandardIndexImportItem.Status.SKIPPED,
                ]
            ),
        ),
        completed=Count(
            "id",
            filter=Q(status=NationalStandardIndexImportItem.Status.COMPLETED),
        ),
    )
    all_done = agg["done"] >= agg["total"] > 0
    new_status = (
        NationalStandardIndexImportJob.Status.COMPLETED
        if all_done
        else NationalStandardIndexImportJob.Status.PROCESSING
    )
    NationalStandardIndexImportJob.objects.filter(pk=job_id).update(
        status=new_status,
        total_items=agg["total"],
        completed_items=agg["completed"],
        failed_items=agg["failed"],
        updated_at=timezone.now(),
    )


def _process_single_item(item: NationalStandardIndexImportItem) -> None:
    path = Path(item.stored_file_path)
    item.status = NationalStandardIndexImportItem.Status.RUNNING
    item.error_message = None
    item.save(update_fields=["status", "error_message", "updated_at"])

    try:
        if not path.is_file():
            raise FileNotFoundError(f"上传文件不存在: {path}")

        uploaded = _StoredUpload(path, item.original_filename)
        hint = _extract_gb_code_from_text(item.original_filename)
        result = import_std_index_from_upload(
            uploaded, replace=True, std_code_hint=hint  # type: ignore[arg-type]
        )

        bz_id = result.get("bz_id", "")
        imported = result.get("imported", 0)
        warning = result.get("warning")
        indexes_count = result.get("indexes_count", 0)

        if warning and "已存在" in warning:
            item.status = NationalStandardIndexImportItem.Status.SKIPPED
            item.error_message = warning
        elif imported == 0:
            item.status = NationalStandardIndexImportItem.Status.FAILED
            item.error_message = warning or "国标号未识别或不在库中，指标未入库"
        else:
            item.status = NationalStandardIndexImportItem.Status.COMPLETED
            item.manual_review_status = "pending"
            item.error_message = None

        item.std_code = bz_id or None
        item.indexes_count = indexes_count
        item.save(
            update_fields=[
                "status",
                "std_code",
                "indexes_count",
                "manual_review_status",
                "error_message",
                "updated_at",
            ]
        )
    except (DifyApiError, OSError, RuntimeError, ValueError) as exc:
        item.status = NationalStandardIndexImportItem.Status.FAILED
        item.error_message = str(exc)[:2000]
        item.save(update_fields=["status", "error_message", "updated_at"])


def _process_std_index_import_job_impl(job_id: int) -> str:
    from django.db import close_old_connections

    close_old_connections()

    job = (
        NationalStandardIndexImportJob.objects.prefetch_related("items")
        .filter(pk=job_id)
        .first()
    )
    if not job:
        return "missing_job"

    client = DifyClient()
    if not client.is_std_index_configured():
        msg = STD_INDEX_MISSING_DIFY_MSG
        for it in job.items.all():
            it.status = NationalStandardIndexImportItem.Status.FAILED
            it.error_message = msg
            it.save(update_fields=["status", "error_message", "updated_at"])
        job.status = NationalStandardIndexImportJob.Status.COMPLETED
        job.error_summary = msg
        job.failed_items = job.items.count()
        job.completed_items = 0
        job.save(
            update_fields=[
                "status",
                "error_summary",
                "failed_items",
                "completed_items",
                "updated_at",
            ]
        )
        return "no_dify_config"

    job.status = NationalStandardIndexImportJob.Status.PROCESSING
    job.error_summary = None
    job.save(update_fields=["status", "error_summary", "updated_at"])

    for it in job.items.order_by("sort_order", "id"):
        _process_single_item(it)

    _refresh_job_status(job_id)
    return "ok"


@shared_task(name="standards.sync_abolished_std_status")
def sync_abolished_std_status_task() -> dict[str, int | str]:
    result = sync_national_standard_status()
    logger.info(
        "sync_national_standard_status as_of=%s current=%s abolished=%s",
        result["as_of"],
        result["updated_current"],
        result["updated_abolished"],
    )
    return result


@shared_task(name="standards.process_std_index_import_job")
def process_std_index_import_job(job_id: int) -> str:
    try:
        return _process_std_index_import_job_impl(job_id)
    except Exception as exc:
        logger.exception("process_std_index_import_job job_id=%s failed", job_id)
        job = NationalStandardIndexImportJob.objects.filter(pk=job_id).first()
        if job:
            job.status = NationalStandardIndexImportJob.Status.FAILED
            job.error_summary = str(exc)[:2000]
            job.save(update_fields=["status", "error_summary", "updated_at"])
        raise
