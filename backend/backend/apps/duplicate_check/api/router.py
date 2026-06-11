from __future__ import annotations

import uuid

from ninja import Router

from apps.core.schemas.common import ModuleMetaOut
from apps.duplicate_check.schemas.duplicate import (
    NameCheckIn,
    NameCheckItem,
    NameCheckOut,
    SemanticCheckIn,
    SemanticCheckOut,
)
from apps.duplicate_check.services.name_similarity import run_name_check
from apps.duplicate_check.tasks import run_semantic_check_task


def _name_check_response(body: NameCheckIn) -> NameCheckOut:
    raw = run_name_check(body.keyword)
    if not raw.get("success"):
        return NameCheckOut(success=False, error=raw.get("error"))
    items = [NameCheckItem(**row) for row in raw["data"]]
    return NameCheckOut(success=True, message=raw.get("message"), data=items)


def _semantic_check_response(body: SemanticCheckIn) -> SemanticCheckOut:
    intent_text = body.intent_text.strip()
    if not intent_text or len(intent_text) < 10:
        return SemanticCheckOut(
            success=False,
            error="立项意图描述过短，请提供更详细的说明（至少10个字符）",
        )

    task_id = f"sem_{uuid.uuid4().hex[:8]}"

    try:
        run_semantic_check_task.delay(
            task_id=task_id,
            intent_text=intent_text,
            candidate_ids=list(body.candidate_ids),
        )
    except Exception:
        run_semantic_check_task(task_id, intent_text, list(body.candidate_ids))

    return SemanticCheckOut(
        success=True,
        task_id=task_id,
        message="立项意图已接收，正在对候选标准适用范围进行语义比对分析。",
    )


def _register_routes(r: Router) -> None:
    @r.get("/module", response=ModuleMetaOut, summary="模块元信息（占位）")
    def module_info(request):
        return ModuleMetaOut(
            module="duplicate_check",
            requirement_section="8.3",
            scope="拟立项查重、相似度阈值、查重报告",
        )

    @r.post("/name-check", response=NameCheckOut, summary="名称快查（一审）")
    def name_check(request, body: NameCheckIn):
        return _name_check_response(body)

    @r.post("/name-check/", response=NameCheckOut, summary="名称快查（一审，尾斜杠兼容）", include_in_schema=False)
    def name_check_slash(request, body: NameCheckIn):
        return _name_check_response(body)

    @r.post("/semantic-check", response=SemanticCheckOut, summary="语义立项（二审）")
    def semantic_check(request, body: SemanticCheckIn):
        return _semantic_check_response(body)

    @r.post(
        "/semantic-check/",
        response=SemanticCheckOut,
        summary="语义立项（二审，尾斜杠兼容）",
        include_in_schema=False,
    )
    def semantic_check_slash(request, body: SemanticCheckIn):
        return _semantic_check_response(body)


router = Router(tags=["duplicate_check"])
_register_routes(router)

compat_router = Router(tags=["duplicate_check"])
_register_routes(compat_router)
