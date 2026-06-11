from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

from apps.alerting.models import WarningMonitorRun

logger = logging.getLogger(__name__)


@shared_task(name="alerting.process_warning_monitor_run")
def process_warning_monitor_run(run_id: int) -> str:
    try:
        from apps.alerting.services.monitor_service import execute_monitor_run

        return execute_monitor_run(run_id)
    except Exception as e:
        logger.exception("warning monitor run failed run_id=%s", run_id)
        run = WarningMonitorRun.objects.filter(pk=run_id).first()
        if run:
            run.status = WarningMonitorRun.Status.FAILED
            run.finished_at = timezone.now()
            run.save(update_fields=["status", "finished_at"])
        raise e
