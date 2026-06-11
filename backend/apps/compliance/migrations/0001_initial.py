# Generated manually — 对齐 v1.0-sql compliance_evaluation_task（仅任务表）
#
# 与 snapshot 拆到 0002，便于 --fake-initial：仅导入 task 表时也能先 fake 0001，再由 0002 建 snapshot。
# 若 MySQL 已通过 ../v1.0-sql 建过本表，首次请：python manage.py migrate --fake-initial

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ComplianceEvaluationTask",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("qb_code", models.CharField(blank=True, db_index=True, max_length=128, null=True)),
                ("current_step", models.PositiveSmallIntegerField(default=1)),
                (
                    "status",
                    models.CharField(
                        choices=[("active", "active"), ("failed", "failed"), ("archived", "archived")],
                        default="active",
                        max_length=16,
                    ),
                ),
                ("uploaded_file_path", models.TextField(blank=True, null=True)),
                ("uploaded_file_name", models.CharField(blank=True, max_length=512, null=True)),
                ("parse_result_json", models.JSONField(blank=True, null=True)),
                ("indicator_bundle_json", models.JSONField(blank=True, null=True)),
                ("compare_result_json", models.JSONField(blank=True, null=True)),
                ("dify_run_metadata_json", models.JSONField(blank=True, null=True)),
                ("step4_indicators_confirmed", models.BooleanField(default=False)),
                ("step5_compare_confirmed", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.CharField(blank=True, max_length=128, null=True)),
            ],
            options={"db_table": "compliance_evaluation_task"},
        ),
    ]
