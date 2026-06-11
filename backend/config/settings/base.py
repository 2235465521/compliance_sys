"""
Django settings — base configuration shared by dev/prod.

数据库：未配置 MySQL 时使用 SQLite 便于本地快速启动；配置的 MYSQL_DATABASE 时使用 MySQL（PyMySQL 兼容 MySQLdb）。
"""

from pathlib import Path
import os
import sys

from celery.schedules import crontab
from dotenv import load_dotenv

try:
    import pymysql

    pymysql.version_info = (2, 2, 1, "final", 0)
    pymysql.install_as_MySQLdb()
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env", override=True)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me-in-production")

DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() in ("1", "true", "yes")

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # —— 按业务域拆分，便于并行开发（与需求文档 8.x 模块对应）——
    "apps.core",
    "apps.identity",
    "apps.standards",
    "apps.novelty",
    "apps.duplicate_check",
    "apps.compliance",
    "apps.batch_normative_reference",
    "apps.alerting",
    "apps.archive",
    "apps.audit",
    "apps.dashboard",
    "apps.engine",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --- Database ---
if os.environ.get("MYSQL_DATABASE"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": os.environ["MYSQL_DATABASE"],
            "USER": os.environ.get("MYSQL_USER", "root"),
            "PASSWORD": os.environ.get("MYSQL_PASSWORD", ""),
            "HOST": os.environ.get("MYSQL_HOST", "127.0.0.1"),
            "PORT": os.environ.get("MYSQL_PORT", "3306"),
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("DJANGO_MEDIA_ROOT", BASE_DIR / "media"))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Celery
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 60 * 60
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
# Windows 默认 prefork（billiard 多进程）下子进程常无法初始化 trace._localized，执行任务时报：
# ValueError: not enough values to unpack (expected 3, got 0)。非 Windows 仍用 prefork。
CELERY_WORKER_POOL = os.environ.get(
    "CELERY_WORKER_POOL",
    "threads" if sys.platform == "win32" else "prefork",
)
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = True
# 每日 00:05（Asia/Shanghai）将废止日已到的记录 std_status 置为「废止」
CELERY_BEAT_SCHEDULE = {
    "standards-sync-abolished-status-daily": {
        "task": "standards.sync_abolished_std_status",
        "schedule": crontab(hour=0, minute=5),
    },
}

# 合规 API：默认不鉴权、同步解析企标，与既有行为一致；生产可显式开启
COMPLIANCE_API_AUTH_REQUIRED = os.environ.get("COMPLIANCE_API_AUTH_REQUIRED", "false").lower() in (
    "1",
    "true",
    "yes",
)
COMPLIANCE_DIFY_PARSE_ASYNC = os.environ.get("COMPLIANCE_DIFY_PARSE_ASYNC", "false").lower() in (
    "1",
    "true",
    "yes",
)
# 为 true 且当前库非 MySQL 时，依赖业务表的接口返回 503；默认 false 便于 SQLite + Swagger 自测
COMPLIANCE_REQUIRE_MYSQL = os.environ.get("COMPLIANCE_REQUIRE_MYSQL", "false").lower() in (
    "1",
    "true",
    "yes",
)
# 异步解析：任务长期处于 pending（如未起 Celery Worker）时，超过该秒数自动标记 failed，避免前端无限等待
try:
    COMPLIANCE_PARSE_ASYNC_PENDING_TIMEOUT_SECONDS = float(
        os.environ.get("COMPLIANCE_PARSE_ASYNC_PENDING_TIMEOUT_SECONDS", "600") or "600"
    )
except ValueError:
    COMPLIANCE_PARSE_ASYNC_PENDING_TIMEOUT_SECONDS = 600.0
# Dify HTTP 客户端超时（秒）；`apps.engine.dify_client` 读取同名环境变量，此处便于文档与类型统一
try:
    DIFY_HTTP_TIMEOUT_SECONDS = float(os.environ.get("DIFY_HTTP_TIMEOUT_SECONDS", "300") or "300")
except ValueError:
    DIFY_HTTP_TIMEOUT_SECONDS = 300.0
