from django.db import models


class NoveltyReferenceBaselineSnapshot(models.Model):
    class BaselineSource(models.TextChoices):
        COMPLIANCE = "compliance", "compliance"
        BATCH = "batch", "batch"

    subject_code_norm = models.CharField(max_length=256, db_index=True)
    referenced_std_code_norm = models.CharField(max_length=256)
    subject_code = models.CharField(max_length=128)
    referenced_std_code = models.CharField(max_length=128)
    baseline_latest_std_primary = models.CharField(max_length=256)
    baseline_recorded_at = models.DateTimeField(auto_now_add=True)
    baseline_source = models.CharField(max_length=16, choices=BaselineSource.choices)
    baseline_source_id = models.BigIntegerField()

    class Meta:
        db_table = "regulation_novelty_reference_baseline_snapshot"
        constraints = [
            models.UniqueConstraint(
                fields=["subject_code_norm", "referenced_std_code_norm"],
                name="uq_novelty_baseline_subject_ref",
            )
        ]


class NoveltySearchTask(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "queued"
        LOADING_HISTORY = "loading_history", "loading_history"
        PARSING = "parsing", "parsing"
        PENDING_CONFIRM = "pending_confirm", "pending_confirm"
        COMPARING = "comparing", "comparing"
        COMPLETED = "completed", "completed"
        FAILED = "failed", "failed"

    class Source(models.TextChoices):
        UPLOAD = "upload", "upload"
        FORM = "form", "form"
        NATIONAL = "national", "national"

    class TaskConclusion(models.TextChoices):
        HAS_UPDATES = "has_updates", "has_updates"
        ALL_UNCHANGED = "all_unchanged", "all_unchanged"
        PARTIAL = "partial", "partial"
        PENDING = "pending", "pending"
        EMPTY_HISTORY = "empty_history", "empty_history"

    class ReportState(models.TextChoices):
        NONE = "none", "none"
        GENERATING = "generating", "generating"
        READY = "ready", "ready"
        FAILED = "failed", "failed"

    title = models.CharField(max_length=512)
    subject_code = models.CharField(max_length=128, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.QUEUED,
        db_index=True,
    )
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.UPLOAD)
    file_name = models.CharField(max_length=512, blank=True, null=True)
    uploaded_file_path = models.TextField(blank=True, null=True)
    sheet_confirmed = models.BooleanField(default=False)
    task_conclusion = models.CharField(
        max_length=32,
        choices=TaskConclusion.choices,
        blank=True,
        null=True,
    )
    task_summary = models.TextField(blank=True, null=True)
    error_summary = models.TextField(blank=True, null=True)
    compare_done = models.PositiveIntegerField(default=0)
    compare_total = models.PositiveIntegerField(default=0)
    report_state = models.CharField(
        max_length=16,
        choices=ReportState.choices,
        default=ReportState.NONE,
    )
    report_generated_at = models.DateTimeField(blank=True, null=True)
    reference_sheet_json = models.JSONField(default=list, blank=True)
    compare_rows_json = models.JSONField(default=list, blank=True)
    indicators_json = models.JSONField(blank=True, null=True)
    source_evaluations_json = models.JSONField(blank=True, null=True)
    created_by = models.CharField(max_length=128, blank=True, null=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "regulation_novelty_search_task"
        ordering = ["-id"]
