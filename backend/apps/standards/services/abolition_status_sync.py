"""兼容旧导入路径；逻辑见 standard_status_sync。"""

from apps.standards.services.standard_status_sync import (  # noqa: F401
    sync_abolished_std_status,
    sync_current_std_status,
    sync_national_standard_status,
)
