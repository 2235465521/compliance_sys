"""
语义立项辅助：对 `std_scope_table` 中候选国标号做意图 vs 适用范围文本相似度打分。

说明：完整「向量语义碰撞」需与入库时相同的 embedding 模型对 `intent_text` 编码；
当前阶段使用文本相似度（SequenceMatcher）作为主分数，与库中 `scope_vector`
的余弦相似度可在接入统一向量服务后接入（函数留扩展点）。
"""

from __future__ import annotations

import difflib
import json
from typing import Any

from django.db import connection


def _parse_vector(raw: Any) -> list[float] | None:
    if raw is None:
        return None
    if isinstance(raw, list):
        return [float(x) for x in raw]
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return [float(x) for x in data]
        except (json.JSONDecodeError, TypeError, ValueError):
            return None
    return None


def text_similarity_score(intent: str, scope: str) -> float:
    intent = (intent or "").strip().lower()
    scope = (scope or "").strip().lower()
    if not intent or not scope:
        return 0.0
    return round(difflib.SequenceMatcher(None, intent, scope).ratio() * 100, 1)


def run_semantic_ranking(intent_text: str, candidate_std_codes: list[str]) -> list[dict[str, Any]]:
    """
    按综合分数降序返回：
    [{\"std_code\", \"similarity\", \"text_score\", \"vector_score\"}, ...]
    `vector_score` 在无意图向量时为 0。
    """
    codes = [c.strip() for c in candidate_std_codes if c and str(c).strip()]
    if not codes:
        return []

    placeholders = ",".join(["%s"] * len(codes))

    sql = f"""
        SELECT std_code, scope_text, scope_vector
        FROM std_scope_table
        WHERE std_code IN ({placeholders})
    """

    rows: list[dict[str, Any]] = []
    with connection.cursor() as cursor:
        cursor.execute(sql, codes)
        colnames = [c[0] for c in cursor.description]
        for row in cursor.fetchall():
            rows.append(dict(zip(colnames, row)))

    ranked: list[dict[str, Any]] = []
    for row in rows:
        std_code = row.get("std_code") or ""
        scope_text = row.get("scope_text") or ""
        vec_raw = row.get("scope_vector")
        vec = _parse_vector(vec_raw)

        t_score = text_similarity_score(intent_text, scope_text)
        v_score = 0.0
        # 无意图向量时仅用文本分作为最终分；接入 embedding 后可合并 v_score
        combined = t_score

        ranked.append(
            {
                "std_code": std_code,
                "similarity": round(combined, 1),
                "text_score": t_score,
                "vector_score": v_score,
                "has_scope_vector": vec is not None and len(vec) > 0,
            }
        )

    ranked.sort(key=lambda x: x["similarity"], reverse=True)
    return ranked
