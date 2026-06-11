"""查重：语义立项异步任务（Celery）。"""

from __future__ import annotations

import logging

from celery import shared_task

from apps.duplicate_check.services.semantic_match import run_semantic_ranking

logger = logging.getLogger(__name__)


@shared_task(name="duplicate_check.run_semantic_check_task")
def run_semantic_check_task(task_id: str, intent_text: str, candidate_ids: list[str]) -> dict:
    """
    与旧版 `run_semantic_check_task.delay` 对齐的参数语义：
    `candidate_ids` 为国标号 std_code 列表。

    结果写入日志；后续可扩：落库、缓存、WebSocket 推送等。
    """
    ranked = run_semantic_ranking(intent_text, candidate_ids)
    logger.info(
        "semantic_check task_id=%s candidates_in=%s rows_scored=%s top=%s",
        task_id,
        len(candidate_ids),
        len(ranked),
        ranked[:10],
    )
    return {"task_id": task_id, "count": len(ranked), "top": ranked[:50]}
