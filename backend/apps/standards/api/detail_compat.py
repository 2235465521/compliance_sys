"""兼容路径：标准详情编辑/删除（挂载在 `/api/`）。"""

from ninja import Body, Query, Router

from apps.standards.schemas.registry import StandardPatchIn
from apps.standards.services import registry as registry_svc

router = Router(tags=["compat-standards-detail"])


@router.patch(
    "/standards/detail-info/",
    response=dict,
    summary="兼容：更新标准主表+扩展",
)
@router.patch("/standards/detail-info", include_in_schema=False)
def compat_standards_detail_patch(
    request,
    bz_id: str = Query(..., description="主键 id 或国标号"),
    body: StandardPatchIn = Body(...),
):
    try:
        out = registry_svc.patch_standard(bz_id=bz_id, patch=body)
        return {"code": 200, "msg": "ok", "data": out.model_dump(mode="json")}
    except ValueError as e:
        msg = str(e)
        code = 404 if "未找到标准" in msg else 400
        return {"code": code, "msg": msg}


@router.delete(
    "/standards/detail-info/",
    response=dict,
    summary="兼容：DELETE 同上（national_standard_basic / extension / standard_pedigree）",
)
@router.delete("/standards/detail-info", include_in_schema=False)
def compat_standards_detail_delete(request, bz_id: str = Query(...)):
    try:
        code = registry_svc.delete_standard(bz_id=bz_id)
        return {"code": 200, "msg": "ok", "data": {"bzId": code, "deleted": True}}
    except ValueError as e:
        return {"code": 404, "msg": str(e)}
