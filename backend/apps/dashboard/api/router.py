from ninja import Query, Router
from ninja.errors import HttpError

from apps.core.schemas.common import ModuleMetaOut
from apps.dashboard.schemas import (
    AbolitionHintsOut,
    ApiEnvelopeStatistics,
    EffectiveHintsOut,
    QuickLookupOut,
)
from apps.dashboard.services import aggregate as dash_agg

router = Router(tags=["dashboard"])


@router.get("/module", response=ModuleMetaOut, include_in_schema=False)
@router.get("/module/", response=ModuleMetaOut, summary="模块元信息")
def module_info(request):
    return ModuleMetaOut(
        module="dashboard",
        requirement_section="8.8",
        scope="国标主表统计、快捷查标准、废止/实施日期预警",
    )


@router.get(
    "/summary",
    response=ApiEnvelopeStatistics,
    include_in_schema=False,
)
@router.get(
    "/summary/",
    response=ApiEnvelopeStatistics,
    summary="仪表盘总览：国标主表统计；types 按 std_category 聚合",
)
def dashboard_summary(request):
    return dash_agg.national_standard_basic_statistics()


@router.get(
    "/standard-library-stats",
    response=ApiEnvelopeStatistics,
    include_in_schema=False,
)
@router.get(
    "/standard-library-stats/",
    response=ApiEnvelopeStatistics,
    summary="标准库统计（与 /standards/statistics/ 一致；types=std_category）",
)
def dashboard_standard_library_stats(request):
    return dash_agg.national_standard_basic_statistics()


@router.get(
    "/quick-lookup",
    response=QuickLookupOut,
    include_in_schema=False,
)
@router.get(
    "/quick-lookup/",
    response=QuickLookupOut,
    summary="快捷查标准：Query 标准号 std_code，返回单条详情（national_standard_basic）",
)
def dashboard_quick_lookup(
    request, std_code: str = Query(..., description="标准号，对应 std_code")
):
    out = dash_agg.quick_lookup(std_code)
    if out is None:
        code = (std_code or "").strip()
        if not code:
            raise HttpError(422, "std_code 不能为空")
        raise HttpError(404, "标准不存在")
    return out


@router.get(
    "/abolition-hints",
    response=AbolitionHintsOut,
    include_in_schema=False,
)
@router.get(
    "/abolition-hints/",
    response=AbolitionHintsOut,
    summary="近期废止提示：按 abolition_date 与当前日期比较（主表-national_standard_basic）",
)
def dashboard_abolition_hints(
    request,
    upcoming_days: int = Query(
        90,
        ge=0,
        le=3660,
        description="即将废止向前看窗口天数；前端宜传 30/60/90。abolition_date∈[今天, 今天+N]",
    ),
    recent_days: int = Query(
        90,
        ge=0,
        le=3660,
        description="近期已废止回溯天数；可与 upcoming_days 同选 30/60/90",
    ),
    limit: int = Query(
        200,
        ge=1,
        le=500,
        description="upcoming / recent 各自最多返回条数",
    ),
):
    return dash_agg.abolition_hints(
        upcoming_days=upcoming_days,
        recent_days=recent_days,
        limit=limit,
    )


@router.get(
    "/effective-hints",
    response=EffectiveHintsOut,
    include_in_schema=False,
)
@router.get(
    "/effective-hints/",
    response=EffectiveHintsOut,
    summary="即将实施提示：按 effective_date 与当前日期比较",
)
def dashboard_effective_hints(
    request,
    window_days: int = Query(
        90,
        ge=0,
        le=3660,
        description="向前看窗口天数；前端宜传 30/60/90。effective_date∈[今天, 今天+N]",
    ),
    limit: int = Query(
        200,
        ge=1,
        le=500,
        description="最多返回条数",
    ),
):
    return dash_agg.effective_hints(window_days=window_days, limit=limit)
