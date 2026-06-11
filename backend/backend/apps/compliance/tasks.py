"""合规评价长流程异步步骤（阶段 8：接入 Celery + 真实 Dify）。"""

from __future__ import annotations

from pathlib import Path

from celery import shared_task
from django.apps import apps


@shared_task(name="compliance.parse_enterprise_standard_async")
def parse_enterprise_standard_async(task_id: int) -> int:
    """
    异步执行 Dify 工作流 ①：将 `parse_status` 置为 running → 调用与同步 API 相同的解析逻辑 →
    completed / failed 并写回 `parse_result_json` / `parse_error`。
    """
    Task = apps.get_model("compliance", "ComplianceEvaluationTask")
    def _task_gone() -> bool:
        return not Task.objects.filter(pk=task_id).exists()

    task = Task.objects.filter(pk=task_id).first()
    if not task:
        return task_id

    task.parse_status = "running"
    task.parse_error = None
    task.save(update_fields=["parse_status", "parse_error", "updated_at"])

    path = task.uploaded_file_path
    name = task.uploaded_file_name or ""
    if not path:
        task.parse_status = "failed"
        task.parse_error = "缺少 uploaded_file_path"
        task.save(update_fields=["parse_status", "parse_error", "updated_at"])
        return task_id

    dest = Path(str(path))
    if not dest.is_file():
        task.parse_status = "failed"
        task.parse_error = f"上传文件不存在: {dest}"
        task.save(update_fields=["parse_status", "parse_error", "updated_at"])
        return task_id

    from apps.compliance.services.parse_service import workflow1_parse_uploaded_file
    from apps.engine.dify_client import DifyApiError

    try:
        parse_dict, meta = workflow1_parse_uploaded_file(dest, name or dest.name, task.id)
    except DifyApiError as e:
        if _task_gone():
            return task_id
        task.parse_status = "failed"
        task.parse_error = str(e)[:2000]
        task.save(update_fields=["parse_status", "parse_error", "updated_at"])
        return task_id
    except Exception as e:  # noqa: BLE001 — Celery 内统一落库失败态
        if _task_gone():
            return task_id
        task.parse_status = "failed"
        task.parse_error = str(e)[:2000]
        task.save(update_fields=["parse_status", "parse_error", "updated_at"])
        return task_id

    if _task_gone():
        return task_id

    task = Task.objects.filter(pk=task_id).first()
    if not task:
        return task_id

    task.parse_result_json = parse_dict
    task.parse_status = "completed"
    task.parse_error = None
    upd = ["parse_result_json", "parse_status", "parse_error", "updated_at"]
    if meta:
        prev = task.dify_run_metadata_json if isinstance(task.dify_run_metadata_json, dict) else {}
        prev = dict(prev)
        prev["workflow1"] = meta
        task.dify_run_metadata_json = prev
        upd.insert(0, "dify_run_metadata_json")
    task.save(update_fields=upd)
    return task_id


@shared_task(name="compliance.run_dify_workflow2_async")
def run_dify_workflow2_async(task_id: int, std_code: str) -> str:
    """占位：按 std_code 补缺 national_standard_indicator。"""
    return f"{task_id}:{std_code}"
