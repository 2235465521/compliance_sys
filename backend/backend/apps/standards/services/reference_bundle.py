"""reference-latest / 批量规范性引用：响应拼装与整文件合规结论。"""

from __future__ import annotations

import re
from typing import Any

from apps.standards.services.reference_resolution import (
    RESOLUTION_PATH_MANUAL_REVIEW_NON_GB,
    RESOLUTION_PATH_MISSING_ENTERPRISE_QB,
    RESOLUTION_PATH_QB_ENTERPRISE_CITATION,
    fetch_national_standard_names_by_codes,
    infer_compliance_assessable_from_reference_row,
)

_WS_COLLAPSE = re.compile(r"\s+")

# 整文件规范性引用自动结论（四态）
FILE_COMPLIANCE_COMPLIANT = "compliant"
FILE_COMPLIANCE_NON_COMPLIANT = "non_compliant"
FILE_COMPLIANCE_UNDETERMINED = "undetermined"
FILE_COMPLIANCE_NO_REFERENCES = "no_references"


def normalize_std_code_for_citation_match(s: str | None) -> str:
    """strip、全角/Unicode 连字符归一为 ASCII `-`、连续空白压成单空格，便于比对。"""
    t = (s or "").strip()
    if not t:
        return ""
    t = t.replace("－", "-").replace("﹣", "-").replace("—", "-").replace("–", "-")
    return _WS_COLLAPSE.sub(" ", t).strip()


def compute_citation_matches_latest(
    *,
    full_at_publication: str | None,
    latest_std_primary: str | None,
    resolution_path: str | None,
) -> bool:
    """
    「补全后的标准号」是否与**主展示现行号**（``latest_std_primary``）经同一规范化后**完全相同**。

    仅当两侧规范化后**均非空**时才可能为 ``True``；任一侧缺失有效标准号则为 ``False``。
    """
    path = (resolution_path or "").strip() or ""

    if path == "empty":
        return True
    if path == RESOLUTION_PATH_QB_ENTERPRISE_CITATION:
        return False
    if path == RESOLUTION_PATH_MANUAL_REVIEW_NON_GB:
        return False
    if path == RESOLUTION_PATH_MISSING_ENTERPRISE_QB:
        return False
    if path in ("unresolved_no_historical_row",) or path.endswith("_miss"):
        return False

    full_raw = full_at_publication
    if full_raw is not None and not isinstance(full_raw, str):
        full_raw = str(full_raw)
    full_n = normalize_std_code_for_citation_match(full_raw)

    prim = latest_std_primary
    if prim is not None and not isinstance(prim, str):
        prim = str(prim)
    latest_n = normalize_std_code_for_citation_match(prim)

    if not full_n or not latest_n:
        return False

    return full_n == latest_n


def enrich_normative_reference_row(row: dict[str, Any]) -> dict[str, Any]:
    """
    写回 ``compliance_assessable``（按 ``resolution_path`` 与谱系字段推断，兼容缺省/legacy 落库）及
    ``citation_matches_latest``：仅 ``compliance_assessable`` 为真时计算布尔；否则为 ``None``。
    """
    row["compliance_assessable"] = infer_compliance_assessable_from_reference_row(row)
    if not row.get("compliance_assessable"):
        row["citation_matches_latest"] = None
        return row

    full = row.get("full_std_at_publication")
    primary = row.get("latest_std_primary")
    if primary is None or primary == "":
        primary = row.get("current_latest_id")

    path = row.get("resolution_path")
    if path is None and not str(row.get("referenced_std_code") or "").strip():
        path = "empty"

    def _as_str_or_none(x: Any) -> str | None:
        if x is None:
            return None
        if isinstance(x, str):
            return x
        return str(x)

    row["citation_matches_latest"] = compute_citation_matches_latest(
        full_at_publication=_as_str_or_none(full),
        latest_std_primary=_as_str_or_none(primary),
        resolution_path=_as_str_or_none(path),
    )
    return row


def _std_code_key_for_name_lookup(x: Any) -> str | None:
    if x is None:
        return None
    s = str(x).strip()
    return s or None


def attach_normative_reference_std_names(rows: list[dict[str, Any]]) -> None:
    """
    就地填充 ``full_std_name_at_publication``、``latest_std_name``：按 ``national_standard_basic`` 查名称。

    读 ``full_std_at_publication`` / ``historical_full_std_code`` 与 ``latest_std_primary`` / ``current_latest_id``；
    多条引用时 **一次 IN 查询**，避免 Celery 批量任务 N+1。
    """
    to_fetch: list[str] = []
    seen: set[str] = set()
    pairs: list[tuple[str | None, str | None]] = []
    for row in rows:
        if not isinstance(row, dict):
            pairs.append((None, None))
            continue
        full_raw = row.get("full_std_at_publication")
        if full_raw is None:
            full_raw = row.get("historical_full_std_code")
        latest_raw = row.get("latest_std_primary")
        if latest_raw is None or latest_raw == "":
            latest_raw = row.get("current_latest_id")
        fk = _std_code_key_for_name_lookup(full_raw)
        lk = _std_code_key_for_name_lookup(latest_raw)
        pairs.append((fk, lk))
        for k in (fk, lk):
            if k and k not in seen:
                seen.add(k)
                to_fetch.append(k)
    names = fetch_national_standard_names_by_codes(to_fetch)
    for row, (fk, lk) in zip(rows, pairs):
        if not isinstance(row, dict):
            continue
        row["full_std_name_at_publication"] = names.get(fk) if fk else None
        row["latest_std_name"] = names.get(lk) if lk else None


