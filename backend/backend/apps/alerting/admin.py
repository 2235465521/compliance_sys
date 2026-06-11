from django.contrib import admin

from apps.alerting.models import WarningMonitorRun, WarningMonitorSnapshot


@admin.register(WarningMonitorSnapshot)
class WarningMonitorSnapshotAdmin(admin.ModelAdmin):
    list_display = ("subject_code", "subject_name", "task_conclusion", "last_checked_at")
    search_fields = ("subject_code", "subject_name")
    list_filter = ("task_conclusion",)


@admin.register(WarningMonitorRun)
class WarningMonitorRunAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "status",
        "total_evaluated",
        "need_attention_count",
        "all_ok_count",
        "started_at",
        "finished_at",
    )
    list_filter = ("status",)
