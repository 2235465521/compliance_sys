from __future__ import annotations

from datetime import datetime
from typing import Any

from ninja import Schema


class BatchNormativeRefItemOut(Schema):
    id: int
    sort_order: int
    original_filename: str
    status: str
    error_message: str | None = None
    company_name: str | None = None
    qb_name: str | None = None
    enterprise_standard_name: str | None = None
    qb_code: str | None = None
    qb_title: str | None = None
    standard_name: str | None = None
    implementation_date: str | None = None
    effective_date: str | None = None
    publish_date: str | None = None
    references_resolved: list[dict[str, Any]] | None = None
    file_compliance_outcome: str | None = None


class BatchNormativeRefJobOut(Schema):
    id: int
    status: str
    label: str | None = None
    company_name: str | None = None
    total_items: int
    completed_items: int
    failed_items: int
    error_summary: str | None = None
    created_at: datetime
    updated_at: datetime
    items: list[BatchNormativeRefItemOut]


class BatchNormativeRefJobSummaryOut(Schema):
    """列表页摘要，不含子项数组。"""

    id: int
    status: str
    label: str | None = None
    total_items: int
    completed_items: int
    failed_items: int
    error_summary: str | None = None
    created_at: datetime
    updated_at: datetime


class BatchNormativeRefJobListOut(Schema):
    """分页列表；`total` 与 `count` 同值，便于前端宽松解析。"""

    results: list[BatchNormativeRefJobSummaryOut]
    count: int
    total: int
    page: int
    page_size: int


class PatchItemReferencesIn(Schema):
    """与 GET 子项中 `references_resolved` 单条结构一致的对象数组；可为空数组表示删光。"""

    references_resolved: list[dict[str, Any]]
