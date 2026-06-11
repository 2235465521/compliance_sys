"""预警任务级结论（与查新 has_updates/all_unchanged 隔离）。"""

from __future__ import annotations

from typing import Any


def compute_warning_task_conclusion(rows: list[dict[str, Any]]) -> tuple[str, str | None]:
    if not rows:
        return "empty_history", "未找到该企标的合规或批量规范性引用评价记录"

    updated = 0
    unchanged = 0
    partial_flags = 0
    comparable = 0
    for row in rows:
        rc = row.get("row_conclusion")
        if rc == "updated":
            updated += 1
            comparable += 1
        elif rc == "unchanged":
            unchanged += 1
            comparable += 1
        elif rc in ("unresolved", "not_assessable"):
            partial_flags += 1
        elif rc == "first_record":
            comparable += 1

    total = len(rows)
    if updated > 0:
        summary = f"存在 {updated} 条引用标准与上次查新结果不一致，建议核对企标"
        if unchanged:
            summary = f"存在 {updated} 条引用标准与上次查新结果不一致（共 {total} 条，{unchanged} 条无变化），建议核对企标"
        return "need_attention", summary

    if comparable > 0 and updated == 0 and partial_flags == 0:
        return "all_ok", "引用标准均无变化，状态良好，暂不需更新"

    if partial_flags > 0 and comparable > 0:
        return "partial", f"共 {total} 条引用，{partial_flags} 条需人工核对"

    if partial_flags > 0 and comparable == 0:
        return "partial", f"共 {total} 条引用，均无法完整比对"

    return "all_ok", f"共 {total} 条引用，全部无变化"
