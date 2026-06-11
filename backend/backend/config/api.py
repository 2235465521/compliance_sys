"""
集中注册 Django Ninja API。

约定：各业务域在 `apps.<module>.api.router` 中导出 `router`，在此处挂载，
前缀与需求模块对应，便于多人并行开发与接口文档分区。
"""

from ninja import NinjaAPI

from apps.alerting.api.router import router as alerting_router
from apps.archive.api.router import router as archive_router
from apps.audit.api.router import router as audit_router
from apps.batch_normative_reference.api.router import router as batch_normative_reference_router
from apps.compliance.api.router import router as compliance_router
from apps.core.api.router import router as core_router
from apps.dashboard.api.router import router as dashboard_router
from apps.duplicate_check.api.router import router as duplicate_check_router
from apps.engine.api.router import router as engine_router
from apps.identity.api.router import router as identity_router
from apps.novelty.api.router import router as novelty_router
from apps.standards.api.router import router as standards_router

api = NinjaAPI(
    title="标准化信息服务平台 API",
    version="1.0.0",
    description="Django Ninja 聚合层；重计算工作流见 `engine` 模块（Dify/LangGraph 等）。",
)

# 系统级 / 未归类探测
api.add_router("", core_router)
# 认证与 RBAC
api.add_router("/identity", identity_router)
# 8.1 ~ 8.8 及引擎
api.add_router("/standards", standards_router)
api.add_router("/novelty-search", novelty_router)
api.add_router("/duplicate-check", duplicate_check_router)
api.add_router("/compliance", compliance_router)
api.add_router("/batch-normative-reference", batch_normative_reference_router)
api.add_router("/alerting", alerting_router)
api.add_router("/archive", archive_router)
api.add_router("/audit", audit_router)
api.add_router("/dashboard", dashboard_router)
api.add_router("/engine", engine_router)
