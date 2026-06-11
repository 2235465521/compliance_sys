"""按实施日 / 废止日自动同步国标主表 std_status。"""

from __future__ import annotations

from datetime import date

from django.db.models import Q
from django.utils import timezone

from apps.standards.models import NationalStandardBasic

CURRENT_STATUS = "现行"
ABOLISHED_STATUS = "废止"
_UPCOMING_MARKER = "即将"
_ABOLISHED_MARKER = "废止"


def sync_current_std_status(*, as_of: date | None = None) -> dict[str, int | str]:
    """
    实施日已过：``effective_date < as_of`` 且状态含「即将」、不含「废止」→ ``现行``.

    已到达废止日（``abolition_date <= as_of``）的记录不在此步改为现行，留给废止同步处理。
    """
    today = as_of or timezone.localdate()
    updated = (
        NationalStandardBasic.objects.filter(
            effective_date__isnull=False,
            effective_date__lt=today,
            std_status__icontains=_UPCOMING_MARKER,
        )
        .exclude(std_status__icontains=_ABOLISHED_MARKER)
        .filter(Q(abolition_date__isnull=True) | Q(abolition_date__gt=today))
        .update(std_status=CURRENT_STATUS)
    )
    return {"as_of": today.isoformat(), "updated": updated}


def sync_abolished_std_status(*, as_of: date | None = None) -> dict[str, int | str]:
    """
    废止日已到：``abolition_date <= as_of`` 且状态不含「废止」→ ``废止``.
    """
    today = as_of or timezone.localdate()
    updated = (
        NationalStandardBasic.objects.filter(
            abolition_date__isnull=False,
            abolition_date__lte=today,
        )
        .exclude(std_status__icontains=_ABOLISHED_MARKER)
        .update(std_status=ABOLISHED_STATUS)
    )
    return {"as_of": today.isoformat(), "updated": updated}


def sync_national_standard_status(*, as_of: date | None = None) -> dict[str, int | str]:
    """先同步「即将实施→现行」，再同步「→废止」（废止优先于现行）。"""
    today = as_of or timezone.localdate()
    cur = sync_current_std_status(as_of=today)
    abo = sync_abolished_std_status(as_of=today)
    return {
        "as_of": today.isoformat(),
        "updated_current": cur["updated"],
        "updated_abolished": abo["updated"],
    }
