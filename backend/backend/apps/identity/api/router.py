from ninja import Router

from apps.core.api.auth import BearerAuthPlaceholder
from apps.core.schemas.common import AuthProbeOut, ModuleMetaOut

router = Router(tags=["identity"])


@router.get("/module", response=ModuleMetaOut, summary="模块元信息（占位）")
def module_info(request):
    return ModuleMetaOut(
        module="identity",
        requirement_section="8.7（用户与权限）",
        scope="登录、用户、角色 RBAC、超级管理员 / 操作兼审核员",
    )


@router.get(
    "/auth/probe",
    response=AuthProbeOut,
    summary="鉴权探针（需 Authorization: Bearer）",
    auth=[BearerAuthPlaceholder()],
)
def auth_probe(request):
    """演示鉴权依赖挂载方式；生产请替换 BearerAuthPlaceholder 为真实 JWT 校验。"""
    return AuthProbeOut()
