from typing import List, Optional

from pydantic import BaseModel, Field


class NameCheckIn(BaseModel):
    """POST /duplicate-check/name-check 请求体（与旧 DRF 版 `keyword` 一致）。"""

    keyword: str = Field(default="", description="待查重的标准名称关键词")


class NameCheckItem(BaseModel):
    """单条名称相似结果；字段名与旧版 `bz_id` / `bz_name` / `status` 对齐，便于前端复用。"""

    bz_id: str = Field(description="国标号，对应 national_standard_basic.std_code")
    bz_name: str = Field(description="标准名称")
    status: Optional[str] = Field(default=None, description="标准状态，对应 std_status")
    similarity: float = Field(description="相似度分 0~100")


class NameCheckOut(BaseModel):
    success: bool
    message: Optional[str] = None
    data: Optional[List[NameCheckItem]] = None
    error: Optional[str] = None


class SemanticCheckIn(BaseModel):
    """POST /duplicate-check/semantic-check；`candidate_ids` 为国标号 std_code 列表。"""

    intent_text: str = Field(default="", description="立项意图说明")
    candidate_ids: List[str] = Field(
        default_factory=list,
        description="候选国标号（std_code），通常来自名称快查结果",
    )


class SemanticCheckOut(BaseModel):
    success: bool
    task_id: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None
