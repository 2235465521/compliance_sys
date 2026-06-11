"""本地开发：默认 DEBUG 打开。"""

from .base import *  # noqa: F403, F401

DEBUG = True

ALLOWED_HOSTS = ["*"]

# 本地开发默认用后台线程处理批量任务，无需单独启动 Celery Worker
BATCH_NORMATIVE_REF_USE_THREAD = True
STD_INDEX_BATCH_USE_THREAD = True


class _SuppressUndefinedBatchFilter:
    """过滤掉前端 batchId 未初始化时产生的 /undefined/ 轮询日志。"""

    def filter(self, record):  # noqa: ANN001
        msg = record.getMessage()
        return "/batch-index-import/undefined/" not in msg


LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "suppress_undefined_batch": {
            "()": _SuppressUndefinedBatchFilter,
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["suppress_undefined_batch"],
        },
    },
    "loggers": {
        "django.server": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