def normative_reference_row_core(raw: dict[str, Any]) -> dict[str, Any]:
    """
    单条引用：精简结构 + ``citation_matches_latest``；**不含**标准名称。

    批量任务内可对 ``[core(...), ...]`` 调用 ``attach_normative_reference_std_names`` 一次以减少查询。
    """
    ref = raw.get("query_bz_id")
    ref_s = (ref or "").strip() if isinstance(ref, str) else (str(ref) if ref is not None else "")
    row: dict[str, Any] = {
        "referenced_std_code": ref_s,
        "resolution_path": raw.get("resolution_path"),
        "compliance_assessable": bool(raw.get("compliance_assessable")),
        "full_std_at_publication": raw.get("historical_full_std_code"),
        "latest_std_primary": (raw.get("current_latest_id") or "")
        if isinstance(raw.get("current_latest_id"), str)
        else (str(raw.get("current_latest_id") or "")),
        "explanation": raw.get("pedigree_chain") or "",
    }
    ih = raw.get("inferred_historical_std_code")
    if ih is not None and str(ih).strip():
        row["inferred_historical_std_code"] = str(ih).strip()
    enrich_normative_reference_row(row)
    return row


def normative_reference_row_out(raw: dict[str, Any]) -> dict[str, Any]:
    """
    单条引用对外精简结构（批量与合规 reference-latest 共用）。

    字段：``referenced_std_code``、``resolution_path``、``compliance_assessable``、
    ``citation_matches_latest``（可比对时有布尔，否则 ``null``）、
    ``full_std_at_publication``、``latest_std_primary``、可选 ``inferred_historical_std_code``、
    ``full_std_name_at_publication``、``latest_std_name``（主表可查时非空）、``explanation``。
    """
    row = normative_reference_row_core(raw)
    attach_normative_reference_std_names([row])
    return row


def compute_normative_reference_file_outcome(items: list[dict[str, Any]] | None) -> str:
    """
    整文件结论（强结论）：

    - ``no_references``：无引用行；
    - ``non_compliant``：存在至少一条可自动比对且 ``citation_matches_latest`` 为 ``false``；
    - ``compliant``：**每一条**均可比对（``compliance_assessable``）且 ``citation_matches_latest`` 均为 ``true``；
    - ``undetermined``：其余（含任一条不可比对、或存在 ``null`` 比对结果）。
    """
    if not items:
        return FILE_COMPLIANCE_NO_REFERENCES
    for row in items:
        if not isinstance(row, dict):
            return FILE_COMPLIANCE_UNDETERMINED
        if row.get("compliance_assessable") and row.get("citation_matches_latest") is False:
            return FILE_COMPLIANCE_NON_COMPLIANT
    for row in items:
        if not isinstance(row, dict):
            return FILE_COMPLIANCE_UNDETERMINED
        if not row.get("compliance_assessable"):
            return FILE_COMPLIANCE_UNDETERMINED
        if row.get("citation_matches_latest") is not True:
            return FILE_COMPLIANCE_UNDETERMINED
    return FILE_COMPLIANCE_COMPLIANT


# 兼容旧测试名：内部转调新结论
def all_references_are_latest_from_bundle_items(items: list[dict[str, Any]] | None) -> bool:
    """已废弃语义：等价于 ``compute_normative_reference_file_outcome == compliant``（仅兼容旧调用）。"""
    return compute_normative_reference_file_outcome(items) == FILE_COMPLIANCE_COMPLIANT


def enrich_citation_latest_flags(bundle_item: dict[str, Any]) -> dict[str, Any]:
    """兼容旧字段名：对含 ``compliance_assessable`` 的行转调 ``enrich_normative_reference_row``。"""
    if "compliance_assessable" in bundle_item:
        return enrich_normative_reference_row(bundle_item)
    full = bundle_item.get("full_std_at_publication")
    if full is None:
        full = bundle_item.get("historical_full_std_code")
    primary = bundle_item.get("latest_std_primary")
    if primary is None or primary == "":
        primary = bundle_item.get("current_latest_id")
    path = bundle_item.get("resolution_path")
    if path is None and not str(bundle_item.get("referenced_std_code") or "").strip():
        path = "empty"

    def _as_str_or_none(x: Any) -> str | None:
        if x is None:
            return None
        if isinstance(x, str):
            return x
        return str(x)

    bundle_item["citation_matches_latest"] = compute_citation_matches_latest(
        full_at_publication=_as_str_or_none(full),
        latest_std_primary=_as_str_or_none(primary),
        resolution_path=_as_str_or_none(path),
    )
    bundle_item["is_latest"] = bundle_item["citation_matches_latest"]
    return bundle_item


def reference_latest_bundle_item_for_response(raw: dict[str, Any]) -> dict[str, Any]:
    """与 ``normative_reference_row_out`` 一致（合规 Step3 等）。"""
    return normative_reference_row_out(raw)
