"""国标指标批量入库：DB 持久化批次 + Celery 异步处理（与批量规范性引用评价一致）。"""

from __future__ import annotations

import os
import shutil
import threading
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.db import connection
from django.db.models import Max
from django.utils.text import get_valid_filename
from ninja.errors import HttpError

from apps.engine.dify_client import DifyClient
from apps.standards.models import (
    NationalStandardIndexImportItem,
    NationalStandardIndexImportJob,
)
from django.db.models import Q

from apps.standards.services.std_index_import import (
    STD_INDEX_MISSING_DIFY_MSG,
    get_std_index_for_review,
    save_reviewed_indexes,
)
from apps.standards.tasks import process_std_index_import_job


def max_batch_files() -> int:
    """环境变量 STD_INDEX_BATCH_MAX_FILES，默认 100，有效范围 1～100。"""
    raw = (os.environ.get("STD_INDEX_BATCH_MAX_FILES", "100") or "100").strip()
    try:
        n = int(raw)
    except ValueError:
        return 100
    return max(1, min(n, 100))


def _enqueue_process_job(job_id: int) -> None:
    """投递 Celery；未启 Worker 或 dev 配置时改后台线程执行。"""
    use_thread = getattr(settings, "STD_INDEX_BATCH_USE_THREAD", False)
    if use_thread:
        threading.Thread(
            target=_run_process_job_in_thread,
            args=(job_id,),
            daemon=True,
            name=f"std-index-import-{job_id}",
        ).start()
        return
    try:
        process_std_index_import_job.delay(job_id)
    except Exception:
        threading.Thread(
            target=_run_process_job_in_thread,
            args=(job_id,),
            daemon=True,
            name=f"std-index-import-fallback-{job_id}",
        ).start()


def _run_process_job_in_thread(job_id: int) -> None:
    from django.db import close_old_connections

    close_old_connections()
    try:
        process_std_index_import_job(job_id)
    except Exception:
        pass
    finally:
        close_old_connections()


def create_job(
    uploaded_files: list[UploadedFile],
    *,
    label: str | None = None,
) -> NationalStandardIndexImportJob:
    """
    创建 Job + Item，文件写入 MEDIA_ROOT/std_index_import/{job_id}/，异步逐条 Dify 入库。
    """
    if not uploaded_files:
        raise HttpError(422, "请至少上传一个国标文件（multipart 字段名：files）")

    max_n = max_batch_files()
    if len(uploaded_files) > max_n:
        raise HttpError(422, f"单次最多上传 {max_n} 个文件（由 STD_INDEX_BATCH_MAX_FILES 控制）")

    client = DifyClient()
    if not client.is_std_index_configured():
        raise HttpError(503, STD_INDEX_MISSING_DIFY_MSG)

    job = NationalStandardIndexImportJob.objects.create(
        status=NationalStandardIndexImportJob.Status.PENDING,
        label=label,
        total_items=len(uploaded_files),
    )

    media_root = Path(settings.MEDIA_ROOT)
    base_dir = media_root / "std_index_import" / str(job.id)
    base_dir.mkdir(parents=True, exist_ok=True)

    for idx, uploaded in enumerate(uploaded_files):
        raw_name = uploaded.name or f"file_{idx}"
        safe = get_valid_filename(raw_name) or f"file_{idx}"
        dest = base_dir / f"{idx:04d}_{safe}"
        with dest.open("wb") as out_f:
            for chunk in uploaded.chunks():
                out_f.write(chunk)

        NationalStandardIndexImportItem.objects.create(
            job=job,
            sort_order=idx,
            original_filename=raw_name,
            stored_file_path=str(dest.resolve()),
            status=NationalStandardIndexImportItem.Status.PENDING,
        )

    _enqueue_process_job(job.id)
    return job


def delete_job_upload_dir(job_id: int) -> None:
    upload_dir = Path(settings.MEDIA_ROOT) / "std_index_import" / str(job_id)
    if upload_dir.is_dir():
        shutil.rmtree(upload_dir, ignore_errors=True)


