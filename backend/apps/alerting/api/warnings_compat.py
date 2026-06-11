"""`/api/warnings/…` 兼容路由（挂载在 api_compat）。"""

from __future__ import annotations

from urllib.parse import unquote

from django.conf import settings
from django.http import HttpRequest
from ninja import Query, Router

from apps.alerting.services.envelope import envelope_err, envelope_ok
from apps.alerting.services.forward_warning import build_forward_warning
from apps.alerting.services.monitor_service import (
    ScanAlreadyRunningError,
    ScanControlError,
    get_monitor_summary,
    list_monitor_enterprises,
    request_pause_scan,
    resume_scan,
    start_full_scan,
)
from apps.core.api.auth import BearerAuthPlaceholder

if settings.COMPLIANCE_API_AUTH_REQUIRED:
    router = Router(tags=["compat-warnings"], auth=[BearerAuthPlaceholder()])
else:
    router = Router(tags=["compat-warnings"])


def _mysql_unavailable():
    return envelope_err(503, "预警模块依赖 MySQL 与标准库业务表")


@router.get(
    "/warnings/forward-by-qb",
    summary="正向预警（企标号）",
    include_in_schema=True,
)
@router.get("/warnings/forward-by-qb/", summary="正向预警（企标号）")
def forward_by_qb(
    request: HttpRequest,
    subject_code: str = Query(default=""),
    qb_code: str = Query(default=""),
):
    qb = (subject_code or qb_code or "").strip()
    if not qb:
        return envelope_err(400, "subject_code is required")
    try:
        data = build_forward_warning(qb)
    except RuntimeError as e:
        return _mysql_unavailable() if "MySQL" in str(e) else envelope_err(503, str(e))
    return envelope_ok(data)


@router.post(
    "/warnings/forward-by-file",
    summary="正向预警（上传企标文件）",
    include_in_schema=True,
)
@router.post("/warnings/forward-by-file/", summary="正向预警（上传企标文件）")
def forward_by_file(request: HttpRequest):
    upload = request.FILES.get("file")
    if upload is None:
        return envelope_err(400, "file is required")
    qb_hint = (request.POST.get("qb_code") or "").strip()
    from pathlib import Path
    import tempfile

    from apps.compliance.services.parse_service import workflow1_parse_uploaded_file

    suffix = Path(getattr(upload, "name", "upload.pdf")).suffix or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        for chunk in upload.chunks():
            tmp.write(chunk)
        tmp_path = Path(tmp.name)

    try:
        parsed, _meta = workflow1_parse_uploaded_file(tmp_path, getattr(upload, "name", None), task_id=0)
    finally:
        tmp_path.unlink(missing_ok=True)

    qb = qb_hint or (parsed.get("qb_code") or "").strip()
    if not qb:
        return envelope_ok(build_forward_warning("", pending=True))

    try:
        data = build_forward_warning(qb)
    except RuntimeError as e:
        return _mysql_unavailable() if "MySQL" in str(e) else envelope_err(503, str(e))
    return envelope_ok(data)


@router.get("/warnings/monitor/summary", summary="监控汇总")
@router.get("/warnings/monitor/summary/", summary="监控汇总")
def monitor_summary(request: HttpRequest):
    try:
        return envelope_ok(get_monitor_summary())
    except Exception as e:
        return envelope_err(503, str(e))


@router.get("/warnings/monitor/enterprises", summary="监控企标列表")
@router.get("/warnings/monitor/enterprises/", summary="监控企标列表")
def monitor_enterprises(
    request: HttpRequest,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    keyword: str | None = Query(None),
    status: str | None = Query(None),
):
    try:
        data = list_monitor_enterprises(page=page, page_size=page_size, keyword=keyword, status=status)
        return envelope_ok(data)
    except Exception as e:
        return envelope_err(503, str(e))


@router.get(
    "/warnings/monitor/enterprises/detail",
    summary="监控单企标明细（同 forward-by-qb；qb_code 含 / 时用 Query）",
)
@router.get(
    "/warnings/monitor/enterprises/detail/",
    summary="监控单企标明细（同 forward-by-qb）",
)
def monitor_enterprise_detail(
    request: HttpRequest,
    subject_code: str = Query(default=""),
    qb_code: str = Query(default=""),
):
    qb = unquote(subject_code or qb_code or "").strip()
    if not qb:
        return envelope_err(400, "subject_code is required")
    try:
        data = build_forward_warning(qb)
    except RuntimeError as e:
        return _mysql_unavailable() if "MySQL" in str(e) else envelope_err(503, str(e))
    return envelope_ok(data)


@router.get(
    "/warnings/monitor/enterprises/{qb_code}",
    summary="监控单企标明细（路径参数，企标号不含 / 时可用）",
    include_in_schema=False,
)
@router.get(
    "/warnings/monitor/enterprises/{qb_code}/",
    summary="监控单企标明细（路径参数）",
    include_in_schema=False,
)
def monitor_enterprise_detail_path(request: HttpRequest, qb_code: str):
    qb = unquote(qb_code or "").strip()
    if not qb:
        return envelope_err(400, "subject_code is required")
    try:
        data = build_forward_warning(qb)
    except RuntimeError as e:
        return _mysql_unavailable() if "MySQL" in str(e) else envelope_err(503, str(e))
    return envelope_ok(data)


@router.post("/warnings/scan", summary="触发全库巡检")
@router.post("/warnings/scan/", summary="触发全库巡检")
def warnings_scan(request: HttpRequest):
    try:
        data = start_full_scan()
        return envelope_ok(data)
    except ScanAlreadyRunningError as e:
        return envelope_err(409, str(e))
    except RuntimeError as e:
        return _mysql_unavailable() if "MySQL" in str(e) else envelope_err(503, str(e))
    except Exception as e:
        return envelope_err(503, str(e))


@router.post("/warnings/scan/{job_id}/pause", summary="暂停巡检")
@router.post("/warnings/scan/{job_id}/pause/", summary="暂停巡检")
def warnings_scan_pause(request: HttpRequest, job_id: int):
    try:
        return envelope_ok(request_pause_scan(job_id))
    except ScanControlError as e:
        return envelope_err(400, str(e))
    except Exception as e:
        return envelope_err(503, str(e))


@router.post("/warnings/scan/{job_id}/resume", summary="继续巡检")
@router.post("/warnings/scan/{job_id}/resume/", summary="继续巡检")
def warnings_scan_resume(request: HttpRequest, job_id: int):
    try:
        return envelope_ok(resume_scan(job_id))
    except ScanControlError as e:
        return envelope_err(400, str(e))
    except Exception as e:
        return envelope_err(503, str(e))
