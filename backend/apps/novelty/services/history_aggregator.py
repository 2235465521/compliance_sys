"""按企标号汇聚合规评价与批量规范性引用历史。"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone as dt_timezone
from typing import Any

from django.db import connection
from django.utils import timezone

from apps.batch_normative_reference.enterprise_display import enterprise_fields_from_parse_result
from apps.batch_normative_reference.models import BatchNormativeReferenceItem
from apps.compliance.db import is_mysql
from apps.compliance.models import ComplianceEvaluationTask
from apps.core import regulation_subject as reg
from apps.novelty.services.qb_code_utils import normalize_qb_code, normalize_referenced_std_code, qb_codes_match
from apps.standards.services.reference_bundle import attach_normative_reference_std_names, normative_reference_row_core
from apps.standards.services.reference_resolution import resolve_reference_for_parse_context


@dataclass
class AggregatedHistory:
    qb_code: str
    references: list[dict[str, Any]] = field(default_factory=list)
    reference_sheet_rows: list[dict[str, Any]] = field(default_factory=list)
    eval_reference_rows: list[dict[str, Any]] = field(default_factory=list)
    full_std_by_ref_norm: dict[str, str | None] = field(default_factory=dict)
    indicators: dict[str, Any] = field(default_factory=dict)
    source_evaluations: list[dict[str, Any]] = field(default_factory=list)


def _parse_dt(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val if timezone.is_aware(val) else timezone.make_aware(val)
    return timezone.now()


def _merge_ref_entry(
    merged: dict[str, dict[str, Any]],
    ref_code: str,
    *,
    full_std: str | None,
    std_name: str | None,
    tech_fragment: str | None,
    at: datetime,
    eval_latest_std_primary: str | None = None,
    compliance_assessable: bool | None = None,
    resolution_path: str | None = None,
    explanation: str | None = None,
) -> None:
    ref_norm = normalize_referenced_std_code(ref_code)
    if not ref_norm:
        return
    display_ref = ref_code.strip()
    existing = merged.get(ref_norm)
    if existing is None:
        merged[ref_norm] = {
            "referenced_std_code": display_ref,
            "full_std_at_publication": full_std,
            "eval_latest_std_primary": eval_latest_std_primary,
            "compliance_assessable": compliance_assessable,
            "resolution_path": resolution_path,
            "explanation": explanation,
            "std_name": std_name,
            "tech_fragment": tech_fragment,
            "_at": at,
        }
        return
    if at >= existing.get("_at", at):
        if full_std:
            existing["full_std_at_publication"] = full_std
        if eval_latest_std_primary:
            existing["eval_latest_std_primary"] = eval_latest_std_primary
        if compliance_assessable is not None:
            existing["compliance_assessable"] = compliance_assessable
        if resolution_path:
            existing["resolution_path"] = resolution_path
        if explanation:
            existing["explanation"] = explanation
        existing["_at"] = at
    elif full_std and existing.get("full_std_at_publication") is None:
        existing["full_std_at_publication"] = full_std
    if std_name and not existing.get("std_name"):
        existing["std_name"] = std_name
    if tech_fragment and not existing.get("tech_fragment"):
        existing["tech_fragment"] = tech_fragment
    if eval_latest_std_primary and not existing.get("eval_latest_std_primary"):
        existing["eval_latest_std_primary"] = eval_latest_std_primary
    if compliance_assessable is not None and existing.get("compliance_assessable") is None:
        existing["compliance_assessable"] = compliance_assessable
    if resolution_path and not existing.get("resolution_path"):
        existing["resolution_path"] = resolution_path
    if explanation and not existing.get("explanation"):
        existing["explanation"] = explanation


def _merge_eval_bundle_row(
    merged: dict[str, dict[str, Any]],
    row: dict[str, Any],
    *,
    at: datetime,
) -> None:
    if not isinstance(row, dict):
        return
    latest = row.get("latest_std_primary")
    if latest is not None and not str(latest).strip():
        latest = None
    _merge_ref_entry(
        merged,
        row.get("referenced_std_code") or "",
        full_std=row.get("full_std_at_publication"),
        std_name=row.get("latest_std_name") or row.get("full_std_name_at_publication"),
        tech_fragment=None,
        at=at,
        eval_latest_std_primary=str(latest).strip() if latest else None,
        compliance_assessable=row.get("compliance_assessable"),
        resolution_path=row.get("resolution_path"),
        explanation=row.get("explanation"),
    )


def _compliance_tasks_for_qb(qb_code: str) -> list[ComplianceEvaluationTask]:
    norm = normalize_qb_code(qb_code)
    if not norm:
        return []
    tasks = list(
        ComplianceEvaluationTask.objects.filter(current_step__gte=4)
        .exclude(subject_code__isnull=True)
        .exclude(subject_code="")
        .order_by("-updated_at")
    )
    return [t for t in tasks if qb_codes_match(t.subject_code, qb_code)]


def _batch_items_for_qb(qb_code: str) -> list[BatchNormativeReferenceItem]:
    items = list(
        BatchNormativeReferenceItem.objects.filter(
            status=BatchNormativeReferenceItem.Status.COMPLETED,
        )
        .select_related("job")
        .order_by("-updated_at")
    )
    out: list[BatchNormativeReferenceItem] = []
    for it in items:
        pr = it.parse_result_json if isinstance(it.parse_result_json, dict) else {}
        fields = enterprise_fields_from_parse_result(pr)
        if qb_codes_match(fields.get("qb_code"), qb_code):
            out.append(it)
    return out


def _refs_from_compliance_mapping(
    qb_code: str,
    *,
    pr: dict[str, Any] | None = None,
    fallback_year: int | None = None,
) -> list[dict[str, Any]]:
    if not is_mysql():
        return []
    qb = (qb_code or "").strip()
    if not qb:
        return []
    fy = fallback_year if fallback_year is not None else datetime.now().year
    with connection.cursor() as c:
        refs = reg.list_referenced_std_codes_for_subject(c, qb)
    out: list[dict[str, Any]] = []
    for ref in refs:
        raw = resolve_reference_for_parse_context(
            ref, pr=pr or {}, qb_code=qb_code, fallback_year=fy
        )
        out.append(normative_reference_row_core(raw))
    attach_normative_reference_std_names(out)
    return out


def _mapping_ref_codes_only(qb_code: str) -> list[str]:
    """合规映射表：仅原文引用号，不做现场谱系解析（预警/查新专用表由上层读评价结果）。"""
    if not is_mysql():
        return []
    qb = (qb_code or "").strip()
    if not qb:
        return []
    with connection.cursor() as c:
        return reg.list_referenced_std_codes_for_subject(c, qb)


def _enterprise_indicators_from_parse(pr: dict[str, Any] | None, source: str, source_id: int) -> list[dict]:
    if not isinstance(pr, dict):
        return []
    inds = pr.get("indicators")
    if not isinstance(inds, list):
        return []
    out = []
    for item in inds:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item.get("indicator_name") or ""
        value = item.get("value") or item.get("indicator_value") or ""
        if not str(name).strip():
            continue
        out.append(
            {
                "name": str(name).strip(),
                "value": str(value).strip() if value is not None else "",
                "source": source,
                "source_id": source_id,
            }
        )
    return out


def _national_from_bundle(bundle: dict[str, Any] | None) -> dict[str, list[dict[str, Any]]]:
    if not isinstance(bundle, dict):
        return {}
    raw = bundle.get("national_by_std_code")
    if not isinstance(raw, dict):
        return {}
    return dict(raw)


def find_history_for_qb_code(qb_code: str) -> AggregatedHistory | None:
    qb_display = (qb_code or "").strip()
    if not qb_display:
        return None

    compliance_tasks = _compliance_tasks_for_qb(qb_display)
    batch_items = _batch_items_for_qb(qb_display)
    if not compliance_tasks and not batch_items:
        return None

    parse_ctx: dict[str, Any] = {}
    fallback_year = datetime.now().year
    if compliance_tasks:
        latest = compliance_tasks[0]
        if isinstance(latest.parse_result_json, dict):
            parse_ctx = latest.parse_result_json
        fallback_year = latest.created_at.year
    elif batch_items:
        pr0 = batch_items[0].parse_result_json
        if isinstance(pr0, dict):
            parse_ctx = pr0
        fallback_year = _parse_dt(batch_items[0].updated_at).year

    merged_refs: dict[str, dict[str, Any]] = {}
    source_evaluations: list[dict[str, Any]] = []
    enterprise_indicators: list[dict[str, Any]] = []
    national_by_std: dict[str, list[dict[str, Any]]] = {}

    for task in compliance_tasks:
        at = _parse_dt(task.updated_at)
        source_evaluations.append(
            {
                "source_type": "compliance",
                "source_id": task.id,
                "evaluated_at": at.isoformat(),
                "title": f"合规评价任务 #{task.id}",
            }
        )
        enterprise_indicators.extend(
            _enterprise_indicators_from_parse(task.parse_result_json, "compliance", task.id)
        )
        bundle = task.indicator_bundle_json if isinstance(task.indicator_bundle_json, dict) else {}
        for code, rows in _national_from_bundle(bundle).items():
            if code not in national_by_std:
                national_by_std[code] = list(rows) if isinstance(rows, list) else []

    mapping_epoch = datetime(1970, 1, 1, tzinfo=dt_timezone.utc)
    mapping_refs = _refs_from_compliance_mapping(
        qb_display, pr=parse_ctx, fallback_year=fallback_year
    )
    for row in mapping_refs:
        _merge_eval_bundle_row(merged_refs, row, at=mapping_epoch)
    mapping_codes = _mapping_ref_codes_only(qb_display)
    for ref in mapping_codes:
        _merge_ref_entry(
            merged_refs,
            ref,
            full_std=None,
            std_name=None,
            tech_fragment=None,
            at=mapping_epoch,
        )

    for task in compliance_tasks:
        at = _parse_dt(task.updated_at)
        if not is_mysql():
            continue
        try:
            from apps.compliance.services.evaluation_flow import get_reference_latest_bundle

            bundle = get_reference_latest_bundle(task.id, request=None)
            for row in bundle.get("references") or []:
                _merge_eval_bundle_row(merged_refs, row, at=at)
        except Exception:
            pass

    for it in batch_items:
        at = _parse_dt(it.updated_at)
        source_evaluations.append(
            {
                "source_type": "batch",
                "source_id": it.id,
                "evaluated_at": at.isoformat(),
                "title": f"批量规范性引用子项 #{it.id}",
            }
        )
        pr = it.parse_result_json if isinstance(it.parse_result_json, dict) else {}
        enterprise_indicators.extend(_enterprise_indicators_from_parse(pr, "batch", it.id))
        refs = it.reference_resolution_json
        if not isinstance(refs, list):
            continue
        for row in refs:
            _merge_eval_bundle_row(merged_refs, row, at=at)

    if not merged_refs and not mapping_codes:
        return None

    references: list[dict[str, Any]] = []
    full_std_by_ref: dict[str, str | None] = {}
    sheet_rows: list[dict[str, Any]] = []
    eval_reference_rows: list[dict[str, Any]] = []
    for idx, (ref_norm, meta) in enumerate(sorted(merged_refs.items(), key=lambda x: x[1].get("referenced_std_code", ""))):
        row_id = str(idx + 1)
        ref_display = meta.get("referenced_std_code") or ref_norm
        full_std = meta.get("full_std_at_publication")
        full_std_by_ref[ref_norm] = full_std
        references.append(
            {
                "referenced_std_code": ref_display,
                "full_std_at_publication": full_std,
            }
        )
        sheet_rows.append(
            {
                "id": row_id,
                "std_no": ref_display,
                "std_name": meta.get("std_name") or "",
                "tech_fragment": meta.get("tech_fragment"),
                "remark": "",
                "full_std_at_publication": full_std,
            }
        )
        eval_reference_rows.append(
            {
                "id": row_id,
                "referenced_std_code": ref_display,
                "full_std_at_publication": full_std,
                "eval_latest_std_primary": meta.get("eval_latest_std_primary"),
                "compliance_assessable": meta.get("compliance_assessable"),
                "resolution_path": meta.get("resolution_path"),
                "explanation": meta.get("explanation"),
                "std_name": meta.get("std_name") or "",
            }
        )

    indicators = {
        "enterprise_indicators": enterprise_indicators,
        "national_by_std_code": national_by_std,
        "source_evaluations": source_evaluations,
    }

    return AggregatedHistory(
        qb_code=qb_display,
        references=references,
        reference_sheet_rows=sheet_rows,
        eval_reference_rows=eval_reference_rows,
        full_std_by_ref_norm=full_std_by_ref,
        indicators=indicators,
        source_evaluations=source_evaluations,
    )
