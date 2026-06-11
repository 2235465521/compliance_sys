from django.db import models


class ComplianceEvaluationTask(models.Model):
    """STSC L3：regulation_compliance_evaluation_task"""

    class Status(models.TextChoices):
        ACTIVE = "active", "active"
        FAILED = "failed", "failed"
        ARCHIVED = "archived", "archived"

    catalog_std_type_no = models.CharField(
        max_length=8,
        null=True,
        blank=True,
        db_index=True,
        help_text="企标为 NULL；与 subject_code 组成锚表键",
    )
    subject_code = models.CharField(max_length=128, null=True, blank=True, db_index=True)
    current_step = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    uploaded_file_path = models.TextField(blank=True, null=True)
    uploaded_file_name = models.CharField(max_length=512, blank=True, null=True)
    parse_result_json = models.JSONField(blank=True, null=True)
    indicator_bundle_json = models.JSONField(blank=True, null=True)
    compare_result_json = models.JSONField(blank=True, null=True)
    dify_run_metadata_json = models.JSONField(blank=True, null=True)
    parse_status = models.CharField(
        max_length=24,
        default="completed",
        db_index=True,
        help_text="企标解析：pending/running/completed/failed",
    )
    parse_error = models.TextField(blank=True, null=True)
    step4_indicators_confirmed = models.BooleanField(default=False)
    step5_compare_confirmed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=128, blank=True, null=True)

    class Meta:
        db_table = "regulation_compliance_evaluation_task"


class ComplianceEvaluationSnapshot(models.Model):
    task = models.ForeignKey(
        ComplianceEvaluationTask,
        on_delete=models.CASCADE,
        related_name="snapshots",
        db_column="task_id",
    )
    step = models.PositiveSmallIntegerField()
    payload_json = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "regulation_compliance_evaluation_snapshot"
        indexes = [models.Index(fields=["task", "step"], name="rces_task_step_idx")]
