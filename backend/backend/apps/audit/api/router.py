from ninja import Router

from apps.core.api.auth import BearerAuthPlaceholder
from apps.core.schemas.common import AuthProbeOut, ModuleMetaOut

router = Router(tags=["audit"])


@router.get("/module", response=ModuleMetaOut, summary="模块元信息（占位）")
def module_info(request):
    return ModuleMetaOut(
        module="audit",
        requirement_section="8.7",
        scope="操作审计、Diff、仅超级管理员查询/导出；与 identity 权限收敛配合",
    )


@router.get(
    "/auth/probe",
    response=AuthProbeOut,
    summary="审计模块鉴权探针（需 Bearer；后续绑定超管角色）",
    auth=[BearerAuthPlaceholder()],
)
def audit_auth_probe(request):
    """后续在此校验 `request.user.is_superuser` 等；当前与 identity/auth/probe 一致为 Bearer 占位。"""
    return AuthProbeOut()
