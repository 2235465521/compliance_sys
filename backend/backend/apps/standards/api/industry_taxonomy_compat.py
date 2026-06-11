"""`/api/standards/industry-taxonomy/…`：与前端约定的行业分类导入与检索（code/msg/data）。"""

from django.db import DatabaseError
from django.http import HttpResponse

from ninja import Body, Query, Router

from apps.standards.schemas.industry_taxonomy import TaxonomyItemPatchIn
from apps.standards.services import classification_table_template as table_tpl
from apps.standards.services import industry_taxonomy as taxonomy_svc

router = Router(tags=["standards-industry-taxonomy"])

_DB_UNAVAILABLE = "行业分类表未就绪，请在后端执行: python manage.py migrate standards"


@router.post("/standards/industry-taxonomy/import/")
def industry_taxonomy_import(request):
    """官方格式 xlsx（ICS+Sheet2 / CCS sheet）：按分类号 upsert，不清空整表。"""
    scheme = (request.POST.get("scheme") or "").strip()
    upload = request.FILES.get("file")
    if not upload:
        return {"code": 400, "msg": "请使用 multipart/form-data，字段名 file 上传文件"}
    if not scheme:
        return {"code": 400, "msg": "缺少参数 scheme（ICS 或 CCS）"}
    try:
        data = taxonomy_svc.import_taxonomy_file(upload, scheme)
        return {"code": 200, "msg": "ok", "data": data}
    except ValueError as e:
        return {"code": 400, "msg": str(e)}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}
    except Exception as e:  # noqa: BLE001
        return {"code": 500, "msg": str(e)}


@router.get("/standards/industry-taxonomy/table-import-template/")
def industry_taxonomy_table_import_template(
    request,
    scheme: str = Query(..., description="ICS 或 CCS"),
    file_format: str = Query("xlsx", alias="format", description="csv 或 xlsx"),
):
    """下载与库表字段对齐的 ICS / CCS 空白导入模板。"""
    sch = (scheme or "").strip().upper()
    if sch not in ("ICS", "CCS"):
        return {"code": 400, "msg": "scheme 必须是 ICS 或 CCS"}
    fmt = (file_format or "xlsx").strip().lower()
    if fmt == "csv":
        if sch == "ICS":
            body = table_tpl.template_ics_csv_bytes()
            resp = HttpResponse(body, content_type="text/csv; charset=utf-8")
            resp["Content-Disposition"] = (
                'attachment; filename="ics_industry_classification_import_template.csv"'
            )
            return resp
        body = table_tpl.template_ccs_csv_bytes()
        resp = HttpResponse(body, content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = (
            'attachment; filename="ccs_industry_classification_import_template.csv"'
        )
        return resp
    if fmt == "xlsx":
        if sch == "ICS":
            body = table_tpl.template_ics_xlsx_bytes()
            resp = HttpResponse(
                body,
                content_type=(
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ),
            )
            resp["Content-Disposition"] = (
                'attachment; filename="ics_industry_classification_import_template.xlsx"'
            )
            return resp
        body = table_tpl.template_ccs_xlsx_bytes()
        resp = HttpResponse(
            body,
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )
        resp["Content-Disposition"] = (
            'attachment; filename="ccs_industry_classification_import_template.xlsx"'
        )
        return resp
    return {"code": 400, "msg": "format 仅支持 csv 或 xlsx"}


@router.post("/standards/industry-taxonomy/import-table-template/")
def industry_taxonomy_import_table_template(request):
    """按「表头对齐库表」的 CSV/xlsx 导入：按分类号 upsert，不清空整表。"""
    scheme = (request.POST.get("scheme") or "").strip()
    upload = request.FILES.get("file")
    if not upload:
        return {"code": 400, "msg": "请使用 multipart/form-data，字段名 file 上传文件"}
    if not scheme:
        return {"code": 400, "msg": "缺少参数 scheme（ICS 或 CCS）"}
    try:
        data = taxonomy_svc.import_taxonomy_table_template(upload, scheme)
        return {"code": 200, "msg": "ok", "data": data}
    except ValueError as e:
        return {"code": 400, "msg": str(e)}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}
    except Exception as e:  # noqa: BLE001
        return {"code": 500, "msg": str(e)}


@router.get("/standards/industry-taxonomy/tree/")
def industry_taxonomy_tree(
    request,
    scheme: str | None = Query(
        None, description="必填：ICS 或 CCS，返回整表分类树"
    ),
):
    if scheme is None or not str(scheme).strip():
        return {"code": 400, "msg": "缺少参数 scheme（ICS 或 CCS）"}
    try:
        data = taxonomy_svc.taxonomy_tree(scheme)
        return {"code": 200, "msg": "ok", "data": data}
    except ValueError as e:
        return {"code": 400, "msg": str(e)}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}
    except Exception as e:  # noqa: BLE001
        return {"code": 500, "msg": str(e)}


@router.get("/standards/industry-taxonomy/query/")
def industry_taxonomy_query(
    request,
    q: str | None = Query(None, description="关键词：分类号、名称、注释等模糊匹配"),
    scheme: str | None = Query(
        None,
        description="已废弃：忽略。始终同时检索 ICS 与 CCS。",
    ),
):
    if q is None or not str(q).strip():
        return {"code": 400, "msg": "缺少参数 q"}
    try:
        data = taxonomy_svc.query_taxonomy(q, scheme)
        return {"code": 200, "msg": "ok", "data": data}
    except ValueError as e:
        return {"code": 400, "msg": str(e)}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}
    except Exception as e:  # noqa: BLE001
        return {"code": 500, "msg": str(e)}


@router.patch("/standards/industry-taxonomy/item/{item_id}/")
def industry_taxonomy_patch(
    request,
    item_id: int,
    scheme: str = Query(..., description="ICS 或 CCS"),
    body: TaxonomyItemPatchIn = Body(...),
):
    if not str(scheme).strip():
        return {"code": 400, "msg": "缺少参数 scheme（ICS 或 CCS）"}
    try:
        data = taxonomy_svc.patch_taxonomy_item(item_id, scheme, body)
        return {"code": 200, "msg": "ok", "data": data}
    except LookupError as e:
        return {"code": 404, "msg": str(e)}
    except ValueError as e:
        return {"code": 400, "msg": str(e)}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}
    except Exception as e:  # noqa: BLE001
        return {"code": 500, "msg": str(e)}


@router.delete("/standards/industry-taxonomy/item/{item_id}/")
def industry_taxonomy_delete(
    request,
    item_id: int,
    scheme: str = Query(..., description="ICS 或 CCS"),
):
    if not str(scheme).strip():
        return {"code": 400, "msg": "缺少参数 scheme（ICS 或 CCS）"}
    try:
        data = taxonomy_svc.delete_taxonomy_item(item_id, scheme)
        return {"code": 200, "msg": "ok", "data": data}
    except LookupError as e:
        return {"code": 404, "msg": str(e)}
    except ValueError as e:
        return {"code": 400, "msg": str(e)}
    except DatabaseError:
        return {"code": 503, "msg": _DB_UNAVAILABLE}
    except Exception as e:  # noqa: BLE001
        return {"code": 500, "msg": str(e)}
