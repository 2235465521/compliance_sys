from django.apps import AppConfig


class EngineConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.engine"
    label = "engine"
    verbose_name = "AI/工作流引擎适配层"
