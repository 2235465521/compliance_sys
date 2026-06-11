from __future__ import annotations

from datetime import datetime

from django.http import HttpResponse
from ninja import Query, Router
from ninja.errors import HttpError

from apps.core.schemas.common import ModuleMetaOut
from apps.standards.schemas.api_schemas import (
    NationalStandardNamesOut,
    ResolveLatestBatchIn,
    ResolveLatestBatchOut,
    ResolveLatestBatchItemOut,
    ResolveLatestQueryOut,
)
from apps.standards.schemas.pedigree import PedigreeNodeUpdateBody
from apps.standards.schemas.registry import (
    ApiEnvelopeStatistics,
    BatchImportOut,
    NationalStandardIndicatorItem,
    NationalStandardIndicatorListOut,
    StandardDetailOut,
    StandardPaginatedOut,
    StandardPatchIn,
    StdIndexImportHistoryOut,
    StdIndexImportItemOut,
    StdIndexImportJobApproveAllIn,
    StdIndexImportJobApproveAllOut,
    StdIndexImportJobListOut,
    StdIndexImportJobOut,
    StdIndexImportJobSummaryOut,
    StdIndexImportOut,
    StdIndexReviewOut,
    StdIndexReviewPutIn,
    StdIndexReviewPutOut,
)
from apps.engine.dify_client import DifyApiError
from apps.standards.services import import_template, reference_resolution
from apps.standards.services import registry as registry_svc
from apps.standards.services import std_index_batch as std_index_batch_svc
from apps.standards.services import std_index_import as std_index_import_svc
from apps.standards.services import std_text_file as std_text_file_svc

router = Router(tags=["standards"])


@router.get("/module", response=ModuleMetaOut, summary="模块元信息")
def module_info(request):
    return ModuleMetaOut(
        module="standards",
        requirement_section="8.1",
        scope="ICS/CCS/元数据/正文拆解/谱系/检索统计；对齐 v1.0-sql 标准库表",
    )


@router.get(
    "/",
    response=StandardPaginatedOut,
    summary="标准列表（DRF 风格分页；筛选走库字段 std_status）",
)
def standards_list(
    request,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str | None = Query(None, description="国标号、名称模糊搜"),
    std_status: str | None = Query(None, description="与 std_status 模糊匹配（现行/废止等）"),
    ex_state: str | None = Query(
        None,
        description="已弃用：与 std_status 二选一即可，效果同 std_status 筛选（兼容旧前端）",
    ),
):
    status_filter = std_status or ex_state
    return registry_svc.list_standards(
        request,
        page=page,
        page_size=page_size,
        search=search,
        status_filter=status_filter,
    )


@router.get(
    "/detail-info/",
    response=StandardDetailOut,
    summary="标准详情（抽屉）：Query bz_id，可为库 id 或 std_code",
)
def standards_detail_info(request, bz_id: str = Query(..., description="主键 id 或国标号")):
    out = registry_svc.get_detail(bz_id=bz_id)
    if out is None:
        raise HttpError(404, "标准不存在")
    return out


@router.get(
    "/statistics/",
    response=ApiEnvelopeStatistics,
    summary="标准库统计（ApiEnvelope：code=200 + data）",
)
def standards_statistics(request):
    return registry_svc.statistics()


@router.get(
    "/resolve-latest",
    response=ResolveLatestQueryOut,
    summary="单条标准号 → 现行最新（谱系只读）",
)
def get_resolve_latest(request, std_code: str = Query(..., description="待查新的标准号")):
    raw = reference_resolution.resolve_latest_for_code(std_code)
    return ResolveLatestQueryOut(**{k: v for k, v in raw.items() if k in ResolveLatestQueryOut.model_fields})


@router.post(
    "/resolve-latest/batch",
    response=ResolveLatestBatchOut,
    summary="批量引用号查新（无合规任务上下文）",
)
def post_resolve_latest_batch(request, body: ResolveLatestBatchIn):
    fallback_year = datetime.now().year
    out_items: list[ResolveLatestBatchItemOut] = []
    for item in body.items:
        pr: dict = {}
        if item.enterprise_as_of_year is not None:
            pr["enterprise_publish_year"] = item.enterprise_as_of_year
        result = reference_resolution.resolve_reference_for_parse_context(
            item.referenced_std,
            pr=pr,
            qb_code=item.qb_code,
            fallback_year=fallback_year,
        )
        out_items.append(
            ResolveLatestBatchItemOut(referenced_std=item.referenced_std.strip(), result=result)
        )
    return ResolveLatestBatchOut(items=out_items)


