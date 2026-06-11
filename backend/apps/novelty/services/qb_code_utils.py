"""企标号与引用标准号规范化（查新模块内比对键）。"""

from __future__ import annotations

from apps.standards.services.reference_bundle import normalize_std_code_for_citation_match


def normalize_qb_code(value: str | None) -> str:
    """企标号规范化：trim、连字符统一、空白压缩。"""
    return normalize_std_code_for_citation_match(value)


def normalize_referenced_std_code(value: str | None) -> str:
    """引用标准号规范化（与合规 citation 比对一致）。"""
    return normalize_std_code_for_citation_match(value)


def qb_codes_match(a: str | None, b: str | None) -> bool:
    na = normalize_qb_code(a)
    nb = normalize_qb_code(b)
    if not na or not nb:
        return False
    return na.upper() == nb.upper()
