from __future__ import annotations

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class TaxonomyItemPatchIn(BaseModel):
    """PATCH 部分字段；仅更新 JSON 中出现的键（含显式 null 可清空可空字段）。"""

    model_config = ConfigDict(extra="ignore")

    ics_code: str | None = Field(
        None,
        description="ICS 分类号",
        validation_alias=AliasChoices("ics_code", "code"),
    )
    ics_level: int | None = Field(
        None,
        description="ICS 层级",
        validation_alias=AliasChoices("ics_level", "level"),
    )
    ics_name: str | None = Field(
        None,
        description="ICS 名称",
        validation_alias=AliasChoices("ics_name", "name"),
    )
    ics_note: str | None = Field(None, description="ICS 注释")

    ccs_code: str | None = Field(
        None,
        description="CCS 代码（可与 code 二选一仅用于避免与 ICS 段别名冲突时写 ccs_code）",
    )
    ccs_name: str | None = Field(None, description="CCS 名称")
    parent_code: str | None = Field(None, description="CCS 父代码")
    ccs_note: str | None = Field(None, description="CCS 备注")
