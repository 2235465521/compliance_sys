"""STSC L1 标准事实库只读查询（std_base / std_pedigree / std_ped_chain）。

当库内存在 ``std_pedigree`` 时，引用解析与查新优先走本模块，无需 ``standard_pedigree`` /
``national_standard_basic`` 兼容视图。
"""

from __future__ import annotations

import re
from typing import Any

from django.db import connection

from apps.core.regulation_subject import table_exists

_YEAR_SUFFIX_RE = re.compile(r"[-－﹣]\s*(\d{4})\s*$")


def use_stsc_l1_catalog() -> bool:
    return table_exists("std_base") and table_exists("std_pedigree")


def fetch_pedigree_row(std_code: str) -> tuple[str | None, str | None, str | None]:
    """按标准号查谱系行，返回 (latest_std_code, ped_id, part_chain)。"""
    code = (std_code or "").strip()
    if not code:
        return None, None, None
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.std_id_latest, p.ped_id, COALESCE(c.ped_chain, '')
            FROM std_pedigree p
            JOIN std_base b ON b.id = p.base_id
            LEFT JOIN std_ped_chain c ON c.ped_id = p.ped_id
            WHERE b.std_id = %s
            ORDER BY p.id DESC
            LIMIT 1
            """,
            [code],
        )
        row = cursor.fetchone()
    if not row:
        return None, None, None
    return (row[0] or None), (row[1] or None), (row[2] or None)


def infer_std_code_from_pedigree_prefix(prefix: str, as_of_year: int) -> str | None:
    """
    无年代号：在 std_base + std_pedigree 中按前缀族扫描，
    取末段 -YYYY 中 Y ≤ as_of_year 的候选；否则回退精确前缀行。
    """
    p = (prefix or "").strip()
    if not p:
        return None
    like_pat = f"{p}-%"
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT b.std_id, p.id
            FROM std_pedigree p
            JOIN std_base b ON b.id = p.base_id
            WHERE b.std_id = %s OR b.std_id LIKE %s
            ORDER BY p.id DESC
            """,
            [p, like_pat],
        )
        rows = cursor.fetchall()
    if not rows:
        return None

    seen: set[str] = set()
    codes_in_order: list[str] = []
    for std_id, _rid in rows:
        sc = (std_id or "").strip()
        if not sc or sc in seen:
            continue
        seen.add(sc)
        codes_in_order.append(sc)

    dated: list[tuple[int, str]] = []
    exact_prefix: list[str] = []
    for sc in codes_in_order:
        if sc == p:
            exact_prefix.append(sc)
            continue
        m = _YEAR_SUFFIX_RE.search(sc)
        if m:
            y = int(m.group(1))
            if y <= as_of_year:
                dated.append((y, sc))
    if dated:
        dated.sort(key=lambda t: (-t[0], t[1]))
        return dated[0][1]
    if exact_prefix:
        return exact_prefix[0]
    return None


def fetch_std_names_by_codes(codes: list[str]) -> dict[str, str]:
    """按 std_id 批量查 std_chinesename。"""
    if not codes:
        return {}
    placeholders = ",".join(["%s"] * len(codes))
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT std_id, std_chinesename
            FROM std_base
            WHERE std_id IN ({placeholders})
            """,
            codes,
        )
        rows = cursor.fetchall()
    out: dict[str, str] = {}
    for std_id, name in rows:
        key = (std_id or "").strip()
        if not key:
            continue
        val = (name or "").strip() if name is not None else ""
        if val:
            out[key] = val
    return out


def fetch_std_base_row(std_code: str) -> tuple[str | None, str | None, str | None]:
    """(std_id, std_chinesename, ped_id) — 谱系 ped_id 取首条关联。"""
    code = (std_code or "").strip()
    if not code:
        return None, None, None
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT b.std_id, b.std_chinesename, p.ped_id
            FROM std_base b
            LEFT JOIN std_pedigree p ON p.base_id = b.id
            WHERE b.std_id = %s
            ORDER BY p.id DESC
            LIMIT 1
            """,
            [code],
        )
        row = cursor.fetchone()
    if not row:
        return None, None, None
    return (row[0] or None), (row[1] or None), (row[2] or None)


def l1_std_file_and_name(cursor: Any, std_code: str) -> tuple[bool, str | None, str | None]:
    """只读：标准 PDF 路径（std_filepath 取一条）与中文名。"""
    code = (std_code or "").strip()
    if not code:
        return False, None, None
    cursor.execute(
        """
        SELECT b.std_chinesename,
               (SELECT MIN(f.file_path) FROM std_filepath f WHERE f.base_id = b.id)
        FROM std_base b
        WHERE b.std_id = %s
        LIMIT 1
        """,
        [code],
    )
    row = cursor.fetchone()
    if not row:
        return False, None, None
    name = (row[0] or "").strip() or None
    path = (row[1] or "").strip() or None if row[1] is not None else None
    return True, path, name
