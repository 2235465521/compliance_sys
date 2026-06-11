"""监控状态常量与分类（summary / 列表共用）。"""

from __future__ import annotations

from typing import Any

from apps.alerting.models import WarningMonitorSnapshot

NOT_SCANNED = "not_scanned"
NO_EVAL_RECORD = "no_eval_record"
NEED_ATTENTION = "need_attention"
ALL_OK = "all_ok"
PARTIAL = "partial"

NOT_SCANNED_SUMMARY = "尚未巡检，请点击主动巡检"
NO_EVAL_RECORD_SUMMARY = "无评价记录（未找到可用引用清单）"

# 巡检不应落库的快照结论
NON_PERSISTENT_SNAPSHOT_CONCLUSIONS = frozenset({"empty_history"})


def classify_monitor_status(
    *,
    has_reference_history: bool,
    snap: WarningMonitorSnapshot | None,
) -> tuple[str, str]:
    """返回 (task_conclusion, task_summary)。"""
    if not has_reference_history:
        return NO_EVAL_RECORD, NO_EVAL_RECORD_SUMMARY

    if snap is None:
        return NOT_SCANNED, NOT_SCANNED_SUMMARY

    tc = (snap.task_conclusion or "").strip()
    summary = (snap.task_summary or "").strip()

    if tc in NON_PERSISTENT_SNAPSHOT_CONCLUSIONS:
        return NO_EVAL_RECORD, NO_EVAL_RECORD_SUMMARY
    if tc == NEED_ATTENTION:
        return NEED_ATTENTION, summary
    if tc in (ALL_OK, PARTIAL):
        return tc, summary
    if tc == NOT_SCANNED:
        return NOT_SCANNED, summary or NOT_SCANNED_SUMMARY
    return tc or NOT_SCANNED, summary or NOT_SCANNED_SUMMARY


def is_all_ok_display_status(task_conclusion: str | None) -> bool:
    return (task_conclusion or "") in (ALL_OK, PARTIAL)


def snapshot_should_persist(payload: dict[str, Any]) -> bool:
    tc = (payload.get("task_conclusion") or "").strip()
    return tc not in NON_PERSISTENT_SNAPSHOT_CONCLUSIONS
