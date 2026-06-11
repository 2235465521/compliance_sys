from __future__ import annotations

from typing import Any

from django.conf import settings
from django.http import HttpResponse
from ninja import Router
from ninja.errors import HttpError

from apps.batch_normative_reference.schemas import (
    BatchNormativeRefItemOut,
    BatchNormativeRefJobListOut,
    BatchNormativeRefJobOut,
    PatchItemReferencesIn,
)
from apps.batch_normative_reference.services.job_service import (
    create_job_from_uploads,
    delete_job_for_request,
    get_job_or_404,
    item_to_out,
    job_to_out,
    list_jobs_for_request,
    patch_item_references_resolved,
)
from apps.core.api.auth import BearerAuthPlaceholder
from apps.core.schemas.common import ModuleMetaOut

if settings.COMPLIANCE_API_AUTH_REQUIRED:
    router = Router(tags=["batch-normative-reference"], auth=[BearerAuthPlaceholder()])
else:
    router = Router(tags=["batch-normative-reference"])


@router.get("/module", response=ModuleMetaOut, summary="模块元信息", auth=None)
def module_info(request: Any):
    return ModuleMetaOut(
        module="batch_normative_reference",
        requirement_section="8.x-batch",
        scope="批量上传企标、专用 Dify 抽取规范性引用、查新结果与 compliance step3 reference-latest 同构",
    )


@router.post(
    "/jobs",
    response={201: BatchNormativeRefJobOut},
    summary="创建批量任务并异步处理",
)
def create_job(request: Any):
    label_raw = (request.POST.get("label") or "").strip()
    label = label_raw or None
    files = request.FILES.getlist("files")
    if not files:
        raise HttpError(422, "请使用 multipart 字段 files 上传至少一个企标文件")
    job = create_job_from_uploads(request=request, files=list(files), label=label)
    job.refresh_from_db()
    return 201, job_to_out(job)


@router.get("/jobs", response=BatchNormativeRefJobListOut, summary="分页批次列表（摘要，无子项明细）")
def list_jobs(request: Any, page: int = 1, page_size: int = 20):
    return list_jobs_for_request(request, page=page, page_size=page_size)


@router.get("/jobs/{job_id}", response=BatchNormativeRefJobOut, summary="查询批量任务及各项查新结果")
def get_job(request: Any, job_id: int):
    job = get_job_or_404(job_id, request)
    return job_to_out(job)


@router.delete("/jobs/{job_id}", summary="删除批量任务及子项（含上传文件目录）")
def delete_job(request: Any, job_id: int):
    delete_job_for_request(job_id, request)
    return HttpResponse(status=204)


@router.get(
    "/jobs/{job_id}/items/{item_id}",
    response=BatchNormativeRefItemOut,
    summary="查询单文件项详情",
)
def get_job_item(request: Any, job_id: int, item_id: int):
    job = get_job_or_404(job_id, request)
    it = job.items.filter(pk=item_id).first()
    if not it:
        raise HttpError(404, "子项不存在")
    return item_to_out(it)


@router.patch(
    "/jobs/{job_id}/items/{item_id}",
    response=BatchNormativeRefItemOut,
    summary="持久化子项 references_resolved（人工修订）",
)
def patch_item_references(request: Any, job_id: int, item_id: int, body: PatchItemReferencesIn):
    it = patch_item_references_resolved(job_id, item_id, request, body.references_resolved)
    return item_to_out(it)
