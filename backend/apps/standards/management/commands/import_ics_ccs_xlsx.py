# noqa: INP001
"""Load ICS/CCS industry classification from bundled xlsx."""

from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.standards.models import CcsIndustryClassification, IcsIndustryClassification
from apps.standards.services.classification_import import (
    DEFAULT_ICS_CCS_XLSX,
    load_ccs_rows,
    load_ics_merged,
)
from apps.standards.services.industry_taxonomy import (
    _dedupe_ccs_rows,
    _dedupe_ics_rows,
    _upsert_ccs_rows,
    _upsert_ics_rows,
)


class Command(BaseCommand):
    help = (
        "从 resources/ICS(第7版）+CCS.xlsx 导入 ICS（合并 ICS+Sheet2，主键为「分类号 u」）"
        "与 CCS 到 ics_industry_classification / ccs_industry_classification。"
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--path",
            type=str,
            default=None,
            help="xlsx 路径，默认使用 apps/standards/resources 下同名文件",
        )
        parser.add_argument(
            "--no-clear",
            action="store_true",
            help="不清空表，仅在唯一键冲突时可能失败（默认先清空两表再导入）",
        )
        parser.add_argument(
            "--merge",
            action="store_true",
            help="不清空；按 ICS/CCS 分类号 upsert（与 Web 上传一致）。不可与默认「清空后 bulk」同时使用。",
        )

    def handle(self, *args, **options) -> None:
        path = Path(options["path"]) if options["path"] else DEFAULT_ICS_CCS_XLSX
        if not path.is_file():
            self.stderr.write(self.style.ERROR(f"文件不存在: {path}"))
            return
        clear = not options["no_clear"] and not options["merge"]
        if options["merge"] and options["no_clear"]:
            self.stderr.write(self.style.WARNING("已指定 --merge，将忽略 --no-clear"))

        ics_data = load_ics_merged(path)
        ccs_data = load_ccs_rows(path)

        if options["merge"]:
            ics_rows = _dedupe_ics_rows(ics_data)
            ccs_rows = _dedupe_ccs_rows(ccs_data)
            ics_stats = _upsert_ics_rows(ics_rows)
            ccs_stats = _upsert_ccs_rows(ccs_rows)
            self.stdout.write(
                self.style.SUCCESS(
                    f"合并完成（upsert）：ICS 处理 {ics_stats['processed']} 条"
                    f"（新增 {ics_stats['created']} / 更新 {ics_stats['updated']}），"
                    f"CCS 处理 {ccs_stats['processed']} 条"
                    f"（新增 {ccs_stats['created']} / 更新 {ccs_stats['updated']}），来源 {path}"
                )
            )
            return

        with transaction.atomic():
            if clear:
                CcsIndustryClassification.objects.all().delete()
                IcsIndustryClassification.objects.all().delete()

            IcsIndustryClassification.objects.bulk_create(
                [IcsIndustryClassification(**row) for row in ics_data],
                batch_size=500,
            )
            CcsIndustryClassification.objects.bulk_create(
                [CcsIndustryClassification(**row) for row in ccs_data],
                batch_size=500,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"完成：ICS {len(ics_data)} 条，CCS {len(ccs_data)} 条（来源 {path}）"
            )
        )
