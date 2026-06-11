from django.contrib import admin
from django.http import HttpResponse, JsonResponse
from django.urls import path

from config.api import api
from config.api_compat import api_compat


def root_api_hint(_request):
    """根路径无 Ninja 挂载；返回 JSON 指引，避免浏览器访问 / 时误以为服务未启动。"""
    return JsonResponse(
        {
            "service": "regulation-platform-api",
            "api_prefix": "/api/v1/",
            "openapi_docs": "/api/v1/docs",
            "health": "/api/v1/health",
            "admin": "/admin/",
        }
    )


def favicon_no_content(_request):
    """消除浏览器默认请求 /favicon.ico 时的 404 日志。"""
    return HttpResponse(status=204)


urlpatterns = [
    path("", root_api_hint),
    path("favicon.ico", favicon_no_content),
    path("admin/", admin.site.urls),
    path("api/v1/", api.urls),
    path("api/", api_compat.urls),
]
