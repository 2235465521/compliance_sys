from django.db import models


class WarningMonitorSnapshot(models.Model):
    catalog_std_type_no = models.CharField(max_length=8, null=True, blank=True, db_index=True)
    subject_code = models.CharField(max_length=128, db_index=True)
    subject_name = models.CharField(max_length=512, blank=True, default="")
    task_conclusion = models.CharField(max_length=32, db_index=True)
    task_summary = models.TextField(blank=True, default="")
    last_checked_at = models.DateTimeField(db_index=True)
    compare_rows_json = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "regulation_warning_monitor_snapshot"
        ordering = ["-last_checked_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["catalog_std_type_no", "subject_code"],
                name="uq_warning_snapshot_subject",
            )
        ]


class WarningMonitorRun(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", "running"
        PAUSED = "paused", "paused"
        COMPLETED = "completed", "completed"
        FAILED = "failed", "failed"
        CANCELLED = "cancelled", "cancelled"

    class ScanPhase(models.TextChoices):
        IDLE = "idle", "idle"
        NOT_SCANNED = "not_scanned", "not_scanned"
        ALL_OK = "all_ok", "all_ok"

    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(blank=True, null=True)
    total_evaluated = models.PositiveIntegerField(default=0)
    processed_count = models.PositiveIntegerField(default=0)
    need_attention_count = models.PositiveIntegerField(default=0)
    all_ok_count = models.PositiveIntegerField(default=0)
    pending_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RUNNING)
    scan_phase = models.CharField(
        max_length=32,
        choices=ScanPhase.choices,
        default=ScanPhase.IDLE,
    )
    current_subject_code = models.CharField(max_length=128, blank=True, default="")
    pause_requested = models.BooleanField(default=False)
    queue_json = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "regulation_warning_monitor_run"
        ordering = ["-id"]
