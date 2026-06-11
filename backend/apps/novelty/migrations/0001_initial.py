# Generated manually — 查新任务与基线快照表

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="NoveltyReferenceBaselineSnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("qb_code_norm", models.CharField(db_index=True, max_length=256)),
                ("referenced_std_code_norm", models.CharField(max_length=256)),
                ("qb_code", models.CharField(max_length=128)),
                ("referenced_std_code", models.CharField(max_length=128)),
                ("baseline_latest_std_primary", models.CharField(max_length=256)),
                ("baseline_recorded_at", models.DateTimeField(auto_now_add=True)),
                (
                    "baseline_source",
                    models.CharField(
                        choices=[("compliance", "compliance"), ("batch", "batch")],
                        max_length=16,
                    ),
                ),
                ("baseline_source_id", models.BigIntegerField()),
            ],
            options={
                "db_table": "novelty_reference_baseline_snapshot",
            },
        ),
        migrations.AddConstraint(
            model_name="noveltyreferencebaselinesnapshot",
            constraint=models.UniqueConstraint(
                fields=("qb_code_norm", "referenced_std_code_norm"),
                name="uq_novelty_baseline_qb_ref",
            ),
        ),
        migrations.CreateModel(
            name="NoveltySearchTask",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=512)),
                ("qb_code", models.CharField(db_index=True, max_length=128)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("queued", "queued"),
                            ("loading_history", "loading_history"),
                            ("parsing", "parsing"),
                            ("pending_confirm", "pending_confirm"),
                            ("comparing", "comparing"),
                            ("completed", "completed"),
                            ("failed", "failed"),
                        ],
                        db_index=True,
                        default="queued",
                        max_length=32,
                    ),
                ),
                (
                    "source",
                    models.CharField(
                        choices=[("upload", "upload"), ("form", "form"), ("national", "national")],
                        default="upload",
                        max_length=16,
                    ),
                ),
                ("file_name", models.CharField(blank=True, max_length=512, null=True)),
                ("uploaded_file_path", models.TextField(blank=True, null=True)),
                ("sheet_confirmed", models.BooleanField(default=False)),
                (
                    "task_conclusion",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("has_updates", "has_updates"),
                            ("all_unchanged", "all_unchanged"),
                            ("partial", "partial"),
                            ("pending", "pending"),
                            ("empty_history", "empty_history"),
                        ],
                        max_length=32,
                        null=True,
                    ),
                ),
                ("task_summary", models.TextField(blank=True, null=True)),
                ("error_summary", models.TextField(blank=True, null=True)),
                ("compare_done", models.PositiveIntegerField(default=0)),
                ("compare_total", models.PositiveIntegerField(default=0)),
                (
                    "report_state",
                    models.CharField(
                        choices=[
                            ("none", "none"),
                            ("generating", "generating"),
                            ("ready", "ready"),
                            ("failed", "failed"),
                        ],
                        default="none",
                        max_length=16,
                    ),
                ),
                ("report_generated_at", models.DateTimeField(blank=True, null=True)),
                ("reference_sheet_json", models.JSONField(blank=True, default=list)),
                ("compare_rows_json", models.JSONField(blank=True, default=list)),
                ("indicators_json", models.JSONField(blank=True, null=True)),
                ("source_evaluations_json", models.JSONField(blank=True, null=True)),
                ("created_by", models.CharField(blank=True, db_index=True, max_length=128, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "novelty_search_task",
                "ordering": ["-id"],
            },
        ),
    ]
