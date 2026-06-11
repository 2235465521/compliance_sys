# Generated manually — 批量规范性引用评价 job / item 表

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="BatchNormativeReferenceJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "pending"),
                            ("processing", "processing"),
                            ("completed", "completed"),
                            ("failed", "failed"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=32,
                    ),
                ),
                ("label", models.CharField(blank=True, max_length=256, null=True)),
                ("total_items", models.PositiveIntegerField(default=0)),
                ("completed_items", models.PositiveIntegerField(default=0)),
                ("failed_items", models.PositiveIntegerField(default=0)),
                ("error_summary", models.TextField(blank=True, null=True)),
                ("created_by", models.CharField(blank=True, db_index=True, max_length=128, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "batch_normative_reference_job", "ordering": ["-id"]},
        ),
        migrations.CreateModel(
            name="BatchNormativeReferenceItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("original_filename", models.CharField(max_length=512)),
                ("stored_file_path", models.TextField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "pending"),
                            ("running", "running"),
                            ("completed", "completed"),
                            ("failed", "failed"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=32,
                    ),
                ),
                ("parse_result_json", models.JSONField(blank=True, null=True)),
                ("dify_meta_json", models.JSONField(blank=True, null=True)),
                ("reference_resolution_json", models.JSONField(blank=True, null=True)),
                ("error_message", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "job",
                    models.ForeignKey(
                        db_column="job_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="batch_normative_reference.batchnormativereferencejob",
                    ),
                ),
            ],
            options={
                "db_table": "batch_normative_reference_item",
                "ordering": ["job_id", "sort_order", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="batchnormativereferenceitem",
            index=models.Index(fields=["job", "status"], name="bnri_job_status_idx"),
        ),
    ]
