"""实时监控：快照表、汇总、全库巡检（分阶段队列 + 进度 + 暂停）。"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from django.db import connection
from django.utils import timezone

from apps.batch_normative_reference.enterprise_display import enterprise_fields_from_parse_result
from apps.batch_normative_reference.models import BatchNormativeReferenceItem
from apps.compliance.db import is_mysql
from apps.compliance.models import ComplianceEvaluationTask
from apps.core import regulation_subject as reg
from apps.novelty.services.qb_code_utils import normalize_qb_code

from apps.alerting.models import WarningMonitorRun, WarningMonitorSnapshot
from apps.alerting.services.forward_warning import build_forward_warning
from apps.alerting.services.monitor_status import (
    ALL_OK,
    NEED_ATTENTION,
    NO_EVAL_RECORD,
    NOT_SCANNED,
    classify_monitor_status,
    is_all_ok_display_status,
    snapshot_should_persist,
)

logger = logging.getLogger(__name__)

STALE_RUN_HOURS = 2
ZOMBIE_RUN_MINUTES = 10
SCAN_START_MARKER = "（准备中）"


class ScanAlreadyRunningError(Exception):
    """已有巡检任务进行中。"""


class ScanControlError(Exception):
    """巡检控制（暂停/继续）失败。"""


def build_evaluated_enterprise_catalog() -> list[dict[str, Any]]:
    by_norm: dict[str, dict[str, Any]] = {}

    def _upsert(code: str | None, subject_name: str | None) -> None:
        s = (code or "").strip()
        if not s:
            return
        norm = normalize_qb_code(s)
        if not norm:
            return
        name = (subject_name or "").strip()
        existing = by_norm.get(norm)
        if existing is None:
            by_norm[norm] = {"subject_code": s, "subject_name": name, "subject_norm": norm}
            return
        if name and not existing.get("subject_name"):
            existing["subject_name"] = name

    for task in ComplianceEvaluationTask.objects.filter(current_step__gte=4).exclude(subject_code="").order_by(
        "-updated_at"
    ):
        pr = task.parse_result_json if isinstance(task.parse_result_json, dict) else {}
        fields = enterprise_fields_from_parse_result(pr)
        _upsert(task.subject_code, fields.get("company_name"))

    for item in BatchNormativeReferenceItem.objects.filter(
        status=BatchNormativeReferenceItem.Status.COMPLETED,
    ).order_by("-updated_at"):
        pr = item.parse_result_json if isinstance(item.parse_result_json, dict) else {}
        fields = enterprise_fields_from_parse_result(pr)
        _upsert(fields.get("qb_code"), fields.get("company_name"))

    return sorted(by_norm.values(), key=lambda row: row["subject_code"])


def build_reference_history_norm_set() -> set[str]:
    norms: set[str] = set()

    if is_mysql():
        with connection.cursor() as c:
            for code in reg.list_enterprise_subject_codes_with_refs(c):
                norm = normalize_qb_code(code)
                if norm:
                    norms.add(norm)

    for item in BatchNormativeReferenceItem.objects.filter(
        status=BatchNormativeReferenceItem.Status.COMPLETED,
    ).only("parse_result_json", "reference_resolution_json"):
        refs = item.reference_resolution_json
        if not isinstance(refs, list) or not refs:
            continue
        pr = item.parse_result_json if isinstance(item.parse_result_json, dict) else {}
        qb = enterprise_fields_from_parse_result(pr).get("qb_code")
        norm = normalize_qb_code(qb)
        if norm:
            norms.add(norm)

    if is_mysql():
        for task in ComplianceEvaluationTask.objects.filter(current_step__gte=4).exclude(subject_code=""):
            norm = normalize_qb_code(task.subject_code)
            if not norm or norm in norms:
                continue
            try:
                from apps.compliance.services.evaluation_flow import get_reference_latest_bundle

                bundle = get_reference_latest_bundle(task.id, request=None)
                refs = bundle.get("references") if isinstance(bundle, dict) else None
                if isinstance(refs, list) and refs:
                    norms.add(norm)
            except Exception:
                logger.debug("reference bundle unavailable task_id=%s", task.id, exc_info=True)

    return norms


def purge_empty_history_snapshots() -> int:
    deleted, _ = WarningMonitorSnapshot.objects.filter(task_conclusion="empty_history").delete()
    return deleted


def list_evaluated_subject_codes() -> list[str]:
    return [row["subject_code"] for row in build_evaluated_enterprise_catalog()]


def abandon_stale_running_runs(*, max_age_hours: int = STALE_RUN_HOURS) -> int:
    """将超时仍为 running 的批次标为 failed，避免阻塞新巡检。"""
    cutoff = timezone.now() - timedelta(hours=max_age_hours)
    return WarningMonitorRun.objects.filter(
        status=WarningMonitorRun.Status.RUNNING,
        started_at__lt=cutoff,
    ).update(status=WarningMonitorRun.Status.FAILED, finished_at=timezone.now())


def abandon_zombie_runs(*, max_age_minutes: int = ZOMBIE_RUN_MINUTES) -> int:
    """
    从未写入进度的 running 任务（多为 Celery 未执行）：processed_count=0 且超过 max_age_minutes。
    """
    cutoff = timezone.now() - timedelta(minutes=max_age_minutes)
    qs = WarningMonitorRun.objects.filter(
        status=WarningMonitorRun.Status.RUNNING,
        processed_count=0,
        started_at__lt=cutoff,
    )
    count = qs.count()
    if count:
        logger.warning("abandon %s zombie monitor run(s) with no worker progress", count)
    return qs.update(status=WarningMonitorRun.Status.FAILED, finished_at=timezone.now())


def reconcile_stuck_monitor_runs() -> None:
    """summary / 启动巡检前：清理超时与僵尸批次。"""
    abandon_stale_running_runs()
    abandon_zombie_runs()


def has_active_scan() -> bool:
    reconcile_stuck_monitor_runs()
    return WarningMonitorRun.objects.filter(
        status__in=[WarningMonitorRun.Status.RUNNING, WarningMonitorRun.Status.PAUSED],
    ).exists()


def has_running_scan() -> bool:
    """兼容旧调用。"""
    return has_active_scan()


def _snapshot_map() -> dict[str, WarningMonitorSnapshot]:
    out: dict[str, WarningMonitorSnapshot] = {}
    for snap in WarningMonitorSnapshot.objects.exclude(task_conclusion="empty_history"):
        norm = normalize_qb_code(snap.subject_code)
        if norm:
            out[norm] = snap
    return out


def _build_monitor_rows() -> list[dict[str, Any]]:
    catalog = build_evaluated_enterprise_catalog()
    snaps = _snapshot_map()
    ref_norms = build_reference_history_norm_set()
    rows: list[dict[str, Any]] = []

    for ent in catalog:
        norm = ent.get("subject_norm") or normalize_qb_code(ent["subject_code"])
        snap = snaps.get(norm) if norm else None
        has_refs = bool(norm and norm in ref_norms)
        task_conclusion, task_summary = classify_monitor_status(has_reference_history=has_refs, snap=snap)
        rows.append(
            {
                "subject_code": snap.subject_code if snap is not None else ent["subject_code"],
                "subject_name": (snap.subject_name if snap else None) or ent.get("subject_name") or "",
                "task_conclusion": task_conclusion,
                "task_summary": task_summary,
                "last_checked_at": snap.last_checked_at.isoformat() if snap and snap.last_checked_at else None,
            }
        )
    return rows


def _count_summary_categories(rows: list[dict[str, Any]]) -> dict[str, int]:
    need = ok = no_eval = not_scanned = 0
    for row in rows:
        tc = row.get("task_conclusion")
        if tc == NEED_ATTENTION:
            need += 1
        elif is_all_ok_display_status(tc):
            ok += 1
        elif tc == NO_EVAL_RECORD:
            no_eval += 1
        elif tc == NOT_SCANNED:
            not_scanned += 1
    return {
        "need_attention_count": need,
        "all_ok_count": ok,
        "no_eval_record_count": no_eval,
        "not_scanned_count": not_scanned,
    }


def build_scan_queue() -> list[dict[str, str]]:
    """
    巡检队列：阶段 1 尚未巡检 → 阶段 2 状态良好（all_ok/partial）。
    无评价记录、需更新等不在本轮队列中。
    """
    rows = _build_monitor_rows()
    phase_not_scanned: list[dict[str, str]] = []
    phase_all_ok: list[dict[str, str]] = []

    for row in rows:
        code = row["subject_code"]
        tc = row.get("task_conclusion")
        if tc == NOT_SCANNED:
            phase_not_scanned.append(
                {"subject_code": code, "phase": WarningMonitorRun.ScanPhase.NOT_SCANNED},
            )
        elif is_all_ok_display_status(tc):
            phase_all_ok.append(
                {"subject_code": code, "phase": WarningMonitorRun.ScanPhase.ALL_OK},
            )

    return phase_not_scanned + phase_all_ok


def upsert_snapshot_from_forward(subject_code: str, payload: dict[str, Any]) -> WarningMonitorSnapshot | None:
    code_key = (payload.get("subject_code") or subject_code or "").strip()
    if not snapshot_should_persist(payload):
        if code_key:
            WarningMonitorSnapshot.objects.filter(subject_code=code_key).delete()
        norm = normalize_qb_code(code_key)
        if norm and norm != normalize_qb_code(subject_code):
            WarningMonitorSnapshot.objects.filter(subject_code=subject_code).delete()
        return None

    now = timezone.now()
    obj, _ = WarningMonitorSnapshot.objects.update_or_create(
        subject_code=code_key or subject_code,
        catalog_std_type_no=None,
        defaults={
            "subject_name": payload.get("subject_name") or "",
            "task_conclusion": payload.get("task_conclusion") or "",
            "task_summary": payload.get("task_summary") or "",
            "last_checked_at": now,
            "compare_rows_json": payload.get("compare_rows") or [],
        },
    )
    return obj


def _scan_one_subject(code: str) -> tuple[bool, str | None]:
    """处理单企标。返回 (是否计入 processed, 结论码或 None)。"""
    try:
        payload = build_forward_warning(code)
        if not snapshot_should_persist(payload):
            WarningMonitorSnapshot.objects.filter(subject_code=code).delete()
            return False, None
        upsert_snapshot_from_forward(code, payload)
        return True, payload.get("task_conclusion")
    except Exception:
        logger.warning("monitor scan failed subject_code=%s", code, exc_info=True)
        return False, None


def build_active_scan_payload() -> dict[str, Any] | None:
    reconcile_stuck_monitor_runs()
    run = (
        WarningMonitorRun.objects.filter(
            status__in=[WarningMonitorRun.Status.RUNNING, WarningMonitorRun.Status.PAUSED],
        )
        .order_by("-id")
        .first()
    )
    if run is None:
        return None

    live = _count_summary_categories(_build_monitor_rows())
    return {
        "job_id": str(run.id),
        "status": run.status,
        "processed_count": run.processed_count,
        "total_count": run.total_evaluated,
        "current_subject_code": (run.current_subject_code or "").strip() or None,
        "phase": run.scan_phase if run.scan_phase != WarningMonitorRun.ScanPhase.IDLE else None,
        "pause_requested": run.pause_requested,
        "not_scanned_count": live["not_scanned_count"],
        "need_attention_count": live["need_attention_count"],
        "all_ok_count": live["all_ok_count"],
        "no_eval_record_count": live["no_eval_record_count"],
    }


def get_monitor_summary() -> dict[str, Any]:
    rows = _build_monitor_rows()
    counts = _count_summary_categories(rows)
    total = len(rows)

    last_run = (
        WarningMonitorRun.objects.filter(status=WarningMonitorRun.Status.COMPLETED).order_by("-finished_at").first()
    )

    out: dict[str, Any] = {
        "last_scan_at": last_run.finished_at.isoformat() if last_run and last_run.finished_at else None,
        "total_evaluated": total,
        **counts,
        "pending_count": counts["not_scanned_count"],
    }
    active = build_active_scan_payload()
    if active is not None:
        out["active_scan"] = active
    return out


def list_monitor_enterprises(
    *,
    page: int = 1,
    page_size: int = 10,
    keyword: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    rows = _build_monitor_rows()

    if keyword and keyword.strip():
        kw = keyword.strip().lower()
        rows = [
            r
            for r in rows
            if kw in (r.get("subject_code") or "").lower() or kw in (r.get("subject_name") or "").lower()
        ]

    st = (status or "all").strip().lower()
    if st == NEED_ATTENTION:
        rows = [r for r in rows if r.get("task_conclusion") == NEED_ATTENTION]
    elif st == ALL_OK:
        rows = [r for r in rows if is_all_ok_display_status(r.get("task_conclusion"))]
    elif st == NOT_SCANNED:
        rows = [r for r in rows if r.get("task_conclusion") == NOT_SCANNED]
    elif st == NO_EVAL_RECORD:
        rows = [r for r in rows if r.get("task_conclusion") == NO_EVAL_RECORD]

    total = len(rows)
    start = (page - 1) * page_size
    items = rows[start : start + page_size]
    return {"items": items, "total": total}


def _should_pause_run(run: WarningMonitorRun) -> bool:
    run.refresh_from_db(fields=["pause_requested", "status"])
    return bool(run.pause_requested) or run.status == WarningMonitorRun.Status.PAUSED


def _pause_run(run: WarningMonitorRun) -> None:
    run.status = WarningMonitorRun.Status.PAUSED
    run.pause_requested = False
    run.save(
        update_fields=[
            "status",
            "pause_requested",
            "processed_count",
            "current_subject_code",
            "scan_phase",
        ],
    )


def execute_monitor_run(run_id: int) -> str:
    run = WarningMonitorRun.objects.filter(pk=run_id).first()
    if run is None:
        return "missing_run"

    run.refresh_from_db()
    if run.status == WarningMonitorRun.Status.PAUSED:
        return f"paused processed={run.processed_count}"

    purge_empty_history_snapshots()

    queue: list[dict[str, str]] = run.queue_json if isinstance(run.queue_json, list) and run.queue_json else []
    if not queue:
        queue = build_scan_queue()
        run.queue_json = queue
        run.total_evaluated = len(queue)
        run.save(update_fields=["queue_json", "total_evaluated"])

    start_idx = run.processed_count
    if queue and start_idx < len(queue):
        first = queue[start_idx]
        run.current_subject_code = SCAN_START_MARKER
        run.scan_phase = first.get("phase") or WarningMonitorRun.ScanPhase.NOT_SCANNED
    else:
        run.current_subject_code = ""
        run.scan_phase = WarningMonitorRun.ScanPhase.IDLE
    run.save(update_fields=["current_subject_code", "scan_phase"])

    need = 0
    ok = 0
    failed = 0

    for item in queue[start_idx:]:
        if _should_pause_run(run):
            _pause_run(run)
            return f"paused processed={run.processed_count}"

        code = item.get("subject_code") or item.get("qb_code") or ""
        phase = item.get("phase") or WarningMonitorRun.ScanPhase.IDLE
        run.current_subject_code = code
        run.scan_phase = phase
        run.save(update_fields=["current_subject_code", "scan_phase"])

        processed_ok, tc = _scan_one_subject(code)
        run.processed_count += 1
        if processed_ok:
            if tc == NEED_ATTENTION:
                need += 1
            elif is_all_ok_display_status(tc):
                ok += 1
        else:
            failed += 1
        run.save(update_fields=["processed_count"])

    run.finished_at = timezone.now()
    run.need_attention_count = need
    run.all_ok_count = ok
    run.pending_count = failed
    run.status = WarningMonitorRun.Status.COMPLETED
    run.scan_phase = WarningMonitorRun.ScanPhase.IDLE
    run.current_subject_code = ""
    run.pause_requested = False
    run.save()

    return f"ok processed={run.processed_count}"


def start_full_scan() -> dict[str, Any]:
    reconcile_stuck_monitor_runs()
    if has_active_scan():
        raise ScanAlreadyRunningError("已有巡检任务进行中，请稍后再试")

    queue = build_scan_queue()
    run = WarningMonitorRun.objects.create(
        status=WarningMonitorRun.Status.RUNNING,
        total_evaluated=len(queue),
        processed_count=0,
        queue_json=queue,
        scan_phase=WarningMonitorRun.ScanPhase.NOT_SCANNED if queue else WarningMonitorRun.ScanPhase.IDLE,
    )

    from apps.alerting.tasks import process_warning_monitor_run

    process_warning_monitor_run.delay(run.id)

    return {
        "success": True,
        "message": "全库巡检已启动",
        "job_id": str(run.id),
        "processed_count": 0,
        "total_count": len(queue),
    }


def request_pause_scan(job_id: int) -> dict[str, Any]:
    run = WarningMonitorRun.objects.filter(pk=job_id).first()
    if run is None:
        raise ScanControlError("巡检任务不存在")
    if run.status != WarningMonitorRun.Status.RUNNING:
        raise ScanControlError("仅进行中的巡检可暂停")
    if run.processed_count == 0:
        run.status = WarningMonitorRun.Status.PAUSED
        run.pause_requested = False
        run.save(update_fields=["status", "pause_requested"])
        return {
            "success": True,
            "message": "巡检已暂停",
            "job_id": str(run.id),
        }
    run.pause_requested = True
    run.save(update_fields=["pause_requested"])
    return {
        "success": True,
        "message": "暂停请求已提交，将在当前企标处理完成后暂停",
        "job_id": str(run.id),
    }


def resume_scan(job_id: int) -> dict[str, Any]:
    run = WarningMonitorRun.objects.filter(pk=job_id).first()
    if run is None:
        raise ScanControlError("巡检任务不存在")
    if run.status != WarningMonitorRun.Status.PAUSED:
        raise ScanControlError("仅已暂停的巡检可继续")
    if not isinstance(run.queue_json, list) or not run.queue_json:
        raise ScanControlError("巡检队列已丢失，请重新发起巡检")

    run.pause_requested = False
    run.status = WarningMonitorRun.Status.RUNNING
    run.save(update_fields=["pause_requested", "status"])

    from apps.alerting.tasks import process_warning_monitor_run

    process_warning_monitor_run.delay(run.id)

    return {
        "success": True,
        "message": "巡检已继续",
        "job_id": str(run.id),
        "processed_count": run.processed_count,
        "total_count": run.total_evaluated,
    }


def run_full_scan(*, sync: bool = False) -> dict[str, Any]:
    if not sync:
        return start_full_scan()

    reconcile_stuck_monitor_runs()
    if has_active_scan():
        raise ScanAlreadyRunningError("已有巡检任务进行中，请稍后再试")

    queue = build_scan_queue()
    run = WarningMonitorRun.objects.create(
        status=WarningMonitorRun.Status.RUNNING,
        total_evaluated=len(queue),
        processed_count=0,
        queue_json=queue,
    )
    result_msg = execute_monitor_run(run.id)
    run.refresh_from_db()
    processed = run.processed_count
    if result_msg.startswith("ok processed="):
        try:
            processed = int(result_msg.split("=", 1)[1])
        except ValueError:
            processed = run.processed_count

    return {
        "success": True,
        "message": "全库巡检已完成",
        "job_id": str(run.id),
        "processed_count": processed,
        "total_count": len(queue),
    }
