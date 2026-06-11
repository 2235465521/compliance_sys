"""前端约定的 `/api/` 路径（与 `/api/v1/` 并存）。"""

from django.db import DatabaseError

from ninja import Body, Query, Router

from apps.standards.schemas.pedigree import PedigreeNodeUpdateBody
from apps.standards.schemas.registry import StandardPatchIn
from apps.standards.services import pedigree as pedigree_svc
from apps.standards.services import registry as registry_svc

router = Router(tags=["standards-pedigree"])

_DB_UNAVAILABLE = "谱系数据表未就绪，请在后端执行: python manage.py migrate"


@router.get("/get_tree_data/")
def get_tree_data(request, bz_id: str | None = Query(None, description="当前标准 id 或国标号")):
    q = (bz_id or "").strip()
    if not q:
        return {"code": 400, "msg": "缺少参数 bz_id"}
    try:
        data = pedigree_svc.tree_data(q)
        return {"code": 200, "data": data}
    except ValueError as e:
        return {"code": 404, "msg": str(e)}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}


@router.get("/standards/check-latest/")
def check_latest(request, bz_id: str | None = Query(None, description="标准 id 或国标号")):
    q = (bz_id or "").strip()
    if not q:
        return {"code": 400, "msg": "缺少参数 bz_id"}
    try:
        return pedigree_svc.check_latest_flat(q)
    except ValueError as e:
        return {"code": 404, "msg": str(e)}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}


@router.patch("/standards/pedigree/node/")
def pedigree_node_patch(request, body: PedigreeNodeUpdateBody):
    """谱系节点属性保存：更新 `national_standard_basic` 及扩展表；不改变国标号。"""
    bid = (body.bz_id or "").strip()
    if not bid:
        return {"code": 400, "msg": "缺少 bzId"}
    try:
        payload = body.model_dump(exclude_unset=True)
        payload.pop("bz_id", None)
        patch = StandardPatchIn.model_validate(payload)
        out = registry_svc.patch_standard(bz_id=bid, patch=patch)
        return {"code": 200, "msg": "ok", "data": out.model_dump(mode="json")}
    except ValueError as e:
        msg = str(e)
        if "未找到标准" in msg:
            return {"code": 404, "msg": msg}
        return {"code": 400, "msg": msg}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}


@router.post("/standards/pedigree/relations/clear-for-std/")
def pedigree_relations_clear_for_std(
    request, bz_id: str | None = Query(None, description="标准 id 或国标号，与本节点一致")
):
    """删除该标准在 `standard_pedigree_relation` 中作为起点或终点的全部谱系边。"""
    q = (bz_id or "").strip()
    if not q:
        return {"code": 400, "msg": "缺少参数 bz_id"}
    try:
        n = pedigree_svc.delete_relations_for_std_code(q)
        return {"code": 200, "deleted": n}
    except ValueError as e:
        return {"code": 404, "msg": str(e)}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}
