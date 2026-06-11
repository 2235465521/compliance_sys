import json
import os
import sys

from django.conf import settings
from django.http import HttpResponse
from ninja import File, Query, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from apps.compliance.schemas.api_schemas import (
    ComplianceTaskOut,
    Step1ConfirmIn,
    Step2ConfirmIn,
    Step3ConfirmIn,
    Step4IndicatorsOut,
    Step4IndicatorsEnsureIn,
    Step4IndicatorsEnsureOut,
    NationalIndicatorListOut,
    NationalIndicatorReviewIn,
    NationalIndicatorReviewOut,
    NationalIndicatorSaveIn,
    NationalIndicatorSaveOut,
    NationalStandardUploadOut,
    Step5CompareIn,
    Step5CompareOut,
    SummaryOut,
    SupplementsBodyIn,
)
from apps.compliance.services import evaluation_flow
from apps.core.api.auth import BearerAuthPlaceholder
from apps.core.schemas.common import ModuleMetaOut

if settings.COMPLIANCE_API_AUTH_REQUIRED:
    router = Router(tags=["compliance"], auth=[BearerAuthPlaceholder()])
else:
    router = Router(tags=["compliance"])


@router.get("/module", response=ModuleMetaOut, summary="模块元信息", auth=None)
def module_info(request):
    return ModuleMetaOut(
        module="compliance",
        requirement_section="8.4",
        scope="六步向导五审、Dify①解析、国标指标表优先②按需补缺、③对比、n→n+m引用补充、多证书与终局汇总；状态快照与engine编排",
    )


@router.post("/evaluations", response=ComplianceTaskOut, summary="创建合规评价任务")
def create_evaluation(request):
    t = evaluation_flow.create_task(request)
    return evaluation_flow.task_to_out(t)


@router.get("/evaluations", summary="任务列表（无 query 返回数组；带筛选/分页返回 items 对象）")
def list_evaluations(
    request,
    status: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    current_step_max: int | None = None,
    subject_code: str | None = None,
):
    use_paged = any(
        p is not None for p in (status, page, page_size, current_step_max, subject_code)
    )
    if use_paged:
        return evaluation_flow.list_evaluations_paged(
            request,
            status=status or "all",
            current_step_max=current_step_max,
            subject_code=subject_code,
            page=page or 1,
            page_size=page_size or 20,
        )
    return [evaluation_flow.task_to_out(t) for t in evaluation_flow.iter_evaluation_tasks(request)]


@router.get("/evaluations/{task_id}", response=ComplianceTaskOut, summary="任务详情")
def get_evaluation(request, task_id: int):
    t = evaluation_flow.get_compliance_task_or_404(task_id, request)
    return evaluation_flow.task_to_out(t)


@router.delete("/evaluations/{task_id}", summary="删除评价任务")
def delete_evaluation(request, task_id: int):
    evaluation_flow.delete_evaluation_task(task_id, request)
    return HttpResponse(status=204)


@router.post(
    "/evaluations/{task_id}/upload",
    response=ComplianceTaskOut,
    summary="上传企标并触发工作流①解析（task_id 须为创建任务响应中的 id）",
)
def upload_enterprise_standard(request, task_id: int, file: UploadedFile = File(...)):
    t = evaluation_flow.get_compliance_task_or_404(task_id, request)
    evaluation_flow.save_upload_file(t, file)
    t.refresh_from_db()
    return evaluation_flow.task_to_out(t)


@router.get("/evaluations/{task_id}/step/1", summary="审核 1 展示数据")
def get_step1(request, task_id: int):
    t = evaluation_flow.get_compliance_task_or_404(task_id, request)
    return {
        "task": evaluation_flow.task_to_out(t).model_dump(),
        "parse_result": t.parse_result_json,
    }


@router.post("/evaluations/{task_id}/step/1/confirm", response=ComplianceTaskOut, summary="审核 1 确认")
def confirm_step1(request, task_id: int, body: Step1ConfirmIn):
    t = evaluation_flow.confirm_step1(task_id, body, request)
    return evaluation_flow.task_to_out(t)


