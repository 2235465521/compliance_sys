from ninja import Router

from apps.core.schemas.common import ModuleMetaOut

router = Router(tags=["archive"])


@router.get("/module", response=ModuleMetaOut, summary="模块元信息（占位）")
def module_info(request):
    return ModuleMetaOut(
        module="archive",
        requirement_section="8.6",
        scope="模板配置、历史记录、下载中心（预览/打包）",
    )
