"""`/api/analyze_qb_references_auto/` 兼容入队（文件解析后前端再调 forward-by-qb）。"""

from __future__ import annotations

from pathlib import Path
import tempfile

from django.conf import settings
from django.http import HttpRequest
from ninja import Router

from apps.alerting.services.envelope import envelope_err, envelope_ok
from apps.compliance.services.parse_service import workflow1_parse_uploaded_file
from apps.core.api.auth import BearerAuthPlaceholder

if settings.COMPLIANCE_API_AUTH_REQUIRED:
    router = Router(tags=["compat-analyze-qb"], auth=[BearerAuthPlaceholder()])
else:
    router = Router(tags=["compat-analyze-qb"])


@router.post(
    "/analyze_qb_references_auto",
    summary="企标文件解析入队（同步解析 MVP）",
    include_in_schema=True,
)
@router.post(
    "/analyze_qb_references_auto/",
    summary="企标文件解析入队（同步解析 MVP）",
)
def analyze_qb_references_auto(request: HttpRequest):
    upload = request.FILES.get("file")
    if upload is None:
        return envelope_err(400, "file is required")

    suffix = Path(getattr(upload, "name", "upload.pdf")).suffix or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        for chunk in upload.chunks():
            tmp.write(chunk)
        tmp_path = Path(tmp.name)

    try:
        parsed, _meta = workflow1_parse_uploaded_file(tmp_path, getattr(upload, "name", None), task_id=0)
    finally:
        tmp_path.unlink(missing_ok=True)

    qb_code = (parsed.get("qb_code") or "").strip()
    return envelope_ok(
        {
            "message": "文件已成功解析",
            "qb_code": qb_code or None,
            "referenced_std_codes": parsed.get("referenced_std_codes") or [],
            "hint": "请使用 GET /api/warnings/forward-by-qb/?qb_code= 获取五列预警表",
        }
    )
