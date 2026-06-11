"""仪表盘只读聚合：国标主表 national_standard_basic。"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from apps.dashboard.schemas import (
    AbolitionHintItem,
    AbolitionHintsData,
    AbolitionHintsOut,
    EffectiveHintItem,
    EffectiveHintsData,
    EffectiveHintsOut,
    QuickLookupDetailOut,
    QuickLookupOut,
)
from apps.standards.models import NationalStandardBasic
from apps.standards.services import registry as registry_svc
from apps.standards.services.standard_status_sync import sync_national_standard_status


def national_standard_basic_statistics():
    return registry_svc.statistics()


def quick_lookup(std_code: str) -> QuickLookupOut | None:
    code = (std_code or "").strip()
    if not code:
        return None
    detail = registry_svc.get_detail(bz_id=code)
    if detail is None:
        return None
    slim = QuickLookupDetailOut.model_validate(
        detail.model_dump(exclude={"detail_url", "std_file_path"})
    )
    return QuickLookupOut(data=slim)


def abolition_hints(
    *,
    upcoming_days: int,
    recent_days: int,
    limit: int,
) -> AbolitionHintsOut:
    sync_national_standard_status()
    today = timezone.localdate()
    if upcoming_days < 0:
        upcoming_days = 0
    if recent_days < 0:
        recent_days = 0
    limit = max(1, min(limit, 500))

    end_upcoming = today + timedelta(days=upcoming_days)
    start_recent = today - timedelta(days=recent_days)

    base = NationalStandardBasic.objects.filter(abolition_date__isnull=False)

    upcoming_qs = (
        base.filter(abolition_date__gte=today, abolition_date__lte=end_upcoming)
        .order_by("abolition_date", "std_code")[:limit]
    )
    recent_qs = (
        base.filter(abolition_date__lt=today, abolition_date__gte=start_recent)
        .order_by("-abolition_date", "std_code")[:limit]
    )

    def row(obj: NationalStandardBasic) -> AbolitionHintItem:
        ad = obj.abolition_date
        assert ad is not None
        return AbolitionHintItem(
            std_code=obj.std_code,
            std_name=obj.std_name,
            std_status=obj.std_status,
            abolition_date=ad,
            days_from_today=(ad - today).days,
        )

    return AbolitionHintsOut(
        data=AbolitionHintsData(
            as_of=today,
            window_days=upcoming_days,
            upcoming=[row(o) for o in upcoming_qs],
            recent=[row(o) for o in recent_qs],
            recent_days=recent_days,
        )
    )


def effective_hints(
    *,
    window_days: int,
    limit: int,
) -> EffectiveHintsOut:
    sync_national_standard_status()
    today = timezone.localdate()
    if window_days < 0:
        window_days = 0
    limit = max(1, min(limit, 500))

    end = today + timedelta(days=window_days)
    qs = (
        NationalStandardBasic.objects.filter(
            effective_date__isnull=False,
            effective_date__gte=today,
            effective_date__lte=end,
        )
        .exclude(std_status__icontains="废止")
        .exclude(std_status__icontains="现行")
        .order_by("effective_date", "std_code")[:limit]
    )

    def row(obj: NationalStandardBasic) -> EffectiveHintItem:
        ed = obj.effective_date
        assert ed is not None
        return EffectiveHintItem(
            std_code=obj.std_code,
            std_name=obj.std_name,
            std_status=obj.std_status,
            effective_date=ed,
            days_from_today=(ed - today).days,
        )

    return EffectiveHintsOut(
        data=EffectiveHintsData(
            as_of=today,
            window_days=window_days,
            upcoming=[row(o) for o in qs],
        )
    )