@router.get("/evaluations/{task_id}/step/2", summary="审核 2 展示数据")
def get_step2(request, task_id: int):
    t = evaluation_flow.get_compliance_task_or_404(task_id, request)
    return {
        "task": evaluation_flow.task_to_out(t).model_dump(),
        "suggested_references": evaluation_flow.build_step2_suggested_references(
            t.parse_result_json if isinstance(t.parse_result_json, dict) else None
        ),
        "indicators": (t.parse_result_json or {}).get("indicators") or [],
    }


@router.post("/evaluations/{task_id}/step/2/confirm", response=ComplianceTaskOut, summary="审核 2 确认")
def confirm_step2(request, task_id: int, body: Step2ConfirmIn):
    t = evaluation_flow.confirm_step2(task_id, body, request)
    return evaluation_flow.task_to_out(t)


@router.get("/evaluations/{task_id}/step/3/reference-latest", summary="引用号→现行最新（standards）")
def get_reference_latest(request, task_id: int):
    data = evaluation_flow.get_reference_latest_bundle(task_id, request)
    _log = settings.DEBUG or os.environ.get("REFERENCE_LATEST_LOG_TO_TERMINAL", "").lower() in (
        "1",
        "true",
        "yes",
    )
    if _log:
        print(
            "[reference-latest] task_id=%s\n%s"
            % (task_id, json.dumps(data, ensure_ascii=False, indent=2)),
            file=sys.stderr,
            flush=True,
        )
    return data


@router.post("/evaluations/{task_id}/step/3/supplements", response=ComplianceTaskOut, summary="n+m 补充行")
def post_supplements(request, task_id: int, body: SupplementsBodyIn):
    evaluation_flow.add_supplements(task_id, body.rows, request)
    t = evaluation_flow.get_compliance_task_or_404(task_id, request)
    return evaluation_flow.task_to_out(t)


@router.post("/evaluations/{task_id}/step/3/confirm", response=ComplianceTaskOut, summary="审核 3 确认 + 引用证书占位")
def confirm_step3(request, task_id: int, body: Step3ConfirmIn):
    t = evaluation_flow.confirm_step3(task_id, body, request)
    return evaluation_flow.task_to_out(t)


@router.get("/evaluations/{task_id}/step/4/indicators", response=Step4IndicatorsOut, summary="步骤 4 指标编排（含 missing_gb_files）")
def get_step4_indicators(request, task_id: int):
    return evaluation_flow.build_step4_indicators(task_id, request)


@router.post(
    "/evaluations/{task_id}/step/4/indicators/ensure",
    response=Step4IndicatorsEnsureOut,
    summary="按 ③ 表格 compare_pairs 编排指标（第五步主路径）",
)
def post_step4_indicators_ensure(request, task_id: int, body: Step4IndicatorsEnsureIn):
    return evaluation_flow.ensure_step4_indicators(task_id, body, request)


@router.get(
    "/evaluations/{task_id}/step/4/national-indicators",
    response=NationalIndicatorListOut,
    summary="查询国标指标明细（含 manual_review_status）",
)
def get_national_indicators(request, task_id: int, std_code: str = Query(...)):
    return evaluation_flow.get_national_indicators_by_std_code(task_id, std_code, request)


@router.put(
    "/evaluations/{task_id}/step/4/national-indicators",
    response=NationalIndicatorSaveOut,
    summary="保存编辑后的国标指标 indexes JSON",
)
def put_national_indicator_save(request, task_id: int, body: NationalIndicatorSaveIn):
    return evaluation_flow.save_national_indicator(task_id, body, request)


@router.post(
    "/evaluations/{task_id}/step/4/national-indicators/review",
    response=NationalIndicatorReviewOut,
    summary="人工审核国标指标",
)
def post_national_indicator_review(request, task_id: int, body: NationalIndicatorReviewIn):
    return evaluation_flow.review_national_indicator(task_id, body, request)


@router.post("/evaluations/{task_id}/step/4/confirm", response=ComplianceTaskOut, summary="审核 4 确认")
def confirm_step4(request, task_id: int):
    t = evaluation_flow.confirm_step4(task_id, request)
    return evaluation_flow.task_to_out(t)


