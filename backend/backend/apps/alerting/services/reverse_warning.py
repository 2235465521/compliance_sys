"""反向预警：国标查新 + 关联企标更替判定。"""

from __future__ import annotations

from typing import Any

from django.db import connection

from apps.batch_normative_reference.enterprise_display import enterprise_fields_from_parse_result
from apps.batch_normative_reference.models import BatchNormativeReferenceItem
from apps.compliance.db import is_mysql, require_mysql
from apps.compliance.models import ComplianceEvaluationTask
from apps.core import regulation_subject as reg
from apps.novelty.services.qb_code_utils import normalize_qb_code, normalize_referenced_std_code, qb_codes_match
from apps.standards.services.reference_bundle import normalize_std_code_for_citation_match
from apps.standards.services.reference_resolution import resolve_latest_for_code

from apps.alerting.services.forward_warning import build_forward_warning


def _std_matches_query(field_value: str | None, query_norm: str) -> bool:
    if not field_value or not query_norm:
        return False
    return normalize_std_code_for_citation_match(field_value) == query_norm


def _row_matches_gb(row: dict[str, Any], query_norm: str) -> bool:
    for key in (
        "referenced_std_code",
        "full_std_at_publication",
        "baseline_latest_std",
        "current_latest_std",
    ):
        if _std_matches_query(row.get(key), query_norm):
            return True
    return False


def _gb_status_label(gb_updated: bool, input_bz: str, latest_bz: str) -> str:
    if not gb_updated:
        return "无变化"
    if normalize_std_code_for_citation_match(input_bz) != normalize_std_code_for_citation_match(latest_bz):
        return "已更新"
    return "无变化"


def _fetch_std_status(std_code: str) -> str | None:
    if not is_mysql():
        return None
    code = (std_code or "").strip()
    if not code:
        return None
    with connection.cursor() as c:
        c.execute(
            "SELECT std_status FROM national_standard_basic WHERE std_code = %s LIMIT 1",
            [code],
        )
        row = c.fetchone()
    if not row or row[0] is None:
        return None
    return str(row[0]).strip() or None


def find_enterprises_referencing_std(bz_id: str) -> list[dict[str, Any]]:
    """检索引用过该国标（规范化匹配）的企标列表。"""
    require_mysql()
    query_norm = normalize_referenced_std_code(bz_id)
    if not query_norm:
        return []

    found: dict[str, dict[str, Any]] = {}

    def _add(code: str | None, subject_name: str | None) -> None:
        code_s = (code or "").strip()
        if not code_s:
            return
        norm = normalize_qb_code(code_s)
        if not norm:
            return
        if norm not in found:
            found[norm] = {"subject_code": code_s, "subject_name": subject_name}

    if is_mysql():
        with connection.cursor() as c:
            for subject_code in reg.list_enterprise_subject_codes_with_refs(c):
                for ref in reg.list_referenced_std_codes_for_subject(c, subject_code):
                    if _std_matches_query(ref, query_norm):
                        _add(subject_code, None)
                        break

    for task in ComplianceEvaluationTask.objects.filter(current_step__gte=4).order_by("-updated_at"):
        qb = (task.subject_code or "").strip()
        if not qb:
            continue
        pr = task.parse_result_json if isinstance(task.parse_result_json, dict) else {}
        fields = enterprise_fields_from_parse_result(pr)
        name = fields.get("company_name")
        codes = pr.get("referenced_std_codes") or []
        matched = any(_std_matches_query(str(c), query_norm) for c in codes if c)
        if not matched and is_mysql():
            try:
                from apps.compliance.services.evaluation_flow import get_reference_latest_bundle

                bundle = get_reference_latest_bundle(task.id, request=None)
                for row in bundle.get("references") or []:
                    if isinstance(row, dict) and _std_matches_query(row.get("referenced_std_code"), query_norm):
                        matched = True
                        break
            except Exception:
                pass
        if matched:
            _add(qb, name)

    for item in BatchNormativeReferenceItem.objects.filter(
        status=BatchNormativeReferenceItem.Status.COMPLETED,
    ).order_by("-updated_at"):
        pr = item.parse_result_json if isinstance(item.parse_result_json, dict) else {}
        fields = enterprise_fields_from_parse_result(pr)
        qb = fields.get("qb_code")
        name = fields.get("company_name")
        refs = item.reference_resolution_json
        if not isinstance(refs, list):
            continue
        for row in refs:
            if not isinstance(row, dict):
                continue
            ref = row.get("referenced_std_code")
            full = row.get("full_std_at_publication")
            latest = row.get("latest_std_primary") or row.get("current_latest_id")
            if (
                _std_matches_query(ref, query_norm)
                or _std_matches_query(full, query_norm)
                or _std_matches_query(latest, query_norm)
            ):
                _add(qb, name)
                break

    return list(found.values())


