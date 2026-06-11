"""预警 API 响应包络（与 pedigree_compat 一致）。"""

from __future__ import annotations

from typing import Any


def envelope_ok(data: Any) -> dict[str, Any]:
    return {"code": 200, "msg": "success", "data": data}


def envelope_err(code: int, msg: str) -> dict[str, Any]:
    return {"code": code, "msg": msg, "data": None}
