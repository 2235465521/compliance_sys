# STSC L3：表名与字段对齐 regulation_*（库表由 DBA 预建，仅更新 Django state）

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("compliance", "0005_ensure_compliance_task_columns_mysql"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RenameField(
                    model_name="complianceevaluationtask",
                    old_name="qb_code",
                    new_name="subject_code",
                ),
                migrations.AddField(
                    model_name="complianceevaluationtask",
                    name="catalog_std_type_no",
                    field=models.CharField(
                        blank=True,
                        db_index=True,
                        help_text="企标为 NULL",
                        max_length=8,
                        null=True,
                    ),
                ),
                migrations.AlterModelTable(
                    name="complianceevaluationtask",
                    table="regulation_compliance_evaluation_task",
                ),
                migrations.AlterModelTable(
                    name="complianceevaluationsnapshot",
                    table="regulation_compliance_evaluation_snapshot",
                ),
                migrations.RemoveIndex(
                    model_name="complianceevaluationsnapshot",
                    name="ces_task_step_idx",
                ),
                migrations.AddIndex(
                    model_name="complianceevaluationsnapshot",
                    index=models.Index(fields=["task", "step"], name="rces_task_step_idx"),
                ),
            ],
        ),
    ]
