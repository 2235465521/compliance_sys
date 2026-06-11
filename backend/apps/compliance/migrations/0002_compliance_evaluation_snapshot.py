# 从 0001_initial 拆出：快照表 + 索引（与 v1.0-sql compliance_evaluation_snapshot 对齐）

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("compliance", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ComplianceEvaluationSnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("step", models.PositiveSmallIntegerField()),
                ("payload_json", models.JSONField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "task",
                    models.ForeignKey(
                        db_column="task_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="snapshots",
                        to="compliance.complianceevaluationtask",
                    ),
                ),
            ],
            options={"db_table": "compliance_evaluation_snapshot"},
        ),
        migrations.AddIndex(
            model_name="complianceevaluationsnapshot",
            index=models.Index(fields=["task", "step"], name="ces_task_step_idx"),
        ),
    ]
