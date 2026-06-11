"""
鉴权占位：登录/JWT 或 Session 接入后，在各 Router 上通过 `auth=[...]` 挂载。

使用方式（示例）::

    from apps.core.api.auth import BearerAuthPlaceholder

    router = Router(tags=["audit"], auth=[BearerAuthPlaceholder()])

注意：django-ninja 中 **不要** 使用 ``auth=[]``（空列表）；会被误解析为 ``[[]]`` 导致认证阶段 ``TypeError: 'list' object is not callable``。
不启用路由级鉴权时请省略 ``auth`` 参数；单接口免鉴权请使用 ``auth=None``。

当前 `BearerAuthPlaceholder` 仅校验请求头是否存在 Bearer 片段，**不校验签名**；
成功时返回 `{"type": "bearer", "subject": "<token 截断>"}` 供多租户 `created_by` 使用；
生产环境必须替换为真实 JWT 校验逻辑。
"""

from __future__ import annotations

from ninja.security import HttpBearer


class BearerAuthPlaceholder(HttpBearer):
    """开发期占位：解析 Authorization Bearer；未实现真正的 JWT 校验。"""

    openapi_scheme = "bearerAuth"

    def authenticate(self, request, token):
        if not token:
            return None
        raw = (token or "").strip()
        # 开发期租户/用户标识：接入真实 JWT 后应替换为 sub / user_id
        subject = (raw[:128] if raw else "") or "anonymous"
        return {"type": "bearer", "subject": subject}
