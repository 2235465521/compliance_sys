"""国标指标入库：调用 Dify 工作流解析国标文件，将指标写入 national_standard_indicator。

每个 std_code 写一行，specific_indicator_value 存 indexes 数组的完整 JSON 字符串。
"""

from __future__ import annotations

import json
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any

from django.core.files.uploadedfile import UploadedFile

from apps.engine.dify_client import DifyApiError, DifyClient
from apps.standards.models import (
    NationalStandardBasic,
    NationalStandardIndexImportHistory,
    NationalStandardIndexImportItem,
    NationalStandardIndicator,
)

STD_INDEX_MISSING_DIFY_MSG = (
    "国标指标入库未配置 Dify：请设置 STD_INDEX_DIFY_API_KEY，"
    "以及 STD_INDEX_DIFY_API_BASE（或共用 DIFY_API_BASE）与 STD_INDEX_DIFY_FILES_INPUT_KEY（默认 file）。"
)


def _normalize_std_code(code: str) -> str:
    """
    规范化 Dify 返回的国标号，使其与数据库格式一致。
    处理：
    - 中文破折号/连接号 → ASCII 短横线（—、–、―、‐ → -）
    - 全角连字符/减号 → ASCII 短横线（－ → -）
    - 字母前缀与数字之间缺少空格（GB1002 → GB 1002）
    - 去除首尾空白
    """
    code = re.sub(r"[—–―‐－]", "-", code)
    code = re.sub(r"([A-Za-z]+)(\d)", r"\1 \2", code)
    code = re.sub(r"\s+", " ", code).strip()
    return code


_GB_CODE_IN_TEXT_RE = re.compile(
    r"GB\s*/?\s*T?\s*\d+(?:\.\d+)?\s*[-—–―‐－]\s*\d{4}",
    re.IGNORECASE,
)


def _is_unknown_std_code(code: str) -> bool:
    c = (code or "").strip()
    if not c:
        return True
    lowered = c.lower()
    if "未知" in c or "未提供" in c or "unknown" in lowered:
        return True
    return False


def _extract_gb_code_from_text(text: str) -> str | None:
    """从文件名或任意文本中提取 GB xxxx-xxxx。"""
    if not text:
        return None
    m = _GB_CODE_IN_TEXT_RE.search(text)
    if not m:
        return None
    return _normalize_std_code(m.group(0))


def _canonical_std_code_in_db(code: str) -> str | None:
    """若主表存在该国标号则返回库内 canonical std_code，否则 None。"""
    normalized = _normalize_std_code(code)
    if not normalized or _is_unknown_std_code(normalized):
        return None
    if NationalStandardBasic.objects.filter(std_code=normalized).exists():
        return normalized
    # 兼容 GB10055-2007 与 GB 10055-2007
    compact = normalized.replace(" ", "")
    hit = (
        NationalStandardBasic.objects.filter(std_code__iexact=compact)
        .values_list("std_code", flat=True)
        .first()
    )
    return hit if hit else None


def _resolve_std_code_for_import(
    result_dict: dict[str, Any],
    filename: str,
    *,
    std_code_hint: str | None = None,
) -> tuple[str, str]:
    """
    解析入库用国标号：优先用户 hint → Dify bz_id → 文件名。

    Returns:
        (std_code, source) — source 为 hint / dify / filename / unresolved
    """
    hint_val = (std_code_hint or "").strip()
    if hint_val:
        hit = _canonical_std_code_in_db(hint_val)
        if hit:
            return hit, "hint"

    dify_raw = str(
        result_dict.get("bz_id")
        or result_dict.get("std_code")
        or result_dict.get("stdCode")
        or ""
    ).strip()
    if not _is_unknown_std_code(dify_raw):
        hit = _canonical_std_code_in_db(dify_raw)
        if hit:
            return hit, "dify"

    for text in (filename, Path(filename).stem, dify_raw):
        extracted = _extract_gb_code_from_text(text or "")
        if extracted:
            hit = _canonical_std_code_in_db(extracted)
            if hit:
                return hit, "filename"

    return _normalize_std_code(dify_raw), "unresolved"


