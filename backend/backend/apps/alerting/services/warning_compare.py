"""预警专用比对：读评价落库结果 + 国标实时查新（不依赖 Q/ 企标号闸门）。"""

from __future__ import annotations

from typing import Any

from apps.novelty.services.baseline_service import baseline_row_for_compare, get_baseline_map
from apps.novelty.services.compare_service import ROW_LABELS, compute_row_conclusion
from apps.novelty.services.qb_code_utils import normalize_referenced_std_code
from apps.standards.services.reference_resolution import (
    infer_compliance_assessable_from_reference_row,
    resolve_latest_for_code,
)


def _is_gb_citation(ref: str | None) -> bool:
    s = (ref or "").strip()
    return bool(s) and s.upper().startswith("GB")


def _pick_gb_anchor(
    *,
    referenced_std_code: str,
    full_std_at_publication: str | None,
    eval_latest_std_primary: str | None,
    baseline_latest_std: str | None,
) -> str | None:
    for candidate in (
        full_std_at_publication,
        eval_latest_std_primary,
        baseline_latest_std,
        referenced_std_code,
    ):
        s = (candidate or "").strip()
        if _is_gb_citation(s):
            return s
    return None


def _current_latest_gb(std_code: str) -> tuple[str | None, str | None]:
    """对国标号做实时谱系查新，返回 (latest_primary, pedigree_hint)。"""
    code = (std_code or "").strip()
    if not code:
        return None, None
    resolved = resolve_latest_for_code(code)
    latest = (resolved.get("current_latest_id") or "").strip() or None
    hint = (resolved.get("pedigree_chain") or "").strip() or None
    return latest, hint


def _assessable_from_eval_row(row: dict[str, Any]) -> bool:
    if "compliance_assessable" in row:
        return bool(row.get("compliance_assessable"))
    return infer_compliance_assessable_from_reference_row(
        {
            "resolution_path": row.get("resolution_path"),
            "compliance_assessable": row.get("compliance_assessable"),
        }
    )


def build_warning_compare_rows(
    eval_rows: list[dict[str, Any]],
    qb_code: str,
) -> list[dict[str, Any]]:
    """
    列 1–3 来自评价快照 / 基线表；列 4 为本次预警对国标的 ``resolve_latest_for_code``。
    ``qb_code`` 仅用于读取基线快照键，不参与国标查新闸门。
    """
    baseline_map = get_baseline_map(qb_code)
    out: list[dict[str, Any]] = []

    for i, row in enumerate(eval_rows):
        if not isinstance(row, dict):
            continue
        row_id = str(row.get("id") or i + 1)
        ref = (row.get("referenced_std_code") or "").strip()
        ref_norm = normalize_referenced_std_code(ref)
        snap = baseline_map.get(ref_norm) if ref_norm else None
        baseline_info = baseline_row_for_compare(snap)
        baseline_primary = baseline_info["baseline_latest_std_primary"] if baseline_info else None

        full_pub = row.get("full_std_at_publication")
        if full_pub is not None and not str(full_pub).strip():
            full_pub = None

        eval_latest = row.get("eval_latest_std_primary")
        if eval_latest is not None and not str(eval_latest).strip():
            eval_latest = None

        assessable = _assessable_from_eval_row(row)
        anchor = _pick_gb_anchor(
            referenced_std_code=ref,
            full_std_at_publication=full_pub if isinstance(full_pub, str) else str(full_pub or "") or None,
            eval_latest_std_primary=eval_latest if isinstance(eval_latest, str) else str(eval_latest or "") or None,
            baseline_latest_std=baseline_primary,
        )

        baseline_for_compare = baseline_primary or eval_latest

        current_primary: str | None = None
        live_hint: str | None = None
        if assessable and anchor:
            current_primary, live_hint = _current_latest_gb(anchor)
        elif not _is_gb_citation(ref):
            assessable = False

        row_conclusion = compute_row_conclusion(
            baseline=baseline_for_compare,
            current=current_primary,
            compliance_assessable=assessable,
        )

        explanation = row.get("explanation")
        if live_hint and row_conclusion in ("updated", "unchanged", "first_record"):
            explanation = live_hint if not explanation else f"{explanation}; {live_hint}"

        compare_row: dict[str, Any] = {
            "id": row_id,
            "sheet_row_id": row_id,
            "referenced_std_code": ref,
            "full_std_at_publication": full_pub,
            "baseline_latest_std_primary": baseline_for_compare,
            "current_latest_std_primary": current_primary,
            "row_conclusion": row_conclusion,
            "row_conclusion_label": ROW_LABELS.get(row_conclusion, row_conclusion),
            "compliance_assessable": assessable,
            "explanation": explanation,
        }
        if baseline_info:
            compare_row["baseline_source"] = baseline_info.get("baseline_source")
            compare_row["baseline_recorded_at"] = baseline_info.get("baseline_recorded_at")
        else:
            compare_row["baseline_source"] = None
            compare_row["baseline_recorded_at"] = None
        out.append(compare_row)

    return out
