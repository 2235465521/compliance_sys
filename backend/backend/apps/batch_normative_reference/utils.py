"""从 Dify 扁平解析结果提取引用标准号列表（去重保序）。"""

from __future__ import annotations

from typing import Any


def referenced_codes_from_flat_parse(parse: dict[str, Any]) -> list[str]:
    codes = parse.get("referenced_std_codes") or []
    out: list[str] = []
    seen_set: set[str] = set()
    if isinstance(codes, list) and codes:
        for c in codes:
            s = str(c).strip()
            if s and s not in seen_set:
                seen_set.add(s)
                out.append(s)
        return out

    detail = parse.get("references_detail") or []
    if isinstance(detail, list):
        for row in detail:
            if isinstance(row, dict):
                sid = row.get("standard_id") or row.get("std_code") or row.get("code")
                if sid:
                    s = str(sid).strip()
                    if s and s not in seen_set:
                        seen_set.add(s)
                        out.append(s)
    return out
