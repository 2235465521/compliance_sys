"""
与部分前端路径对齐的 Ninja 实例（挂载在 `/api/`，不含 `v1`）。

现有业务 API 仍在 `config.api` → `/api/v1/`。
"""

from ninja import NinjaAPI

from apps.standards.api.dashboard_search_compat import router as dashboard_search_compat_router
from apps.standards.api.industry_taxonomy_compat import router as industry_taxonomy_router
from apps.standards.api.pedigree_compat import router as pedigree_compat_router
from apps.duplicate_check.api.router import compat_router as duplicate_check_router
from apps.standards.api.warning_trace_compat import router as warning_trace_compat_router
from apps.alerting.api.analyze_qb_compat import router as analyze_qb_compat_router
from apps.alerting.api.warnings_compat import router as warnings_compat_router

api_compat = NinjaAPI(
    title="标准化信息服务平台 API（兼容路径）",
    version="1.0.0",
    urls_namespace="api-compat",
    description=(
        "谱系等接口：`/api/get_tree_data/`；"
        "仪表盘兼容：`/api/standards/basic-search/`、`/api/standards/dashboard-alerts/`；"
        "查重：`/api/duplicate/name-check/`；"
        "预警：`/api/warnings/…`、`/api/standards/warning-trace/`"
    ),
)

api_compat.add_router("", pedigree_compat_router)
api_compat.add_router("", industry_taxonomy_router)
api_compat.add_router("", dashboard_search_compat_router)
api_compat.add_router("/duplicate", duplicate_check_router)
api_compat.add_router("", warnings_compat_router)
api_compat.add_router("", warning_trace_compat_router)
api_compat.add_router("", analyze_qb_compat_router)
