from __future__ import annotations

import logging
from pathlib import Path

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)

from apps.batch_normative_reference.models import (
    BatchNormativeReferenceItem,
    BatchNormativeReferenceJob,
)
from apps.batch_normative_reference.utils import referenced_codes_from_flat_parse
from apps.engine.dify_client import DifyApiError, DifyClient
from apps.standards.services.reference_bundle import (
    attach_normative_reference_std_names,
    normative_reference_row_core,
)
from apps.standards.services.reference_resolution import resolve_reference_for_parse_context


def _refresh_job_item_counters(job: BatchNormativeReferenceJob) -> None:
    job.completed_items = job.items.filter(status=BatchNormativeReferenceItem.Status.COMPLETED).count()
    job.failed_items = job.items.filter(status=BatchNormativeReferenceItem.Status.FAILED).count()
    job.save(update_fields=["completed_items", "failed_items", "updated_at"])


def _finalize_stuck_items(job: BatchNormativeReferenceJob, *, error_message: str) -> None:
    msg = (error_message or "批量任务异常中止")[:4000]
    job.items.filter(
        status__in=(
            BatchNormativeReferenceItem.Status.PENDING,
            BatchNormativeReferenceItem.Status.RUNNING,
        )
    ).update(
        status=BatchNormativeReferenceItem.Status.FAILED,
        error_message=msg,
    )


@shared_task(name="batch_normative_reference.process_job")
def process_batch_normative_reference_job(job_id: int) -> str:
    try:
        return _process_batch_normative_reference_job_impl(job_id)
    except Exception as e:
        logger.exception("process_batch_normative_reference_job job_id=%s failed", job_id)
        job = BatchNormativeReferenceJob.objects.filter(pk=job_id).first()
        if job:
            msg = str(e)[:2000]
            _finalize_stuck_items(job, error_message=msg)
            _refresh_job_item_counters(job)
            job.status = BatchNormativeReferenceJob.Status.FAILED
            job.error_summary = msg
            job.save(update_fields=["status", "error_summary", "updated_at"])
        raise


def _process_batch_normative_reference_job_impl(job_id: int) -> str:
    job = BatchNormativeReferenceJob.objects.prefetch_related("items").filter(pk=job_id).first()
    if not job:
        return "missing_job"

    job.status = BatchNormativeReferenceJob.Status.PROCESSING
    job.error_summary = None
    job.save(update_fields=["status", "error_summary", "updated_at"])

    client = DifyClient()
    if not client.is_batch_normative_ref_configured():
        msg = "未配置 BATCH_NORMATIVE_REF_DIFY_API_KEY 等环境变量，无法调用 Dify"
        for it in job.items.all():
            it.status = BatchNormativeReferenceItem.Status.FAILED
            it.error_message = msg
            it.save(update_fields=["status", "error_message", "updated_at"])
        job.failed_items = job.items.count()
        job.completed_items = 0
        job.status = BatchNormativeReferenceJob.Status.COMPLETED
        job.error_summary = msg
        job.save(
            update_fields=[
                "failed_items",
                "completed_items",
                "status",
                "error_summary",
                "updated_at",
            ]
        )
        return "no_dify_config"

    fallback_year = timezone.localtime(job.created_at).year

    for it in job.items.order_by("sort_order", "id"):
        it.status = BatchNormativeReferenceItem.Status.RUNNING
        it.error_message = None
        it.save(update_fields=["status", "error_message", "updated_at"])

        path = it.stored_file_path
        try:
            raw, meta = client.run_batch_normative_ref_workflow(
                Path(path),
                user=f"batch-normative-ref-job-{job_id}-item-{it.id}",
                trace_id=f"batch-normative-ref-{job_id}-{it.id}",
            )
            refs = referenced_codes_from_flat_parse(raw)
            qb = (raw.get("qb_code") or raw.get("qb_id") or "").strip() or None
            bundle: list[dict] = []
            for ref in refs:
                resolved = resolve_reference_for_parse_context(
                    ref,
                    pr=raw,
                    qb_code=qb,
                    fallback_year=fallback_year,
                )
                bundle.append(normative_reference_row_core(resolved))
            attach_normative_reference_std_names(bundle)

            it.parse_result_json = raw
            it.dify_meta_json = meta
            it.reference_resolution_json = bundle
            it.status = BatchNormativeReferenceItem.Status.COMPLETED
            it.save(
                update_fields=[
                    "parse_result_json",
                    "dify_meta_json",
                    "reference_resolution_json",
                    "status",
                    "updated_at",
                ]
            )
            try:
                from apps.novelty.services.baseline_service import record_baseline_from_batch_item

                record_baseline_from_batch_item(it)
            except Exception:
                import logging

                logging.getLogger(__name__).exception(
                    "baseline snapshot after batch item complete failed item_id=%s", it.id
                )
        except Exception as e:
            logger.exception(
                "batch normative ref item failed job_id=%s item_id=%s file=%s",
                job_id,
                it.id,
                it.original_filename,
            )
            it.status = BatchNormativeReferenceItem.Status.FAILED
            it.error_message = str(e)[:4000]
            it.save(update_fields=["status", "error_message", "updated_at"])

        _refresh_job_item_counters(job)

    job.status = BatchNormativeReferenceJob.Status.COMPLETED
    job.save(update_fields=["status", "updated_at"])
    return "ok"
