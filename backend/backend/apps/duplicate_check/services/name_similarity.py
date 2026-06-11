"""
名称快查：复刻旧 `views_duplicate.name_check` 流程，表改为 `national_standard_basic`。
"""

from __future__ import annotations

import difflib
import re
from typing import Any

from django.db import connection


def calculate_precision_score(keyword: str, target_name: str) -> float:
    """结合分层加权与长度惩罚的高精度评分（与旧版逻辑一致）。"""
    k = keyword.lower().strip()
    t = target_name.lower().strip()

    if k == t:
        return 100.0

    score = 0.0

    if k in t:
        score += 40.0
        if t.startswith(k):
            score += 20.0
        coverage = len(k) / len(t) if t else 0.0
        score += coverage * 20.0
    else:
        fuzzy_ratio = difflib.SequenceMatcher(None, k, t).ratio()
        score = fuzzy_ratio * 90.0

    return round(min(score, 99.9), 1)


def run_name_check(keyword: str) -> dict[str, Any]:
    """
    返回与旧版兼容的字典：
    success / message / data / error；data 内含 bz_id, bz_name, status, similarity。
    """
    keyword = keyword.strip()
    if not keyword:
        return {"success": False, "error": "请输入需要查重的标准名称"}

    if re.search(r"\d", keyword) and not re.search(r"[\u4e00-\u9fa5]", keyword):
        return {
            "success": False,
            "error": "查重雷达仅支持【标准名称】相似度比对。若要精准查询标准号状态，请前往【单条精准查新】模块。",
        }

    words = [w for w in re.split(r"\s+", keyword) if len(w) > 1]
    if not words:
        words = [keyword]

    placeholders = " OR ".join(["std_name LIKE %s" for _ in words])
    params = [f"%{w}%" for w in words]

    sql = f"""
        SELECT std_code, std_name, std_status
        FROM national_standard_basic
        WHERE ({placeholders})
        LIMIT 500
    """

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        cols = [c[0] for c in cursor.description]
        candidates = [dict(zip(cols, row)) for row in cursor.fetchall()]

    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in candidates:
        std_code = item.get("std_code") or ""
        std_name = item.get("std_name") or ""
        if std_code in seen:
            continue
        seen.add(std_code)

        sim_score = calculate_precision_score(keyword, std_name)
        if sim_score > 20:
            results.append(
                {
                    "bz_id": std_code,
                    "bz_name": std_name,
                    "status": item.get("std_status"),
                    "similarity": sim_score,
                }
            )

    results.sort(key=lambda x: x["similarity"], reverse=True)
    top_results = results[:50]

    return {
        "success": True,
        "message": f"雷达已锁定 {len(top_results)} 项相似名称标准",
        "data": top_results,
    }
