from __future__ import annotations

from django.conf import settings
from django.db import connection
from ninja.errors import HttpError

COMPLIANCE_REQUIRES_MYSQL_MSG = (
    "合规评价本接口依赖 MySQL 与 STSC L3 业务表（regulation_evaluated_standard_basic、"
    "regulation_normative_reference_mapping、regulation_evaluation_result 等）。"
    "请在 backend/.env 配置 MYSQL_DATABASE=STSC_standard_database（及 MYSQL_USER/MYSQL_PASSWORD/"
    "MYSQL_HOST/MYSQL_PORT），执行 migrate --fake-initial 后重试。"
    "若仅本地自测，可保持 COMPLIANCE_REQUIRE_MYSQL=false（默认）；联调请改为 true。"
)

REFERENCE_LATEST_REQUIRES_MYSQL_MSG = (
    "GET .../step/3/reference-latest 为批量查新接口，必须使用 MySQL STSC 库且已导入 "
    "regulation_normative_reference_mapping；引用解析读取 L1 表 std_base / std_pedigree / std_ped_chain。"
    "请在 backend/.env 配置 MYSQL_* 后，完成审核 2 确认再调用。"
)


def db_vendor() -> str:
    return connection.vendor


def is_mysql() -> bool:
    return connection.vendor == "mysql"


def require_mysql() -> None:
    """在 COMPLIANCE_REQUIRE_MYSQL=true 时强制使用 MySQL。"""
    if not getattr(settings, "COMPLIANCE_REQUIRE_MYSQL", False):
        return
    if not is_mysql():
        raise HttpError(503, COMPLIANCE_REQUIRES_MYSQL_MSG)
