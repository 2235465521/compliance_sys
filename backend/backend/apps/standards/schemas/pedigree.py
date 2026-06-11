"""谱系 API 请求体。"""

from pydantic import BaseModel, ConfigDict, Field

from apps.standards.schemas.registry import StandardPatchIn


class PedigreeNodeUpdateBody(StandardPatchIn):
    """谱系节点属性保存：`bz_id` 为节点国标号或库 id；其余字段与 `StandardPatchIn` 一致，均为可选增量更新。"""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    bz_id: str = Field(..., alias="bzId", description="节点 id 或国标号，与 get_tree_data 的 bz_id 一致")
