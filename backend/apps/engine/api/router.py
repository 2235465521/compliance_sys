from ninja import Router

from apps.core.api.auth import BearerAuthPlaceholder
from apps.core.schemas.common import AuthProbeOut, ModuleMetaOut
from apps.engine.dify_client import DifyClient

router = Router(tags=["engine"])


@router.get("/module", response=ModuleMetaOut, summary="模块元信息（占位）")
def module_info(request):
    return ModuleMetaOut(
        module="engine",
        requirement_section="技栈文档（编排）",
        scope="Dify（1.0）/ 未来 LangGraph 回调、Webhook、任务状态；与业务域通过契约 JSON 解耦",
    )


@router.post("/dify/webhook", summary="Dify Webhook 占位（阶段 7：验签、幂等、驱动 compliance 任务状态）")
def dify_webhook(request):
    """阶段 8 前仅回显；勿暴露于公网且无鉴权。"""
    import json

    try:
        body = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        body = {}
    return {"ok": True, "received": isinstance(body, dict), "keys": list(body)[:30] if isinstance(body, dict) else []}


@router.get("/dify/config-probe", summary="Dify 环境变量是否已配置（不返回密钥）")
def dify_config_probe(request):
    c = DifyClient()
    return {
        "api_base_set": bool(c.api_base),
        "api_key_set": bool(c.api_key),
        "workflow_1_id_set": bool(c.workflow_1_id),
        "workflow1_files_input_key_set": bool(c.workflow1_files_input_key),
        "workflow1_output_wrapper_key": c.workflow1_output_wrapper_key,
        "workflow1_ready": c.is_workflow1_configured(),
        "workflow1_response_mode": c.workflow1_response_mode,
        "workflow1_file_payload_mode": c.workflow1_file_payload_mode,
        "workflow2_ready": c.is_workflow2_configured(),
        "std_index_ready": c.is_std_index_configured(),
        "national_indicator_dify_ready": c.is_workflow2_configured() or c.is_std_index_configured(),
        "workflow3_ready": c.is_workflow3_configured(),
    }


@router.get(
    "/auth/probe",
    response=AuthProbeOut,
    summary="引擎回调鉴权探针（内部服务 / Bearer；生产应使用签名或 mTLS）",
    auth=[BearerAuthPlaceholder()],
)
def engine_auth_probe(request):
    return AuthProbeOut()