@router.post(
    "/national-standards/upload",
    response=NationalStandardUploadOut,
    summary="补传/更换国标文件并更新 std_file_path（可重复上传覆盖）",
)
def upload_national_standard(
    request,
    std_code: str = Query(...),
    task_id: int | None = Query(None, description="可选：同步更新该任务的 std_statuses"),
    file: UploadedFile = File(...),
):
    return evaluation_flow.upload_national_standard_file(
        std_code, file, task_id=task_id, request=request
    )


@router.delete("/national-standards/file", summary="清除国标文件路径，可重新上传")
def clear_national_standard_file(
    request,
    std_code: str = Query(...),
    task_id: int | None = Query(None, description="可选：同步更新该任务的 std_statuses"),
):
    return evaluation_flow.clear_national_standard_file(std_code, task_id=task_id, request=request)


@router.get(
    "/evaluations/{task_id}/step/5/compare/result",
    response=Step5CompareOut,
    summary="只读技术指标对比结果（不调用 Dify③，用于回退/刷新 hydrate）",
)
def get_step5_compare_result(request, task_id: int):
    return evaluation_flow.get_step5_compare_result(task_id, request)


@router.get(
    "/evaluations/{task_id}/step/5/compare",
    response=Step5CompareOut,
    summary="Dify③ 指标对比（会重新执行工作流；hydrate 请用 compare/result）",
)
def get_step5_compare(request, task_id: int):
    return evaluation_flow.run_step5_compare(task_id, request)


@router.post(
    "/evaluations/{task_id}/step/5/compare",
    response=Step5CompareOut,
    summary="Dify③ 指标对比（可选 compare_pairs 先刷新编排）",
)
def post_step5_compare(request, task_id: int, body: Step5CompareIn):
    pairs = body.compare_pairs if body.compare_pairs else None
    return evaluation_flow.run_step5_compare(task_id, request, compare_pairs=pairs)


@router.post("/evaluations/{task_id}/step/5/confirm", response=ComplianceTaskOut, summary="审核 5 确认 + 指标对比证书占位")
def confirm_step5(request, task_id: int):
    t = evaluation_flow.confirm_step5(task_id, request)
    return evaluation_flow.task_to_out(t)


@router.get("/evaluations/{task_id}/summary", response=SummaryOut, summary="步骤 6 汇总")
def get_summary(request, task_id: int):
    return evaluation_flow.get_summary(task_id, request)


@router.get("/evaluations/{task_id}/report", summary="生成并在浏览器打开合规评价汇总报告（HTML）")
def download_compliance_report(request, task_id: int):
    from django.http import FileResponse

    task = evaluation_flow.get_compliance_task_or_404(task_id, request)
    if task.current_step < 6:
        raise HttpError(422, "请先完成全流程至步骤 6")
    rel = evaluation_flow._ensure_compliance_report(task)
    if not rel:
        raise HttpError(500, "报告生成失败")
    p = evaluation_flow.artifact_file_path_for_task(task_id, rel, request)
    if not p.is_file():
        raise HttpError(404, "报告文件不存在")
    return FileResponse(
        open(p, "rb"),
        content_type="text/html; charset=utf-8",
        as_attachment=False,
        filename=p.name,
    )


@router.get("/evaluations/{task_id}/artifacts", summary="制品相对路径列表")
def list_artifacts(request, task_id: int):
    task = evaluation_flow.get_compliance_task_or_404(task_id, request)
    if task.current_step >= 6:
        evaluation_flow._ensure_compliance_report(task)
    return {"artifacts": [a.model_dump() for a in evaluation_flow.list_artifacts(task=task, request=request)]}


@router.get("/evaluations/{task_id}/artifacts/file", summary="下载单个制品文件")
def download_artifact(request, task_id: int, path: str, inline: bool = Query(False)):
    from django.http import FileResponse

    p = evaluation_flow.artifact_file_path_for_task(task_id, path, request)
    if not p.is_file():
        raise HttpError(404, "文件不存在")
    suffix = p.suffix.lower()
    content_type = "application/octet-stream"
    if suffix == ".html":
        content_type = "text/html; charset=utf-8"
    elif suffix == ".pdf":
        content_type = "application/pdf"
    open_inline = inline or suffix == ".html"
    return FileResponse(
        open(p, "rb"),
        content_type=content_type,
        as_attachment=not open_inline,
        filename=p.name,
    )