def _reset_table_auto_increment(model: type) -> None:
    """
    删除行后把自增计数器设为 MAX(id)+1，避免 MySQL 沿用已删过的更大 id。
    表为空时下一号为 1。
    """
    table = model._meta.db_table
    max_id = model.objects.aggregate(m=Max("id"))["m"] or 0
    next_val = int(max_id) + 1

    with connection.cursor() as cursor:
        if connection.vendor == "mysql":
            cursor.execute(f"ALTER TABLE `{table}` AUTO_INCREMENT = %s", [next_val])
        elif connection.vendor == "sqlite":
            if max_id == 0:
                cursor.execute("DELETE FROM sqlite_sequence WHERE name = %s", [table])
            else:
                cursor.execute(
                    "UPDATE sqlite_sequence SET seq = ? WHERE name = ?",
                    [max_id, table],
                )
                if cursor.rowcount == 0:
                    cursor.execute(
                        "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)",
                        [table, max_id],
                    )


def delete_job(job_id: int) -> None:
    """删除批次（级联子项）、上传目录，并重置 job/item 表自增 id。"""
    deleted, _ = NationalStandardIndexImportJob.objects.filter(pk=job_id).delete()
    if deleted == 0:
        raise HttpError(404, f"批次 {job_id} 不存在")
    delete_job_upload_dir(job_id)
    _reset_table_auto_increment(NationalStandardIndexImportItem)
    _reset_table_auto_increment(NationalStandardIndexImportJob)


def get_job(job_id: int) -> NationalStandardIndexImportJob | None:
    try:
        return NationalStandardIndexImportJob.objects.prefetch_related("items").get(pk=job_id)
    except NationalStandardIndexImportJob.DoesNotExist:
        return None


def approve_all_job_items(
    job_id: int,
    *,
    only_pending: bool = True,
    manual_review_status: str = "approved",
) -> dict[str, Any]:
    """
    批次内一键审核：对 status=completed 且有 std_code 的子项，
    按库中现有 indexes 原样通过（不逐条打开审核页）。
    """
    job = get_job(job_id)
    if job is None:
        raise HttpError(404, f"批次 {job_id} 不存在")

    status = (manual_review_status or "approved").strip().lower()
    if status not in ("approved", "rejected"):
        raise HttpError(422, "manual_review_status 仅支持 approved 或 rejected")

    qs = job.items.filter(status=NationalStandardIndexImportItem.Status.COMPLETED).exclude(
        std_code__isnull=True
    ).exclude(std_code="")
    if only_pending:
        qs = qs.filter(
            Q(manual_review_status__isnull=True)
            | Q(manual_review_status="")
            | Q(manual_review_status="pending")
        )

    approved_count = 0
    skipped: list[str] = []
    failed: list[str] = []

    for item in qs.order_by("sort_order", "id"):
        code = (item.std_code or "").strip()
        try:
            review = get_std_index_for_review(code)
            indexes = review.get("indexes") or []
            if not indexes:
                skipped.append(f"{code or item.original_filename}: 无指标数据")
                continue
            save_reviewed_indexes(
                code,
                indexes,
                manual_review_status=status,
            )
            NationalStandardIndexImportItem.objects.filter(pk=item.pk).update(
                manual_review_status=status,
                indexes_count=len(indexes),
            )
            approved_count += 1
        except Exception as exc:  # noqa: BLE001
            failed.append(f"{code}: {exc}"[:200])

    return {
        "job_id": job_id,
        "approved_count": approved_count,
        "skipped_count": len(skipped),
        "failed_count": len(failed),
        "skipped": skipped,
        "failed": failed,
    }


def list_jobs(
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    qs = NationalStandardIndexImportJob.objects.all()
    total = qs.count()
    offset = (page - 1) * page_size
    jobs = list(qs[offset : offset + page_size])
    return {
        "total": total,
        "count": total,
        "page": page,
        "page_size": page_size,
        "results": jobs,
    }
