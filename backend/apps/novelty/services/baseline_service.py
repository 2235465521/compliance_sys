"""查新基线快照：首次写入后只读，供三列比对第二列。"""

from __future__ import annotations

import logging
from typing import Any

from apps.compliance.models import ComplianceEvaluationTask
from apps.novelty.models import NoveltyReferenceBaselineSnapshot
from apps.novelty.services.qb_code_utils import normalize_qb_code, normalize_referenced_std_code

logger = logging.getLogger(__name__)


def _primary_from_row(row: dict[str, Any]) -> str | None:
    prim = row.get("latest_std_primary")
    if prim is None or (isinstance(prim, str) and not prim.strip()):
        prim = row.get("current_latest_id")
    if prim is None:
        return None
    s = str(prim).strip()
    return s or None


def record_baseline_rows(
    subject_code: str,
    rows: list[dict[str, Any]],
    *,
    source: str,
    source_id: int,
) -> int:
    """对每行 insert-if-not-exists；返回新插入条数。"""
    code_display = (subject_code or "").strip()
    code_norm = normalize_qb_code(code_display)
    if not code_norm:
        return 0
    created = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        ref = (row.get("referenced_std_code") or "").strip()
        if not ref:
            continue
        ref_norm = normalize_referenced_std_code(ref)
        if not ref_norm:
            continue
        primary = _primary_from_row(row)
        if not primary:
            continue
        _, was_created = NoveltyReferenceBaselineSnapshot.objects.get_or_create(
            subject_code_norm=code_norm,
            referenced_std_code_norm=ref_norm,
            defaults={
                "subject_code": code_display,
                "referenced_std_code": ref,
                "baseline_latest_std_primary": primary,
                "baseline_source": source,
                "baseline_source_id": source_id,
            },
        )
        if was_created:
            created += 1
    return created


def record_baseline_from_compliance_task(task: ComplianceEvaluationTask) -> int:
    if not task.subject_code or task.current_step < 4:
        return 0
    try:
        from apps.compliance.services.evaluation_flow import get_reference_latest_bundle

        bundle = get_reference_latest_bundle(task.id, request=None)
        refs = bundle.get("references") or []
        return record_baseline_rows(
            task.subject_code,
            refs,
            source=NoveltyReferenceBaselineSnapshot.BaselineSource.COMPLIANCE,
            source_id=task.id,
        )
    except Exception:
        logger.exception("record_baseline_from_compliance_task failed task_id=%s", task.id)
        return 0


def record_baseline_from_batch_item(item: Any) -> int:
    from apps.batch_normative_reference.enterprise_display import enterprise_fields_from_parse_result

    pr = item.parse_result_json if isinstance(item.parse_result_json, dict) else {}
    fields = enterprise_fields_from_parse_result(pr)
    qb = fields.get("qb_code") or ""
    if not qb:
        return 0
    refs = item.reference_resolution_json
    if not isinstance(refs, list):
        return 0
    return record_baseline_rows(
        qb,
        refs,
        source=NoveltyReferenceBaselineSnapshot.BaselineSource.BATCH,
        source_id=item.id,
    )


def get_baseline_map(subject_code: str) -> dict[str, NoveltyReferenceBaselineSnapshot]:
    """key = 规范化 referenced_std_code。"""
    code_norm = normalize_qb_code(subject_code)
    if not code_norm:
        return {}
    qs = NoveltyReferenceBaselineSnapshot.objects.filter(subject_code_norm=code_norm)
    out: dict[str, NoveltyReferenceBaselineSnapshot] = {}
    for snap in qs:
        out[snap.referenced_std_code_norm] = snap
    return out


def baseline_row_for_compare(
    snap: NoveltyReferenceBaselineSnapshot | None,
) -> dict[str, Any] | None:
    if snap is None:
        return None
    return {
        "baseline_latest_std_primary": snap.baseline_latest_std_primary,
        "baseline_source": snap.baseline_source,
        "baseline_recorded_at": snap.baseline_recorded_at.isoformat() if snap.baseline_recorded_at else None,
    }
