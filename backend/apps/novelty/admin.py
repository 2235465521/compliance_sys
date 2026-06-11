from django.contrib import admin

from apps.novelty.models import NoveltyReferenceBaselineSnapshot, NoveltySearchTask


@admin.register(NoveltySearchTask)
class NoveltySearchTaskAdmin(admin.ModelAdmin):
    list_display = ("id", "subject_code", "status", "task_conclusion", "created_at")
    list_filter = ("status", "task_conclusion")
    search_fields = ("subject_code", "title")
    readonly_fields = (
        "reference_sheet_json",
        "compare_rows_json",
        "indicators_json",
        "source_evaluations_json",
        "created_at",
        "updated_at",
    )


@admin.register(NoveltyReferenceBaselineSnapshot)
class NoveltyReferenceBaselineSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "subject_code",
        "referenced_std_code",
        "baseline_latest_std_primary",
        "baseline_source",
        "baseline_recorded_at",
    )
    list_filter = ("baseline_source",)
    search_fields = ("subject_code", "referenced_std_code")
