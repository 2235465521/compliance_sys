from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("alerting", "0002_purge_empty_history_snapshots"),
    ]

    operations = [
        migrations.AddField(
            model_name="warningmonitorrun",
            name="processed_count",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="warningmonitorrun",
            name="scan_phase",
            field=models.CharField(
                choices=[
                    ("idle", "idle"),
                    ("not_scanned", "not_scanned"),
                    ("all_ok", "all_ok"),
                ],
                default="idle",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="warningmonitorrun",
            name="current_qb_code",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="warningmonitorrun",
            name="pause_requested",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="warningmonitorrun",
            name="queue_json",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name="warningmonitorrun",
            name="status",
            field=models.CharField(
                choices=[
                    ("running", "running"),
                    ("paused", "paused"),
                    ("completed", "completed"),
                    ("failed", "failed"),
                    ("cancelled", "cancelled"),
                ],
                default="running",
                max_length=16,
            ),
        ),
    ]