@router.get(
    "/national-standard-names",
    response=NationalStandardNamesOut,
    summary="按标准号批量查询国标名称（展示用）",
)
def get_national_standard_names(
    request,
    codes: str = Query(..., description="逗号分隔的标准号列表，如 GB/T 191,GB 2762"),
):
    parts = [p.strip() for p in (codes or "").split(",") if p.strip()]
    names = reference_resolution.fetch_national_standard_names_by_codes(parts)
    return NationalStandardNamesOut(names=names)


@router.get(
    "/metadata-import-template/",
    summary="下载国标元数据批量入库空白模板（CSV 或 xlsx）",
)
def metadata_import_template(
    request,
    file_format: str = Query("xlsx", alias="format", description="csv 或 xlsx"),
):
    fmt = (file_format or "xlsx").strip().lower()
    if fmt == "csv":
        body = import_template.template_csv_bytes()
        resp = HttpResponse(body, content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = (
            'attachment; filename="national_standard_basic_import_template.csv"'
        )
        return resp
    if fmt == "xlsx":
        try:
            body = import_template.template_xlsx_bytes()
        except ImportError as e:
            raise HttpError(500, str(e)) from e
        resp = HttpResponse(
            body,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        resp["Content-Disposition"] = (
            'attachment; filename="national_standard_basic_import_template.xlsx"'
        )
        return resp
    raise HttpError(400, "format 仅支持 csv 或 xlsx")


@router.post(
    "/metadata-batch-import/",
    response=BatchImportOut,
    summary="批量元数据入库（仅新建；国标号已在库则整行拒绝，不覆盖）",
    description=(
        "处理完成后若存在因国标号重复被拒绝的行，将返回 HTTP 400，"
        "detail 为可直接用于弹窗的说明（便于前端统一走错误提示）。"
        "部分行成功新建时 detail 中会注明已新建条数。"
    ),
)
def metadata_batch_import(request):
    files = request.FILES.getlist("files")
    if not files:
        raise HttpError(400, "请使用 multipart/form-data，字段名 files 上传至少一个文件")
    out = registry_svc.batch_import_metadata(list(files), on_duplicate="reject")
    if out.rejected_duplicates > 0:
        if out.imported > 0:
            headline = (
                "无效入库：部分标准号在库中已存在，这些行未写入；"
                f"其余 {out.imported} 条已新建。"
            )
        else:
            headline = "无效入库：标准号在库中已存在，未写入新数据。"
        tail = (
            f"共拒绝 {out.rejected_duplicates} 行重复。"
        )
        if out.errors:
            preview = " ".join(out.errors[:8])
            if len(out.errors) > 8:
                preview += " …"
            tail = f"{tail} {preview}"
        raise HttpError(400, f"{headline} {tail}".strip())
    return out


@router.post(
    "/metadata-batch-import-upsert/",
    response=BatchImportOut,
    summary="批量元数据覆盖入库（按 std_code 更新已有行；慎用）",
)
def metadata_batch_import_upsert(request):
    files = request.FILES.getlist("files")
    if not files:
        raise HttpError(400, "请使用 multipart/form-data，字段名 files 上传至少一个文件")
    return registry_svc.batch_import_metadata(list(files), on_duplicate="update")


@router.patch(
    "/pedigree/node/",
    response=StandardDetailOut,
    summary="谱系图节点属性：更新主表与扩展表（不修改 std_code）",
)
def standards_pedigree_node_patch(request, body: PedigreeNodeUpdateBody):
    bid = (body.bz_id or "").strip()
    if not bid:
        raise HttpError(400, "缺少 bzId")
    payload = body.model_dump(exclude_unset=True)
    payload.pop("bz_id", None)
    patch = StandardPatchIn.model_validate(payload)
    try:
        return registry_svc.patch_standard(bz_id=bid, patch=patch)
    except ValueError as e:
        msg = str(e)
        if "未找到标准" in msg:
            raise HttpError(404, msg) from e
        raise HttpError(400, msg) from e


@router.get(
    "/index-import/debug/",
    include_in_schema=False,
    summary="[临时] 诊断国标指标 Dify 配置",
)
def std_index_debug(request):
    import os
    from apps.engine.dify_client import DifyClient
    c = DifyClient()
    return {
        "env_key": bool(os.environ.get("STD_INDEX_DIFY_API_KEY")),
        "env_base": bool(os.environ.get("STD_INDEX_DIFY_API_BASE")),
        "client_key": bool(c.std_index_api_key),
        "client_base": bool(c.std_index_api_base),
        "client_input_key": c.std_index_files_input_key,
        "is_configured": c.is_std_index_configured(),
        "env_key_val": (os.environ.get("STD_INDEX_DIFY_API_KEY") or "")[:15],
    }


@router.post(
    "/index-import/",
    response=StdIndexImportOut,
    summary="国标指标入库：上传国标文件 → Dify 解析 → 写入 national_standard_indicator",
    description=(
        "multipart/form-data，字段名 file，支持 PDF/Word 等 Dify 可处理格式。"
        "Dify 工作流输入变量 file，输出变量 output（JSON 含 bz_id + indexes）。"
        "replace=true（默认）时先清除该国标号的旧指标再插入新行。"
    ),
)
def std_index_import(
    request,
    replace: bool = Query(True, description="是否先清除该国标号的旧指标（默认 true）"),
):
    uploaded = request.FILES.get("file")
    if not uploaded:
        raise HttpError(400, "请使用 multipart/form-data，字段名 file 上传国标文件")
    std_code = (request.POST.get("std_code") or request.POST.get("stdCode") or "").strip() or None
    try:
        result = std_index_import_svc.import_std_index_from_upload(
            uploaded, replace=replace, std_code_hint=std_code
        )
    except DifyApiError as e:
        raise HttpError(502, f"Dify 工作流调用失败: {e}") from e
    except RuntimeError as e:
        raise HttpError(503, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HttpError(500, f"指标入库失败: {e}") from e
    return StdIndexImportOut(
        bz_id=result.get("bz_id") or "",
        imported=result.get("imported", 0),
        skipped=result.get("skipped", 0),
        warning=result.get("warning"),
        indexes_count=result.get("indexes_count", 0),
    )


def _item_to_out(item) -> StdIndexImportItemOut:
    return StdIndexImportItemOut(
        id=item.id,
        sort_order=item.sort_order,
        original_filename=item.original_filename,
        status=item.status,
        std_code=item.std_code,
        indexes_count=item.indexes_count,
        manual_review_status=item.manual_review_status,
        error_message=item.error_message,
        created_at=item.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        updated_at=item.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
    )


def _job_to_out(job, include_items: bool = True) -> StdIndexImportJobOut:
    items = [_item_to_out(it) for it in job.items.all()] if include_items else []
    return StdIndexImportJobOut(
        id=job.id,
        status=job.status,
        label=job.label,
        total_items=job.total_items,
        completed_items=job.completed_items,
        failed_items=job.failed_items,
        error_summary=job.error_summary,
        created_at=job.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        updated_at=job.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
        items=items,
    )


@router.post(
    "/index-import-jobs/",
    response={201: StdIndexImportJobOut},
    summary="国标指标批量入库：创建批次，后台依次调用 Dify，前端轮询进度",
    description=(
        "multipart/form-data，字段名 files（可多选），可选字段 label（批次标签）。"
        "单次最多 100 个文件（STD_INDEX_BATCH_MAX_FILES）。"
        "创建后立即返回 201，后台 Celery/线程异步逐文件调用 Dify；"
        "轮询 GET /index-import-jobs/{id}/ 查看进度。"
    ),
)
def std_index_create_job(request):
    from ninja import Status as NinjaStatus
    from ninja.errors import HttpError as NinjaHttpError

    files = request.FILES.getlist("files")
    label = (request.POST.get("label") or "").strip() or None
    try:
        job = std_index_batch_svc.create_job(files, label=label)
    except NinjaHttpError:
        raise
    except Exception as e:  # noqa: BLE001
        raise HttpError(500, f"批量任务创建失败: {e}") from e
    job.refresh_from_db()
    return NinjaStatus(201, _job_to_out(job))


@router.get(
    "/index-import-jobs/",
    response=StdIndexImportJobListOut,
    summary="国标指标入库批次列表（摘要，无子项明细）",
)
def std_index_list_jobs(
    request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
):
    data = std_index_batch_svc.list_jobs(page=page, page_size=page_size)
    summaries = [
        StdIndexImportJobSummaryOut(
            id=j.id,
            status=j.status,
            label=j.label,
            total_items=j.total_items,
            completed_items=j.completed_items,
            failed_items=j.failed_items,
            error_summary=j.error_summary,
            created_at=j.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            updated_at=j.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
        )
        for j in data["results"]
    ]
    return StdIndexImportJobListOut(
        results=summaries,
        count=data["count"],
        total=data["total"],
        page=data["page"],
        page_size=data["page_size"],
    )


@router.get(
    "/index-import-jobs/{job_id}/",
    response=StdIndexImportJobOut,
    summary="查询国标指标入库批次详情（含所有文件条目）",
)
def std_index_get_job(request, job_id: int):
    job = std_index_batch_svc.get_job(job_id)
    if job is None:
        raise HttpError(404, f"批次 {job_id} 不存在")
    return _job_to_out(job)


@router.post(
    "/index-import-jobs/{job_id}/approve-all/",
    response=StdIndexImportJobApproveAllOut,
    summary="批次一键审核：对本批次已完成且待审的文件批量通过（或拒绝）",
)
def std_index_job_approve_all(
    request,
    job_id: int,
    body: StdIndexImportJobApproveAllIn | None = None,
):
    payload = body or StdIndexImportJobApproveAllIn()
    try:
        result = std_index_batch_svc.approve_all_job_items(
            job_id,
            only_pending=payload.only_pending,
            manual_review_status=payload.manual_review_status,
        )
    except HttpError:
        raise
    except Exception as e:  # noqa: BLE001
        raise HttpError(500, f"批量审核失败: {e}") from e
    return StdIndexImportJobApproveAllOut(**result)


@router.delete(
    "/index-import-jobs/{job_id}/",
    summary="删除国标指标入库批次及其所有条目",
)
def std_index_delete_job(request, job_id: int):
    std_index_batch_svc.delete_job(job_id)
    return HttpResponse(status=204)


# 保留旧端点兼容已有前端（内部转发到新接口）
@router.post(
    "/batch-index-import/",
    response=StdIndexImportJobOut,
    summary="[兼容] 国标指标批量入库（同 /index-import-jobs/，保留旧路径）",
    include_in_schema=False,
)
def std_index_batch_import(request):
    from ninja.errors import HttpError as NinjaHttpError

    files = request.FILES.getlist("files")
    label = (request.POST.get("label") or "").strip() or None
    try:
        job = std_index_batch_svc.create_job(files, label=label)
    except NinjaHttpError:
        raise
    except Exception as e:  # noqa: BLE001
        raise HttpError(500, f"批量任务创建失败: {e}") from e
    job.refresh_from_db()
    return _job_to_out(job)


@router.get(
    "/batch-index-import/{job_id}/",
    response=StdIndexImportJobOut,
    summary="[兼容] 查询批量入库进度（同 /index-import-jobs/{id}/）",
    include_in_schema=False,
)
def std_index_batch_status(request, job_id: str):
    # 前端轮询时 jobId 尚未初始化时会发 "undefined"，静默返回空状态
    if not job_id or job_id == "undefined":
        from apps.standards.models import NationalStandardIndexImportJob as _Job
        dummy = _Job(
            id=0, status="idle", total_items=0, completed_items=0, failed_items=0
        )
        dummy.created_at = dummy.updated_at = __import__("django.utils.timezone", fromlist=["now"]).now()
        return StdIndexImportJobOut(
            id=0,
            status="idle",
            total_items=0,
            completed_items=0,
            failed_items=0,
            created_at="",
            updated_at="",
            items=[],
        )
    try:
        jid = int(job_id)
    except ValueError:
        raise HttpError(404, f"批次 {job_id!r} 不存在")
    job = std_index_batch_svc.get_job(jid)
    if job is None:
        raise HttpError(404, f"批次 {job_id} 不存在")
    return _job_to_out(job)


@router.get(
    "/index-import-history/",
    response=StdIndexImportHistoryOut,
    summary="国标指标入库历史记录列表",
    description="按入库时间倒序。可用 stdCode 筛选指定国标号的历史，page/pageSize 分页。",
)
def std_index_import_history(
    request,
    std_code: str | None = Query(None, alias="stdCode", description="按国标号筛选（可选）"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
):
    from apps.standards.models import NationalStandardIndexImportHistory

    qs = NationalStandardIndexImportHistory.objects.all().order_by("-id")
    if std_code:
        qs = qs.filter(std_code=std_code)

    total = qs.count()
    offset = (page - 1) * page_size
    rows = qs[offset: offset + page_size]

    items = [
        {
            "id": r.id,
            "std_code": r.std_code,
            "original_filename": r.original_filename,
            "import_status": r.import_status,
            "indexes_count": r.indexes_count,
            "manual_review_status": r.manual_review_status,
            "error_message": r.error_message,
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": r.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
        }
        for r in rows
    ]
    return StdIndexImportHistoryOut(count=total, results=items)


@router.get(
    "/indicator-list/",
    response=NationalStandardIndicatorListOut,
    summary="国标指标列表：展示 national_standard_indicator 表，支持国标号查询",
    description=(
        "默认按主键 id 倒序（最新入库在最前）。"
        "可用 stdCode 模糊查询指定国标号，返回标准号、indexes 数组和审核状态。"
    ),
)
def std_indicator_list(
    request,
    std_code: str | None = Query(None, alias="stdCode", description="按国标号筛选（支持模糊，可选）"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
):
    import json
    from apps.standards.models import NationalStandardIndicator

    qs = NationalStandardIndicator.objects.all().order_by("-id")
    if std_code:
        qs = qs.filter(std_code__icontains=std_code)

    total = qs.count()
    offset = (page - 1) * page_size
    rows = qs[offset: offset + page_size]

    items = []
    for r in rows:
        indexes = None
        if r.specific_indicator_value:
            try:
                indexes = json.loads(r.specific_indicator_value)
            except Exception:  # noqa: BLE001
                indexes = None
        items.append(NationalStandardIndicatorItem(
            id=r.id,
            std_code=r.std_code,
            indexes=indexes,
            manual_review_status=r.manual_review_status,
        ))

    return NationalStandardIndicatorListOut(count=total, results=items)


@router.delete(
    "/indicator-list/{indicator_id}/",
    summary="删除指定国标指标记录（从 national_standard_indicator 表删除）",
)
def std_indicator_delete(request, indicator_id: int):
    from apps.standards.models import NationalStandardIndicator
    deleted, _ = NationalStandardIndicator.objects.filter(pk=indicator_id).delete()
    if deleted == 0:
        raise HttpError(404, f"指标记录 {indicator_id} 不存在")
    return HttpResponse(status=204)


@router.get(
    "/index-review/",
    response=StdIndexReviewOut,
    summary="查询国标指标审核数据：返回解析后的 indexes 列表",
    description="Query 参数 std_code 传入国标号，返回当前存储的 indexes 数组和审核状态。",
)
def std_index_review_get(
    request,
    std_code: str = Query(..., alias="stdCode", description="国标号，如 GB 1002-2024"),
):
    result = std_index_import_svc.get_std_index_for_review(std_code)
    return StdIndexReviewOut(
        record_id=result["record_id"],
        std_code=result["std_code"],
        indexes=result["indexes"],
        manual_review_status=result["manual_review_status"],
    )


@router.put(
    "/index-review/",
    response=StdIndexReviewPutOut,
    summary="提交国标指标审核结果：保存修改后的 indexes 并更新 manual_review_status",
    description=(
        "Query 参数 std_code 指定国标号。"
        "请求体 indexes 为前端经过编辑/删除后保留的指标数组，"
        "manualReviewStatus 默认 approved（一键通过）也可传 rejected（一键去除）。"
    ),
)
def std_index_review_put(
    request,
    body: StdIndexReviewPutIn,
    std_code: str = Query(..., alias="stdCode", description="国标号"),
):
    try:
        result = std_index_import_svc.save_reviewed_indexes(
            std_code,
            body.indexes,
            manual_review_status=body.manual_review_status,
        )
    except Exception as e:  # noqa: BLE001
        raise HttpError(500, f"审核保存失败: {e}") from e
    return StdIndexReviewPutOut(
        std_code=result["std_code"],
        indexes_count=result["indexes_count"],
        manual_review_status=result["manual_review_status"],
    )


@router.get(
    "/detail-text/preview/",
    summary="正文在线预览：读 std_file_path；本地文件 inline，外联 http(s) 302",
)
@router.get(
    "/detail-text/preview",
    include_in_schema=False,
    summary="正文在线预览：读 std_file_path；本地文件 inline，外联 http(s) 302",
)
def standards_detail_text_preview(request, bz_id: str = Query(..., description="主键 id 或国标号")):
    return std_text_file_svc.respond_standard_text(bz_id=bz_id, attachment=False)


@router.get(
    "/detail-text/download/",
    summary="正文下载：读 std_file_path；本地文件 attachment；外联 302",
)
@router.get(
    "/detail-text/download",
    include_in_schema=False,
    summary="正文下载：读 std_file_path；本地文件 attachment；外联 302",
)
def standards_detail_text_download(request, bz_id: str = Query(..., description="主键 id 或国标号")):
    return std_text_file_svc.respond_standard_text(bz_id=bz_id, attachment=True)
