"""正向预警：build_forward_warning 为 A/B/G 与监控明细唯一入口。"""

from __future__ import annotations

from typing import Any

from apps.batch_normative_reference.enterprise_display import enterprise_fields_from_parse_result
from apps.batch_normative_reference.models import BatchNormativeReferenceItem
from apps.compliance.db import is_mysql, require_mysql
from apps.compliance.models import ComplianceEvaluationTask
from apps.novelty.services.history_aggregator import find_history_for_qb_code
from apps.novelty.services.qb_code_utils import normalize_qb_code, qb_codes_match

from apps.alerting.services.conclusion import compute_warning_task_conclusion
from apps.alerting.services.warning_compare import build_warning_compare_rows

EMPTY_HISTORY_SUMMARY = "未找到该企标的合规或批量规范性引用评价记录"


def _map_compare_row(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw.get("id") or ""),
        "referenced_std_code": raw.get("referenced_std_code") or "",
        "full_std_at_publication": raw.get("full_std_at_publication"),
        "baseline_latest_std": raw.get("baseline_latest_std_primary"),
        "current_latest_std": raw.get("current_latest_std_primary"),
        "row_conclusion": raw.get("row_conclusion") or "",
        "row_conclusion_label": raw.get("row_conclusion_label"),
        "explanation": raw.get("explanation"),
    }


def _map_source_evaluations(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for src in sources:
        if not isinstance(src, dict):
            continue
        out.append(
            {
                "source_type": src.get("source_type"),
                "evaluated_at": src.get("evaluated_at"),
                "job_id": src.get("source_id"),
            }
        )
    return out


def _subject_name_for_code(subject_code: str) -> str | None:
    for task in ComplianceEvaluationTask.objects.filter(current_step__gte=4).order_by("-updated_at"):
        if qb_codes_match(task.subject_code, subject_code):
            pr = task.parse_result_json if isinstance(task.parse_result_json, dict) else {}
            fields = enterprise_fields_from_parse_result(pr)
            name = fields.get("company_name")
            if name:
                return name
    for item in BatchNormativeReferenceItem.objects.filter(
        status=BatchNormativeReferenceItem.Status.COMPLETED,
    ).order_by("-updated_at"):
        pr = item.parse_result_json if isinstance(item.parse_result_json, dict) else {}
        fields = enterprise_fields_from_parse_result(pr)
        if not qb_codes_match(fields.get("qb_code"), subject_code):
            continue
        name = fields.get("company_name")
        if name:
            return name
    return None


def build_forward_warning(subject_code: str, *, pending: bool = False) -> dict[str, Any]:
    """
    正向预警 + 监控明细共用。
    pending=True 时用于文件解析中（接口 B/C）。
    """
    code_display = (subject_code or "").strip()
    code_norm = normalize_qb_code(code_display)
    if not code_norm:
        return {
            "subject_code": code_display,
            "subject_name": None,
            "task_conclusion": "empty_history",
            "task_summary": EMPTY_HISTORY_SUMMARY,
            "compare_rows": [],
            "source_evaluations": [],
        }

    if pending:
        return {
            "subject_code": code_display,
            "subject_name": _subject_name_for_code(code_display),
            "task_conclusion": "pending",
            "task_summary": "正在解析企标文件，请稍候",
            "compare_rows": [],
            "source_evaluations": [],
        }

    require_mysql()
    if not is_mysql():
        raise RuntimeError("预警模块依赖 MySQL 与标准库业务表")

    history = find_history_for_qb_code(code_display)
    if history is None:
        return {
            "subject_code": code_display,
            "subject_name": None,
            "task_conclusion": "empty_history",
            "task_summary": EMPTY_HISTORY_SUMMARY,
            "compare_rows": [],
            "source_evaluations": [],
        }

    raw_rows = build_warning_compare_rows(history.eval_reference_rows, code_display)
    compare_rows = [_map_compare_row(r) for r in raw_rows]
    task_conclusion, task_summary = compute_warning_task_conclusion(compare_rows)

    return {
        "subject_code": code_display,
        "subject_name": _subject_name_for_code(code_display),
        "task_conclusion": task_conclusion,
        "task_summary": task_summary,
        "compare_rows": compare_rows,
        "source_evaluations": _map_source_evaluations(history.source_evaluations),
    }
