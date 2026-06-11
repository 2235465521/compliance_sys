from __future__ import annotations

from datetime import datetime
from typing import Any

from ninja import Schema
from pydantic import Field


class ReferenceSheetRowOut(Schema):
    id: str
    std_no: str
    std_name: str = ""
    tech_fragment: str | None = None
    remark: str | None = None


class ReferenceSheetPatchIn(Schema):
    rows: list[ReferenceSheetRowOut]


class ConfirmSheetIn(Schema):
    rows: list[ReferenceSheetRowOut] | None = None


class NoveltyCompareRowOut(Schema):
    id: str
    sheet_row_id: str
    referenced_std_code: str
    full_std_at_publication: str | None = None
    baseline_latest_std_primary: str | None = None
    current_latest_std_primary: str | None = None
    row_conclusion: str
    row_conclusion_label: str
    compliance_assessable: bool = False
    explanation: str | None = None
    baseline_source: str | None = None
    baseline_recorded_at: str | None = None


class SourceEvaluationOut(Schema):
    source_type: str
    source_id: int
    evaluated_at: str
    title: str


class NoveltyIndicatorsOut(Schema):
    enterprise_indicators: list[dict[str, Any]] = Field(default_factory=list)
    national_by_std_code: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    source_evaluations: list[SourceEvaluationOut] = Field(default_factory=list)


class NoveltyTaskSummaryOut(Schema):
    id: int
    title: str
    subject_code: str
    subject_name: str | None = None
    status: str
    source: str
    file_name: str | None = None
    sheet_confirmed: bool
    task_conclusion: str | None = None
    task_summary: str | None = None
    compare_done: int
    compare_total: int
    report_state: str
    created_at: datetime
    updated_at: datetime


class NoveltyTaskOut(NoveltyTaskSummaryOut):
    error_summary: str | None = None
    report_generated_at: datetime | None = None
    reference_sheet: list[ReferenceSheetRowOut] = Field(default_factory=list)
    compare_rows: list[NoveltyCompareRowOut] = Field(default_factory=list)
    source_evaluations: list[SourceEvaluationOut] = Field(default_factory=list)
    indicators_available: bool = False


class NoveltyTaskListOut(Schema):
    results: list[NoveltyTaskSummaryOut]
    total: int
    page: int
    page_size: int


class ReportOut(Schema):
    report_state: str
    report_url: str | None = None
