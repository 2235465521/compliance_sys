from ninja import Router

from apps.core.schemas.common import ModuleMetaOut

router = Router(tags=["alerting"])


@router.get("/module", response=ModuleMetaOut, summary="模块元信息（占位）")
def module_info(request):
    return ModuleMetaOut(
        module="alerting",
        requirement_section="8.5",
        scope="正向/反向/实时监控预警；一企一库引用再查新与巡检",
    )
