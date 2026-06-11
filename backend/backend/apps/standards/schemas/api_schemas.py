from __future__ import annotations

from pydantic import BaseModel, Field


class ResolveLatestQueryOut(BaseModel):
    """单条标准号查新结果（与 ``reference_resolution.resolve_latest_for_code`` 字段对齐）。"""

    query_bz_id: str = ""
    is_latest: bool = True
    current_latest_id: str = ""
    current_latest_std_codes: list[str] = Field(default_factory=list)
    pedigree_chain: str = ""
    resolution_path: str = ""
    inferred_historical_std_code: str | None = None
    enterprise_as_of_year: int | None = None
    historical_full_std_code: str | None = None


class ResolveLatestBatchItemIn(BaseModel):
    referenced_std: str = Field(description="企标或文档中的引用标准号")
    qb_code: str | None = Field(default=None, description="企标号 Q/…，用于无年代号时点推断")
    enterprise_as_of_year: int | None = Field(
        default=None,
        description="企标发布年等时点；缺省时用当前年",
    )


class ResolveLatestBatchIn(BaseModel):
    items: list[ResolveLatestBatchItemIn] = Field(min_length=1, max_length=100)


class ResolveLatestBatchItemOut(BaseModel):
    referenced_std: str
    result: dict


class ResolveLatestBatchOut(BaseModel):
    items: list[ResolveLatestBatchItemOut]


class NationalStandardNamesOut(BaseModel):
    names: dict[str, str] = Field(description="标准号 → 标准名称（仅展示，不参与合规判定）")
