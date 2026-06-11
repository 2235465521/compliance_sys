"""三列比对：基线 vs 本次实时谱系查新。"""

from __future__ import annotations

from typing import Any

from django.utils import timezone

from apps.novelty.services.baseline_service import baseline_row_for_compare, get_baseline_map
from apps.novelty.services.qb_code_utils import normalize_referenced_std_code
from apps.standards.services.reference_bundle import (
    normative_reference_row_core,
    normalize_std_code_for_citation_match,
)
from apps.standards.services.reference_resolution import (
    enterprise_as_of_year_from_parse_dict,
    resolve_reference_for_parse_context,
)

ROW_LABELS = {
    "unchanged": "无变化",
    "updated": "标准已更新",
    "first_record": "首次建立基线",
    "unresolved": "无法解析现行号",
    "not_assessable": "不可自动比对",
}


def compute_row_conclusion(
    *,
    baseline: str | None,
    current: str | None,
    compliance_assessable: bool,
) -> str:
    if not compliance_assessable:
        return "not_assessable"
    b = normalize_std_code_for_citation_match(baseline)
    c = normalize_std_code_for_citation_match(current)
    if not c:
        return "unresolved"
    if not b:
        return "first_record"
    if b == c:
        return "unchanged"
    return "updated"


def compute_task_conclusion(rows: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    if not rows:
        return "pending", None
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
        summary = f"共 {total} 条引用，{updated} 条标准已更新"
        if unchanged:
            summary += f"，{unchanged} 条无变化"
        return "has_updates", summary
    if comparable > 0 and updated == 0 and partial_flags == 0:
        return "all_unchanged", f"共 {total} 条引用，全部无变化"
    if partial_flags > 0 and comparable > 0:
        return "partial", f"共 {total} 条引用，{partial_flags} 条无法完整比对"
    if partial_flags > 0 and comparable == 0:
        return "partial", f"共 {total} 条引用，均无法完整比对"
    return "all_unchanged", f"共 {total} 条引用"


def build_compare_rows(
    sheet_rows: list[dict[str, Any]],
    qb_code: str,
    *,
    aggregated_full_by_ref: dict[str, str | None] | None = None,
) -> list[dict[str, Any]]:
    baseline_map = get_baseline_map(qb_code)
    agg_full = aggregated_full_by_ref or {}
    fallback_year = enterprise_as_of_year_from_parse_dict(
        {},
        qb_code=qb_code,
        fallback_year=timezone.localtime().year,
    )
    out: list[dict[str, Any]] = []
    for i, sheet in enumerate(sheet_rows):
        if not isinstance(sheet, dict):
            continue
        row_id = str(sheet.get("id") or i + 1)
        ref = (sheet.get("std_no") or sheet.get("referenced_std_code") or "").strip()
        ref_norm = normalize_referenced_std_code(ref)
        snap = baseline_map.get(ref_norm) if ref_norm else None
        baseline_info = baseline_row_for_compare(snap)
        baseline_primary = baseline_info["baseline_latest_std_primary"] if baseline_info else None

        raw = resolve_reference_for_parse_context(
            ref, pr={}, qb_code=qb_code, fallback_year=fallback_year
        )
        core = normative_reference_row_core(raw)
        current_primary = core.get("latest_std_primary") or None
        if current_primary == "":
            current_primary = None

        full_pub = agg_full.get(ref_norm) if ref_norm else None
        if not full_pub:
            full_pub = core.get("full_std_at_publication")
        if not full_pub and sheet.get("full_std_at_publication"):
            full_pub = sheet.get("full_std_at_publication")

        assessable = bool(core.get("compliance_assessable"))
        row_conclusion = compute_row_conclusion(
            baseline=baseline_primary,
            current=current_primary,
            compliance_assessable=assessable,
        )
        compare_row: dict[str, Any] = {
            "id": row_id,
            "sheet_row_id": row_id,
            "referenced_std_code": ref,
            "full_std_at_publication": full_pub,
            "baseline_latest_std_primary": baseline_primary,
            "current_latest_std_primary": current_primary,
            "row_conclusion": row_conclusion,
            "row_conclusion_label": ROW_LABELS.get(row_conclusion, row_conclusion),
            "compliance_assessable": assessable,
            "explanation": core.get("explanation"),
        }
        if baseline_info:
            compare_row["baseline_source"] = baseline_info.get("baseline_source")
            compare_row["baseline_recorded_at"] = baseline_info.get("baseline_recorded_at")
        else:
            compare_row["baseline_source"] = None
            compare_row["baseline_recorded_at"] = None
        out.append(compare_row)
    return out
