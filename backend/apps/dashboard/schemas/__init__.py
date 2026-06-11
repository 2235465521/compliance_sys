"""仪表盘专有响应；统计体与 `ApiEnvelopeStatistics` 一致。"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from apps.standards.schemas.registry import ApiEnvelopeStatistics, StandardExtensionOut

__all__ = [
    "ApiEnvelopeStatistics",
    "AbolitionHintItem",
    "AbolitionHintsData",
    "AbolitionHintsOut",
    "EffectiveHintItem",
    "EffectiveHintsData",
    "EffectiveHintsOut",
    "QuickLookupDetailOut",
    "QuickLookupOut",
]


class QuickLookupDetailOut(BaseModel):
    """仪表盘快捷查标准：不含详情链接与本地文件路径（避免「下载文本」类展示）。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: int
    bz_id: str = Field(description="国标号（std_code）")
    bz_name: str | None = Field(None, description="标准名称，与 std_name 一致，完整返回")
    ex_state: str | None = None
    std_code: str
    std_name: str | None = Field(None, description="标准名称全文，前端宜换行展示勿单行截断")
    std_status: str | None = None
    publish_date: date | None = None
    effective_date: date | None = None
    abolition_date: date | None = None
    std_category: str | None = None
    replaces_std_code: str | None = None
    replace_type: str | None = None
    ccs_code: str | None = None
    ics_code: str | None = None
    ped_id: str | None = None
    extension: StandardExtensionOut | None = None


class QuickLookupOut(BaseModel):
    model_config = ConfigDict(serialize_by_alias=True)

    code: int = 200
    data: QuickLookupDetailOut


class AbolitionHintItem(BaseModel):
    """单条提示：days_from_today = abolition_date − 统计当日（正数为尚未废止、距废止天数）。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    std_code: str = Field(serialization_alias="stdCode")
    std_name: str | None = Field(None, serialization_alias="stdName")
    std_status: str | None = Field(None, serialization_alias="stdStatus")
    abolition_date: date = Field(serialization_alias="abolitionDate")
    days_from_today: int = Field(
        serialization_alias="daysFromToday",
        description="废止日相对今天的偏差：>0 距废止尚有天数；<0 已废止过去天数；0 为当天",
    )


class AbolitionHintsData(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    as_of: date = Field(description="服务端用于比较的当前日期（自然日）")
    window_days: int = Field(
        serialization_alias="windowDays",
        description="本次查询使用的「即将废止」向前看窗口天数（与请求 upcoming_days 一致）",
    )
    upcoming: list[AbolitionHintItem] = Field(
        description="abolition_date 在 [今天, 今天+windowDays] 内（尚未废止）"
    )
    recent: list[AbolitionHintItem] = Field(
        description="abolition_date 在 [今天−recentDays, 今天) 内（近期已废止）"
    )
    recent_days: int = Field(
        serialization_alias="recentDays",
        description="近期已废止回溯窗口天数（与请求 recent_days 一致）",
    )


class AbolitionHintsOut(BaseModel):
    model_config = ConfigDict(serialize_by_alias=True)

    code: int = 200
    data: AbolitionHintsData


class EffectiveHintItem(BaseModel):
    """单条提示：days_from_today = effective_date − 今天（正数=距实施尚有天数）。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    std_code: str = Field(serialization_alias="stdCode")
    std_name: str | None = Field(None, serialization_alias="stdName")
    std_status: str | None = Field(None, serialization_alias="stdStatus")
    effective_date: date = Field(serialization_alias="effectiveDate")
    days_from_today: int = Field(
        serialization_alias="daysFromToday",
        description="实施日相对今天：>0 距实施尚有天数；0 为实施日当天",
    )


class EffectiveHintsData(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    as_of: date
    window_days: int = Field(
        serialization_alias="windowDays",
        description="向前看窗口天数（与请求 window_days 一致）",
    )
    upcoming: list[EffectiveHintItem] = Field(
        description="effective_date 在 [今天, 今天+windowDays]，且非现行/废止"
    )


class EffectiveHintsOut(BaseModel):
    model_config = ConfigDict(serialize_by_alias=True)

    code: int = 200
    data: EffectiveHintsData
