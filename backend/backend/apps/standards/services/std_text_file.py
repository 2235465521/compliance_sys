"""国标正文：从 `national_standard_basic.std_file_path` 解析路径或外链并响应。"""

from __future__ import annotations

import io
import mimetypes
import re
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.http import FileResponse, HttpResponseRedirect
from ninja.errors import HttpError

from apps.standards.models import NationalStandardBasic

# 与前端常见提示统一，便于对照排查（路径未配置、文件不存在、0 字节）
ERR_PATH_OR_EMPTY = "正文路径不存在或内容为空"


def _content_disposition(std_code: str, path: Path, *, inline: bool) -> str:
    """RFC 5987 filename* 避免中文/空格文件名在浏览器标题、另存为里变成乱码。"""
    ext = path.suffix if path.suffix else ""
    utf8_name = f"{std_code.strip()}{ext}"
    ascii_name = re.sub(r"[^A-Za-z0-9._\-]+", "_", utf8_name).strip("._") or f"file{ext}"
    if len(ascii_name) > 180:
        ascii_name = ascii_name[:180]
    kind = "inline" if inline else "attachment"
    enc = quote(utf8_name, safe="")
    return f'{kind}; filename="{ascii_name}"; filename*=UTF-8\'\'{enc}'


def _get_basic(bz_id: str) -> NationalStandardBasic | None:
    bid = (bz_id or "").strip()
    if not bid:
        return None
    if bid.isdigit():
        o = NationalStandardBasic.objects.filter(id=int(bid)).first()
        if o:
            return o

    # 库中标准号可能无空格（GB1000…），URL 中带 GB+1000（带空格）
    normalized = " ".join(bid.split())
    compact = normalized.replace(" ", "")
    seen: set[str] = set()
    for candidate in (bid, normalized, compact):
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        o = NationalStandardBasic.objects.filter(std_code=candidate).first()
        if o:
            return o
    return None


def _main_root() -> Path:
    return Path(getattr(settings, "STANDARDS_FILE_ROOT")).resolve()


def _allowed_roots() -> list[Path]:
    roots: list[Path] = [_main_root()]
    for extra in getattr(settings, "STANDARDS_FILE_EXTRA_ROOTS", []):
        try:
            roots.append(Path(extra).resolve())
        except OSError:
            continue
    return roots


def _is_under_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _is_under_any_root(path: Path, roots: list[Path]) -> bool:
    resolved = path.resolve()
    for root in roots:
        if _is_under_root(resolved, root):
            return True
    return False


def _resolve_local_path(raw: str) -> Path:
    raw_s = (raw or "").strip()
    if not raw_s:
        raise HttpError(404, ERR_PATH_OR_EMPTY)

    roots = _allowed_roots()
    allow_any = getattr(settings, "STANDARDS_FILE_ALLOW_ABSOLUTE_ANY", False)
    p_in = Path(raw_s)

    if p_in.is_absolute():
        p = p_in.resolve()
        if allow_any:
            if not p.is_file():
                raise HttpError(404, ERR_PATH_OR_EMPTY)
            if p.stat().st_size == 0:
                raise HttpError(404, ERR_PATH_OR_EMPTY)
            return p
        if not _is_under_any_root(p, roots):
            raise HttpError(
                403,
                "正文路径不在允许目录内。请在 .env 设置 STANDARDS_FILE_ROOT 或 "
                "STANDARDS_FILE_EXTRA_ROOTS（逗号分隔多个根），或按需开启 "
                "STANDARDS_FILE_ALLOW_ABSOLUTE_ANY=1（生产环境慎用）。",
            ) from None
        if not p.is_file():
            raise HttpError(404, ERR_PATH_OR_EMPTY)
        if p.stat().st_size == 0:
            raise HttpError(404, ERR_PATH_OR_EMPTY)
        return p

    # 相对路径：在「主根 + EXTRA 根」下各尝试一次（同一段相对路径多盘副本场景）
    rel = raw_s.lstrip("/\\")
    for root in roots:
        root_r = root.resolve()
        cand = (root_r / rel).resolve()
        if not _is_under_root(cand, root_r):
            continue
        if cand.is_file() and cand.stat().st_size > 0:
            return cand

    raise HttpError(404, ERR_PATH_OR_EMPTY)


def _build_preview_title(obj: NationalStandardBasic) -> str:
    """供 PDF 文档属性 /Title 使用，替代文件内错误编码的标题（浏览器标签来源）。"""
    code = (obj.std_code or "").strip()
    name = (obj.std_name or "").strip()
    if name:
        if len(name) > 120:
            name = name[:120] + "…"
        return f"{code} {name}".strip() if code else name
    return code or "preview"


def _pdf_bytes_rewritten_title(path: Path, obj: NationalStandardBasic) -> bytes | None:
    """复制 PDF 并重写 Document Information 中的 Title；失败则返回 None（回退原文件）。"""
    if path.suffix.lower() != ".pdf":
        return None
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        return None
    try:
        reader = PdfReader(str(path), strict=False)
        if reader.is_encrypted:
            reader.decrypt("")
        writer = PdfWriter()
        writer.append_pages_from_reader(reader)
        writer.add_metadata({"/Title": _build_preview_title(obj)})
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception:
        return None


def respond_standard_text(*, bz_id: str, attachment: bool):
    """
    attachment=False：浏览器内联预览（适用 PDF/图片/文本等）。
    attachment=True：以附件下载，浏览器「另存为」。
    std_file_path 为 http(s) 时两种模式均 302 到该 URL（外站无法代设 Content-Disposition）。
    """
    obj = _get_basic(bz_id)
    if obj is None:
        raise HttpError(404, "标准不存在")
    raw = (obj.std_file_path or "").strip()
    if not raw:
        raise HttpError(404, ERR_PATH_OR_EMPTY)

    if raw.lower().startswith(("http://", "https://")):
        return HttpResponseRedirect(raw)

    path = _resolve_local_path(raw)
    content_type, _ = mimetypes.guess_type(path.name)
    content_type = content_type or "application/octet-stream"

    if not attachment and path.suffix.lower() == ".pdf":
        rewritten = _pdf_bytes_rewritten_title(path, obj)
        if rewritten is not None:
            resp = FileResponse(
                io.BytesIO(rewritten),
                content_type="application/pdf",
            )
            resp["Content-Disposition"] = _content_disposition(
                obj.std_code, path, inline=True
            )
            return resp

    fh = path.open("rb")
    resp = FileResponse(fh, content_type=content_type)
    resp["Content-Disposition"] = _content_disposition(
        obj.std_code, path, inline=not attachment
    )
    return resp
