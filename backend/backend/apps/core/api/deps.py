"""路由依赖注入占位（与 Django `request.user`、审计 IP 等配合）。"""

from __future__ import annotations

from django.http import HttpRequest


def client_ip(request: HttpRequest) -> str | None:
    return request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get(
        "REMOTE_ADDR"
    )