def build_reverse_warning(bz_id: str) -> dict[str, Any]:
    require_mysql()
    input_bz = (bz_id or "").strip()
    if not input_bz:
        return {
            "task_conclusion": "empty_history",
            "task_summary": "缺少国标标准号",
            "gb_novelty": {
                "input_bz": "",
                "latest_bz": "",
                "gb_updated": False,
                "status_label": "无变化",
            },
            "affected_enterprises": [],
        }

    resolved = resolve_latest_for_code(input_bz)
    latest_bz = (resolved.get("current_latest_id") or input_bz).strip()
    query_norm = normalize_std_code_for_citation_match(input_bz)
    latest_norm = normalize_std_code_for_citation_match(latest_bz)
    gb_updated = bool(latest_norm and query_norm and latest_norm != query_norm)
    status = _fetch_std_status(latest_bz)
    status_label = status if status and ("废止" in status or "实施" in status) else _gb_status_label(gb_updated, input_bz, latest_bz)

    gb_novelty = {
        "input_bz": input_bz,
        "latest_bz": latest_bz,
        "gb_updated": gb_updated,
        "status_label": status_label,
    }

    enterprises = find_enterprises_referencing_std(input_bz)
    affected: list[dict[str, Any]] = []

    for ent in enterprises:
        qb = ent["subject_code"]
        name = ent.get("subject_name") or _subject_name_from_forward(qb)
        need_modify = False
        summary = "引用链路与现行国标一致"
        conclusion_label = "暂不需修改"

        if gb_updated:
            fwd = build_forward_warning(qb)
            matching = [r for r in fwd.get("compare_rows") or [] if _row_matches_gb(r, query_norm)]
            if any(r.get("row_conclusion") == "updated" for r in matching):
                need_modify = True
                summary = f"上次评价记录为 {input_bz}，本次查新为 {latest_bz}"
                conclusion_label = "需修改企标"
            elif matching:
                summary = "引用链路与现行国标一致"
            else:
                fwd_updated = any(r.get("row_conclusion") == "updated" for r in fwd.get("compare_rows") or [])
                if fwd_updated:
                    need_modify = True
                    summary = f"企标存在其他引用标准更新，建议核对"
                    conclusion_label = "需修改企标"

        affected.append(
            {
                "subject_code": qb,
                "subject_name": name or "",
                "enterprise_need_modify": need_modify,
                "enterprise_conclusion_label": conclusion_label,
                "summary": summary,
            }
        )

    if not gb_updated:
        task_conclusion = "all_ok"
        task_summary = "该国标无更新，关联企标暂不需修改"
    elif any(e.get("enterprise_need_modify") for e in affected):
        cnt = sum(1 for e in affected if e.get("enterprise_need_modify"))
        task_conclusion = "need_attention"
        task_summary = f"国标已更新，{cnt} 个关联企标需修改"
    else:
        task_conclusion = "all_ok"
        task_summary = "国标已更新，关联企标引用链路暂不需修改"

    if not affected:
        task_summary = "未找到引用该国标的企标评价记录"

    return {
        "task_conclusion": task_conclusion,
        "task_summary": task_summary,
        "gb_novelty": gb_novelty,
        "affected_enterprises": affected,
    }


def _subject_name_from_forward(subject_code: str) -> str | None:
    try:
        fwd = build_forward_warning(subject_code)
        return fwd.get("subject_name")
    except Exception:
        return None