def import_std_index_from_upload(
    uploaded_file: UploadedFile,
    *,
    replace: bool = True,
    std_code_hint: str | None = None,
) -> dict[str, Any]:
    """
    主入口：接收前端上传的文件，调用 Dify 工作流，将指标写入 national_standard_indicator。

    每个 std_code 只写一行，specific_indicator_value 存 indexes 数组的完整 JSON 字符串。

    Args:
        uploaded_file: Django UploadedFile 对象（来自 request.FILES）。
        replace: 若为 True，先删除该 std_code 的旧记录再插入；False 则追加。

    Returns:
        dict：含 bz_id、imported（1=写入成功）、skipped（std_code 不存在时为 1）、
              indexes_count（indexes 数组长度）、meta 等。
    """
    client = DifyClient()
    if not client.is_std_index_configured():
        import os
        raise RuntimeError(
            f"国标指标工作流未配置 | "
            f"key={repr(os.environ.get('STD_INDEX_DIFY_API_KEY', 'MISSING')[:20])} | "
            f"base={repr(os.environ.get('STD_INDEX_DIFY_API_BASE', 'MISSING'))} | "
            f"client_key={repr(client.std_index_api_key[:20] if client.std_index_api_key else 'EMPTY')} | "
            f"client_base={repr(client.std_index_api_base)}"
        )

    filename = uploaded_file.name or "unknown"
    hint_from_name = _extract_gb_code_from_text(filename)
    merged_hint = (std_code_hint or "").strip() or hint_from_name or None

    suffix = Path(filename).suffix or ".pdf"
    tmp_path = Path(tempfile.gettempdir()) / f"std_index_{uuid.uuid4().hex}{suffix}"
    try:
        with tmp_path.open("wb") as f:
            for chunk in uploaded_file.chunks():
                f.write(chunk)

        user = f"std-index-{uuid.uuid4().hex[:8]}"
        result_dict, meta = client.run_std_index_import_workflow(
            tmp_path,
            user=user,
            std_code_hint=merged_hint,
            original_filename=filename,
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    bz_id, code_source = _resolve_std_code_for_import(
        result_dict, filename, std_code_hint=merged_hint
    )
    indexes = list(result_dict.get("indexes") or [])

    # Dify 有时把额外的指标条目错放到根对象（而不是 indexes 数组里），兜底处理
    if result_dict.get("index_name") or result_dict.get("index_content"):
        root_index = {k: v for k, v in result_dict.items() if k not in ("bz_id", "indexes")}
        indexes.append(root_index)

    if not isinstance(indexes, list):
        raise DifyApiError(f"工作流返回的 indexes 不是列表，实际类型: {type(indexes).__name__}")

    # 检查 std_code 是否在库中
    canonical = _canonical_std_code_in_db(bz_id) if bz_id else None
    if not canonical:
        dify_bz = str(result_dict.get("bz_id") or "").strip()
        hint = ""
        if _is_unknown_std_code(dify_bz):
            hint = "（Dify 未识别出国标号，已尝试从文件名解析）"
        elif code_source == "filename":
            hint = "（已从文件名解析国标号，但主表中仍无匹配）"
        err = f"国标号 {bz_id!r}{hint} 在 national_standard_basic 中不存在，指标未入库。"
        NationalStandardIndexImportHistory.objects.create(
            std_code=bz_id or dify_bz or "（未识别）",
            original_filename=filename,
            import_status="failed",
            indexes_count=0,
            error_message=err,
        )
        return {
            "bz_id": bz_id or dify_bz,
            "imported": 0,
            "skipped": 1,
            "warning": err,
            "meta": {**meta, "std_code_source": code_source, "dify_bz_id": dify_bz},
        }
    bz_id = canonical

    # 已存在指标记录则跳过，不覆盖也不重复入库
    already_exists = NationalStandardIndicator.objects.filter(std_code=bz_id).exists()
    if already_exists:
        NationalStandardIndexImportHistory.objects.create(
            std_code=bz_id,
            original_filename=filename,
            import_status="skipped",
            indexes_count=0,
            error_message=f"国标号 {bz_id!r} 的指标已存在，本次跳过入库。",
        )
        return {
            "bz_id": bz_id,
            "imported": 0,
            "skipped": 1,
            "warning": f"国标号 {bz_id!r} 的指标已存在，本次跳过入库。",
            "meta": meta,
        }

    if not indexes:
        warn_empty = (
            f"国标号 {bz_id!r} 已识别，但 Dify 未返回任何指标（indexes 为空）。"
            "请检查 PDF 是否可解析、工作流是否读到正文表格，或在 Dify 中调试该文件。"
        )
        NationalStandardIndexImportHistory.objects.create(
            std_code=bz_id,
            original_filename=filename,
            import_status="failed",
            indexes_count=0,
            error_message=warn_empty,
        )
        return {
            "bz_id": bz_id,
            "imported": 0,
            "skipped": 1,
            "warning": warn_empty,
            "meta": {**meta, "std_code_source": code_source, "dify_bz_id": result_dict.get("bz_id")},
        }

    indexes_json = json.dumps(indexes, ensure_ascii=False)
    NationalStandardIndicator.objects.create(
        std_code=bz_id,
        specific_indicator_value=indexes_json,
        manual_review_status="pending",
    )

    NationalStandardIndexImportHistory.objects.create(
        std_code=bz_id,
        original_filename=filename,
        import_status="completed",
        indexes_count=len(indexes),
        manual_review_status="pending",
    )

    return {
        "bz_id": bz_id,
        "imported": 1,
        "skipped": 0,
        "indexes_count": len(indexes),
        "meta": {**meta, "std_code_source": code_source},
    }


def get_std_index_for_review(std_code: str) -> dict[str, Any]:
    """
    查询指定国标号的指标记录，返回解析后的 indexes 列表供前端审核页渲染。

    Returns:
        dict 含 record_id、std_code、indexes（list）、manual_review_status
    """
    row = NationalStandardIndicator.objects.filter(std_code=std_code).first()
    if row is None:
        return {
            "record_id": None,
            "std_code": std_code,
            "indexes": [],
            "manual_review_status": None,
        }

    try:
        indexes = json.loads(row.specific_indicator_value or "[]")
        if not isinstance(indexes, list):
            indexes = []
    except (json.JSONDecodeError, TypeError):
        indexes = []

    return {
        "record_id": row.pk,
        "std_code": std_code,
        "indexes": indexes,
        "manual_review_status": row.manual_review_status,
    }


def save_reviewed_indexes(
    std_code: str,
    indexes: list[Any],
    *,
    manual_review_status: str = "approved",
) -> dict[str, Any]:
    """
    将前端审核后的指标列表写回数据库，同时更新 manual_review_status。

    Args:
        std_code: 国标号。
        indexes: 前端提交的审核后 indexes 数组（可经过编辑/删除）。
        manual_review_status: 'approved' 或 'rejected'，默认 'approved'。

    Returns:
        dict 含 std_code、indexes_count、manual_review_status。
    """
    indexes_json = json.dumps(indexes, ensure_ascii=False)

    updated = NationalStandardIndicator.objects.filter(std_code=std_code).update(
        specific_indicator_value=indexes_json,
        manual_review_status=manual_review_status,
    )

    if updated == 0:
        NationalStandardIndicator.objects.create(
            std_code=std_code,
            specific_indicator_value=indexes_json,
            manual_review_status=manual_review_status,
        )

    # 同步更新最近一条历史记录的审核状态
    latest_history = (
        NationalStandardIndexImportHistory.objects.filter(std_code=std_code)
        .order_by("-created_at")
        .first()
    )
    if latest_history:
        latest_history.manual_review_status = manual_review_status
        latest_history.save(update_fields=["manual_review_status", "updated_at"])

    NationalStandardIndexImportItem.objects.filter(
        std_code=std_code,
        status=NationalStandardIndexImportItem.Status.COMPLETED,
    ).update(
        manual_review_status=manual_review_status,
        indexes_count=len(indexes),
    )

    return {
        "std_code": std_code,
        "indexes_count": len(indexes),
        "manual_review_status": manual_review_status,
    }
