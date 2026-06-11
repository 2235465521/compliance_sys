"""合规任务展示状态与列表筛选（不依赖 HTTP）。"""

from __future__ import annotations

from typing import Literal

from django.db.models import Q, QuerySet

from apps.compliance.models import ComplianceEvaluationTask

DisplayStatus = Literal["draft", "in_progress", "completed", "failed"]
ListStatusFilter = Literal["draft", "in_progress", "completed", "failed", "all"]


def compute_display_status(task: ComplianceEvaluationTask) -> DisplayStatus:
    parse_status = getattr(task, "parse_status", None) or "completed"
    if parse_status == "failed" or task.status == ComplianceEvaluationTask.Status.FAILED:
        return "failed"
    if task.current_step >= 6 and task.step5_compare_confirmed:
        return "completed"
    if task.current_step == 1:
        return "draft"
    return "in_progress"


def _failed_q() -> Q:
    return Q(parse_status="failed") | Q(status=ComplianceEvaluationTask.Status.FAILED)


def _completed_q() -> Q:
    return Q(current_step__gte=6, step5_compare_confirmed=True)


def apply_list_status_filter(qs: QuerySet, status: str | None) -> QuerySet:
    if not status or status == "all":
        return qs
    failed = _failed_q()
    if status == "failed":
        return qs.filter(failed)
    if status == "completed":
        return qs.filter(_completed_q()).exclude(failed)
    if status == "draft":
        return qs.filter(current_step=1).exclude(failed)
    if status == "in_progress":
        return qs.exclude(failed).exclude(_completed_q()).exclude(current_step=1)
    return qs


def step_label_for_task(task: ComplianceEvaluationTask) -> str:
    return f"步骤 {task.current_step}/6"


def progress_percent_for_task(task: ComplianceEvaluationTask) -> int:
    return round(task.current_step / 6 * 100)
