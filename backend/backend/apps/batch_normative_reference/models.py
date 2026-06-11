from django.db import models


class BatchNormativeReferenceJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "pending"
        PROCESSING = "processing", "processing"
        COMPLETED = "completed", "completed"
        FAILED = "failed", "failed"

    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING, db_index=True)
    label = models.CharField(max_length=256, blank=True, null=True)
    total_items = models.PositiveIntegerField(default=0)
    completed_items = models.PositiveIntegerField(default=0)
    failed_items = models.PositiveIntegerField(default=0)
    error_summary = models.TextField(blank=True, null=True)
    created_by = models.CharField(max_length=128, blank=True, null=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "regulation_batch_normative_reference_job"
        ordering = ["-id"]


class BatchNormativeReferenceItem(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "pending"
        RUNNING = "running", "running"
        COMPLETED = "completed", "completed"
        FAILED = "failed", "failed"

    job = models.ForeignKey(
        BatchNormativeReferenceJob,
        on_delete=models.CASCADE,
        related_name="items",
        db_column="job_id",
    )
    sort_order = models.PositiveIntegerField(default=0)
    original_filename = models.CharField(max_length=512)
    stored_file_path = models.TextField()
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING, db_index=True)
    parse_result_json = models.JSONField(blank=True, null=True)
    dify_meta_json = models.JSONField(blank=True, null=True)
    reference_resolution_json = models.JSONField(blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "regulation_batch_normative_reference_item"
        ordering = ["job_id", "sort_order", "id"]
        indexes = [models.Index(fields=["job", "status"], name="rbnri_job_status_idx")]
