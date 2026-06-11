"""`/api/standards/warning-trace/` 反向预警兼容路由。"""

from __future__ import annotations

from django.conf import settings
from django.http import HttpRequest
from ninja import Query, Router

from apps.alerting.services.envelope import envelope_err, envelope_ok
from apps.alerting.services.reverse_warning import build_reverse_warning
from apps.core.api.auth import BearerAuthPlaceholder

if settings.COMPLIANCE_API_AUTH_REQUIRED:
    router = Router(tags=["compat-warning-trace"], auth=[BearerAuthPlaceholder()])
else:
    router = Router(tags=["compat-warning-trace"])


@router.get("/standards/warning-trace", summary="反向预警（国标号）")
@router.get("/standards/warning-trace/", summary="反向预警（国标号）")
def warning_trace(request: HttpRequest, bz_id: str = Query(default="")):
    bz = (bz_id or "").strip()
    if not bz:
        return envelope_err(400, "bz_id is required")
    try:
        data = build_reverse_warning(bz)
    except RuntimeError as e:
        if "MySQL" in str(e):
            return envelope_err(503, "预警模块依赖 MySQL 与标准库业务表")
        return envelope_err(503, str(e))
    return envelope_ok(data)
