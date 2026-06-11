from pydantic import BaseModel, Field


class HealthOut(BaseModel):
    """GET /api/v1/health"""

    status: str = Field(description="服务状态，如 ok")
    service: str = Field(description="服务名称")


class ModuleMetaOut(BaseModel):
    """各业务域 GET .../module 占位响应；后续可扩展 version、owner 等字段。"""

    module: str = Field(description="模块标识，与 apps 目录名一致")
    requirement_section: str = Field(description="对应需求章节，如 8.1")
    scope: str = Field(description="职责摘要")


class AuthProbeOut(BaseModel):
    """用于演示 Ninja `auth=[BearerAuthPlaceholder()]` 的探针响应（需携带 Authorization: Bearer）。"""

    ok: bool = True
    message: str = "Bearer 占位校验通过（未验证 JWT 签名）"
