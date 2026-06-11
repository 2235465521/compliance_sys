"""ORM → API Schema 转换。"""

from __future__ import annotations

from typing import Any

from apps.novelty.models import NoveltySearchTask
from apps.novelty.schemas.api_schemas import (
    NoveltyCompareRowOut,
    NoveltyIndicatorsOut,
    NoveltyTaskOut,
    NoveltyTaskSummaryOut,
    ReferenceSheetRowOut,
    SourceEvaluationOut,
)


def task_to_summary(task: NoveltySearchTask) -> dict[str, Any]:
    return NoveltyTaskSummaryOut(
        id=task.id,
        title=task.title,
        subject_code=task.subject_code,
        subject_name=None,
        status=task.status,
        source=task.source,
        file_name=task.file_name,
        sheet_confirmed=task.sheet_confirmed,
        task_conclusion=task.task_conclusion,
        task_summary=task.task_summary,
        compare_done=task.compare_done,
        compare_total=task.compare_total,
        report_state=task.report_state,
        created_at=task.created_at,
        updated_at=task.updated_at,
    ).model_dump()


def _sheet_rows(task: NoveltySearchTask) -> list[ReferenceSheetRowOut]:
    raw = task.reference_sheet_json if isinstance(task.reference_sheet_json, list) else []
    out: list[ReferenceSheetRowOut] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        out.append(
            ReferenceSheetRowOut(
                id=str(row.get("id") or ""),
                std_no=str(row.get("std_no") or ""),
                std_name=str(row.get("std_name") or ""),
                tech_fragment=row.get("tech_fragment"),
                remark=row.get("remark"),
            )
        )
    return out


def _compare_rows(task: NoveltySearchTask) -> list[NoveltyCompareRowOut]:
    raw = task.compare_rows_json if isinstance(task.compare_rows_json, list) else []
    out: list[NoveltyCompareRowOut] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        out.append(NoveltyCompareRowOut(**row))
    return out


def _source_evaluations(task: NoveltySearchTask) -> list[SourceEvaluationOut]:
    raw = task.source_evaluations_json if isinstance(task.source_evaluations_json, list) else []
    out: list[SourceEvaluationOut] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        out.append(SourceEvaluationOut(**row))
    return out


def task_to_out(task: NoveltySearchTask) -> NoveltyTaskOut:
    indicators_available = bool(task.indicators_json)
    base = task_to_summary(task)
    return NoveltyTaskOut(
        **base,
        error_summary=task.error_summary,
        report_generated_at=task.report_generated_at,
        reference_sheet=_sheet_rows(task),
        compare_rows=_compare_rows(task),
        source_evaluations=_source_evaluations(task),
        indicators_available=indicators_available,
    )


def indicators_to_out(task: NoveltySearchTask) -> NoveltyIndicatorsOut:
    raw = task.indicators_json if isinstance(task.indicators_json, dict) else {}
    src = raw.get("source_evaluations") or task.source_evaluations_json or []
    src_out: list[SourceEvaluationOut] = []
    if isinstance(src, list):
        for row in src:
            if isinstance(row, dict):
                src_out.append(SourceEvaluationOut(**row))
    return NoveltyIndicatorsOut(
        enterprise_indicators=raw.get("enterprise_indicators") or [],
        national_by_std_code=raw.get("national_by_std_code") or {},
        source_evaluations=src_out,
    )
