"""
兼容前端旧路径（挂载在 `/api/`，无 `v1`）：
- GET /standards/basic-search/?q=
- GET /standards/dashboard-alerts/
"""

from django.http import HttpRequest
from ninja import Query, Router

from apps.dashboard.schemas import AbolitionHintsOut, EffectiveHintsOut
from apps.dashboard.services import aggregate as dash_agg
from apps.standards.schemas.registry import StandardPaginatedOut
from apps.standards.services import registry as registry_svc

router = Router(tags=["compat-standards-dashboard"])


@router.get(
    "/standards/basic-search",
    response=StandardPaginatedOut,
    summary="兼容：国标快捷检索（与列表接口同一搜索：标准号/名称 icontains）",
    include_in_schema=False,
)
@router.get(
    "/standards/basic-search/",
    response=StandardPaginatedOut,
    summary="兼容：国标快捷检索（与列表接口同一搜索：标准号/名称 icontains）",
)
def compat_standards_basic_search(
    request: HttpRequest,
    q: str = Query("", description="关键词，标准号或名称子串"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    term = (q or "").strip()
    if not term:
        return StandardPaginatedOut(count=0, next=None, previous=None, results=[])
    return registry_svc.list_standards(
        request,
        page=page,
        page_size=page_size,
        search=term,
        status_filter=None,
    )


@router.get(
    "/standards/dashboard-alerts",
    response=AbolitionHintsOut,
    summary="兼容：仪表盘废止提示（同 /api/v1/dashboard/abolition-hints）",
    include_in_schema=False,
)
@router.get(
    "/standards/dashboard-alerts/",
    response=AbolitionHintsOut,
    summary="兼容：仪表盘废止提示（同 /api/v1/dashboard/abolition-hints）",
)
def compat_standards_dashboard_alerts(
    request: HttpRequest,
    upcoming_days: int = Query(90, ge=0, le=3660),
    recent_days: int = Query(90, ge=0, le=3660),
    limit: int = Query(200, ge=1, le=500),
):
    """与 GET /api/v1/dashboard/abolition-hints 同源。"""
    return dash_agg.abolition_hints(
        upcoming_days=upcoming_days,
        recent_days=recent_days,
        limit=limit,
    )


@router.get(
    "/standards/dashboard-effective-alerts",
    response=EffectiveHintsOut,
    summary="兼容：仪表盘即将实施提示（同 /api/v1/dashboard/effective-hints）",
    include_in_schema=False,
)
@router.get(
    "/standards/dashboard-effective-alerts/",
    response=EffectiveHintsOut,
    summary="兼容：仪表盘即将实施提示（同 /api/v1/dashboard/effective-hints）",
)
def compat_standards_dashboard_effective_alerts(
    request: HttpRequest,
    window_days: int = Query(90, ge=0, le=3660),
    limit: int = Query(200, ge=1, le=500),
):
    return dash_agg.effective_hints(window_days=window_days, limit=limit)
