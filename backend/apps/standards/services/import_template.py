"""国标元数据批量入库：模板表头与生成空白模板文件（CSV / xlsx）。"""

from __future__ import annotations

import csv
import io
from pathlib import Path

# 与 national_standard_basic 字段一致；表头使用中文注释（与用户提供一致）
IMPORT_TEMPLATE_HEADERS: tuple[str, ...] = (
    "国标号",
    "标准名称",
    "标准状态（Excel 原文，如废止、现行）",
    "发布日期",
    "实施日期",
    "废止日期",
    "标准类别",
    "代替标准",
    "代替类型：-1无；1全部代替；2部分代替；3部分代完；4未知",
    "中国标准分类号",
    "国际标准分类号",
    "谱系号（可能多条，英文逗号拼接）",
    "详情链接",
    "国标文件保存路径",
)

_RESOURCES_DIR = Path(__file__).resolve().parent.parent / "resources"
_CSV_TEMPLATE = _RESOURCES_DIR / "national_standard_basic_import_template.csv"


def template_csv_path() -> Path:
    return _CSV_TEMPLATE


def effective_template_headers() -> tuple[str, ...]:
    """与下载模板一致的表头：优先来自 resources 下 CSV 首行，否则用代码内默认。"""
    if not _CSV_TEMPLATE.is_file():
        return IMPORT_TEMPLATE_HEADERS
    with _CSV_TEMPLATE.open(newline="", encoding="utf-8-sig") as f:
        row = next(csv.reader(f), None)
        if row:
            return tuple((c or "").strip() for c in row)
    return IMPORT_TEMPLATE_HEADERS


def template_csv_bytes() -> bytes:
    """与项目内 ``national_standard_basic_import_template.csv`` 完全一致（仅补充 UTF-8 BOM 供 Excel）。"""
    if _CSV_TEMPLATE.is_file():
        raw = _CSV_TEMPLATE.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            return raw
        return b"\xef\xbb\xbf" + raw
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(list(IMPORT_TEMPLATE_HEADERS))
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def template_xlsx_bytes() -> bytes:
    try:
        from openpyxl import Workbook
    except ImportError as e:
        raise ImportError("请安装 openpyxl：`pip install openpyxl`") from e

    headers = effective_template_headers()
    wb = Workbook()
    ws = wb.active
    ws.title = "国标元数据"
    for col, title in enumerate(headers, start=1):
        ws.cell(row=1, column=col, value=title)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
