from django.db import migrations


def purge_empty_history_snapshots(apps, schema_editor):
    WarningMonitorSnapshot = apps.get_model("alerting", "WarningMonitorSnapshot")
    WarningMonitorSnapshot.objects.filter(task_conclusion="empty_history").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("alerting", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(purge_empty_history_snapshots, migrations.RunPython.noop),
    ]
