from __future__ import annotations

from typing import Any

from django.conf import settings
from django.http import HttpRequest, HttpResponse
from ninja import Router
from ninja.errors import HttpError

from apps.core.api.auth import BearerAuthPlaceholder
from apps.core.schemas.common import ModuleMetaOut
from apps.novelty.schemas.api_schemas import (
    ConfirmSheetIn,
    NoveltyIndicatorsOut,
    NoveltyTaskListOut,
    NoveltyTaskOut,
    ReferenceSheetPatchIn,
    ReportOut,
)
from apps.novelty.services.serializers import indicators_to_out, task_to_out, task_to_summary
from apps.novelty.services.task_service import (
    confirm_sheet,
    create_task,
    delete_task_for_request,
    get_task_or_404,
    list_tasks,
    patch_reference_sheet,
    retry_task,
)
from apps.novelty.models import NoveltySearchTask

if settings.COMPLIANCE_API_AUTH_REQUIRED:
    router = Router(tags=["novelty-search"], auth=[BearerAuthPlaceholder()])
else:
    router = Router(tags=["novelty-search"])


@router.get("/module", response=ModuleMetaOut, summary="模块元信息", auth=None)
def module_info(request: HttpRequest):
    return ModuleMetaOut(
        module="novelty_search",
        requirement_section="8.2",
        scope="按企标号汇聚历史合规/批量引用，三列比对查新",
    )


@router.post("/tasks", response={201: NoveltyTaskOut}, summary="创建查新任务")
def post_task(request: HttpRequest):
    subject_code = (request.POST.get("subject_code") or request.POST.get("qb_code") or "").strip()
    source = (request.POST.get("source") or "upload").strip() or "upload"
    upload = request.FILES.get("file")
    task = create_task(
        request=request,
        subject_code=subject_code,
        source=source,
        file=upload,
        file_name=getattr(upload, "name", None) if upload else None,
    )
    return 201, task_to_out(task)


@router.get("/tasks", response=NoveltyTaskListOut, summary="查新任务列表")
def get_tasks(
    request: HttpRequest,
    page: int = 1,
    page_size: int = 20,
    subject_code: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
):
    data = list_tasks(
        request=request,
        page=page,
        page_size=page_size,
        subject_code=subject_code,
        status=status,
        keyword=keyword,
    )
    return NoveltyTaskListOut(
        results=[task_to_summary(t) for t in data["results"]],
        total=data["total"],
        page=data["page"],
        page_size=data["page_size"],
    )


@router.get("/tasks/{task_id}", response=NoveltyTaskOut, summary="查新任务详情")
def get_task(request: HttpRequest, task_id: int):
    task = get_task_or_404(task_id, request)
    return task_to_out(task)


@router.delete("/tasks/{task_id}", summary="删除查新任务（历史查询记录）")
def delete_task(request: HttpRequest, task_id: int):
    delete_task_for_request(task_id, request)
    return HttpResponse(status=204)


@router.patch("/tasks/{task_id}/reference-sheet", response=NoveltyTaskOut, summary="保存专用表草稿")
def patch_reference_sheet_endpoint(request: HttpRequest, task_id: int, body: ReferenceSheetPatchIn):
    rows = [r.model_dump() for r in body.rows]
    task = patch_reference_sheet(task_id, rows, request)
    return task_to_out(task)


@router.post("/tasks/{task_id}/confirm-sheet", response=NoveltyTaskOut, summary="确认专用表并触发比对")
def confirm_sheet_endpoint(request: HttpRequest, task_id: int, body: ConfirmSheetIn | None = None):
    rows = None
    if body is not None and body.rows is not None:
        rows = [r.model_dump() for r in body.rows]
    task = confirm_sheet(task_id, rows, request)
    return task_to_out(task)


@router.post("/tasks/{task_id}/retry", response=NoveltyTaskOut, summary="失败任务重试")
def retry_task_endpoint(request: HttpRequest, task_id: int):
    task = retry_task(task_id, request)
    return task_to_out(task)


@router.get("/tasks/{task_id}/indicators", response=NoveltyIndicatorsOut, summary="指标明细")
def get_indicators(request: HttpRequest, task_id: int):
    task = get_task_or_404(task_id, request)
    if not task.indicators_json:
        raise HttpError(404, "该任务暂无指标数据")
    return indicators_to_out(task)


@router.post("/tasks/{task_id}/report", response={501: ReportOut}, summary="生成 PDF 报告（未实现）")
def post_report(request: HttpRequest, task_id: int):
    task = get_task_or_404(task_id, request)
    if task.status != NoveltySearchTask.Status.COMPLETED:
        raise HttpError(422, "任务未完成，无法生成报告")
    raise HttpError(501, "查新 PDF 报告生成功能尚未实现")
