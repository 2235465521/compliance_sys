from apps.compliance.models import ComplianceEvaluationSnapshot, ComplianceEvaluationTask
from django.contrib import admin


@admin.register(ComplianceEvaluationTask)
class ComplianceEvaluationTaskAdmin(admin.ModelAdmin):
    list_display = ("id", "subject_code", "current_step", "status", "updated_at")
    list_filter = ("status", "current_step")
    search_fields = ("subject_code",)


@admin.register(ComplianceEvaluationSnapshot)
class ComplianceEvaluationSnapshotAdmin(admin.ModelAdmin):
    list_display = ("id", "task", "step", "created_at")
    list_filter = ("step",)
