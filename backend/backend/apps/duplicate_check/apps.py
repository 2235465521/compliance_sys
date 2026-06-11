from django.apps import AppConfig


class DuplicateCheckConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.duplicate_check"
    label = "duplicate_check"
    verbose_name = "查重服务（8.3）"
