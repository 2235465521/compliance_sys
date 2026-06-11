from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("alerting", "0003_monitor_run_progress_and_pause"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RenameField(
                    model_name="warningmonitorsnapshot",
                    old_name="qb_code",
                    new_name="subject_code",
                ),
                migrations.RenameField(
                    model_name="warningmonitorsnapshot",
                    old_name="enterprise_name",
                    new_name="subject_name",
                ),
                migrations.AddField(
                    model_name="warningmonitorsnapshot",
                    name="catalog_std_type_no",
                    field=models.CharField(blank=True, db_index=True, max_length=8, null=True),
                ),
                migrations.AlterModelTable(
                    name="warningmonitorsnapshot",
                    table="regulation_warning_monitor_snapshot",
                ),
                migrations.RenameField(
                    model_name="warningmonitorrun",
                    old_name="total_evaluated_qb",
                    new_name="total_evaluated",
                ),
                migrations.RenameField(
                    model_name="warningmonitorrun",
                    old_name="current_qb_code",
                    new_name="current_subject_code",
                ),
                migrations.AlterModelTable(
                    name="warningmonitorrun",
                    table="regulation_warning_monitor_run",
                ),
            ],
        ),
    ]
