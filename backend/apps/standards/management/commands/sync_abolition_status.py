# noqa: INP001
"""按实施日 / 废止日同步国标主表 std_status。"""

from __future__ import annotations

from datetime import date

from django.core.management.base import BaseCommand

from apps.standards.services.standard_status_sync import sync_national_standard_status


class Command(BaseCommand):
    help = (
        "1) effective_date < 今日 且状态含「即将」→「现行」；"
        "2) abolition_date <= 今日 且非「废止」→「废止」。"
        "可与 Celery Beat 每日任务配合。"
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--as-of",
            type=str,
            default=None,
            help="统计基准日 YYYY-MM-DD，默认服务器本地今日",
        )

    def handle(self, *args, **options) -> None:
        as_of_raw = options.get("as_of")
        as_of: date | None = None
        if as_of_raw:
            as_of = date.fromisoformat(str(as_of_raw).strip())

        result = sync_national_standard_status(as_of=as_of)
        self.stdout.write(
            self.style.SUCCESS(
                f"as_of={result['as_of']} "
                f"updated_current={result['updated_current']} "
                f"updated_abolished={result['updated_abolished']}"
            )
        )
