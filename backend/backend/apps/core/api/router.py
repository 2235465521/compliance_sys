from ninja import Router

from apps.core.api.deps import client_ip
from apps.core.schemas.common import HealthOut, ModuleMetaOut

router = Router(tags=["core"])


@router.get("/health", response=HealthOut, summary="服务健康检查")
def health(request):
    return HealthOut(status="ok", service="regulation-platform-api")


@router.get("/module", response=ModuleMetaOut, summary="模块元信息（占位）")
def module_info(request):
    _ = client_ip(request)
    return ModuleMetaOut(
        module="core",
        requirement_section="公共",
        scope="健康检查、公共异常/分页、依赖工具；鉴权占位见 apps.core.api.auth",
    )
