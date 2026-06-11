"""行业分类 ICS/CCS：上传导入、关键词检索、树形列表。"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, TypedDict

from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.db.models import Q

from apps.standards.models import CcsIndustryClassification, IcsIndustryClassification
from apps.standards.schemas.industry_taxonomy import TaxonomyItemPatchIn
from apps.standards.services.classification_import import load_ccs_rows, load_ics_merged

QUERY_LIMIT = 200


class TaxonomyTreeNode(TypedDict, total=False):
    """与前端约定的树节点；id / effective 在树接口中默认都会返回。"""

    id: int
    code: str
    name: str
    effective: bool
    children: list["TaxonomyTreeNode"]


def _normalize_scheme(s: str | None) -> str:
    if not s:
        return ""
    return str(s).strip().upper()


def _dedupe_ics_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_code: dict[str, dict[str, Any]] = {}
    for r in rows:
        by_code[r["ics_code"]] = r
    return list(by_code.values())


def _dedupe_ccs_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_code: dict[str, dict[str, Any]] = {}
    for r in rows:
        by_code[r["ccs_code"]] = r
    return list(by_code.values())


def import_taxonomy_file(upload: UploadedFile, scheme: str) -> dict[str, Any]:
    sch = _normalize_scheme(scheme)
    if sch not in ("ICS", "CCS"):
        raise ValueError("scheme 必须是 ICS 或 CCS")

    name = upload.name or "upload"
    suffix = Path(name).suffix.lower()
    if suffix not in (".xlsx", ".xlsm"):
        suffix = ".xlsx"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        for chunk in upload.chunks():
            tmp.write(chunk)
        tmp_path = Path(tmp.name)

    try:
        if sch == "ICS":
            rows = load_ics_merged(tmp_path)
            if not rows:
                raise ValueError(
                    "文件中未解析到 ICS 数据（需含 ICS 工作表，表头含「分类号u」等）"
                )
            rows = _dedupe_ics_rows(rows)
            stats = _upsert_ics_rows(rows)
            return {
                "scheme": "ICS",
                "imported": stats["processed"],
                "created": stats["created"],
                "updated": stats["updated"],
            }

        rows = load_ccs_rows(tmp_path)
        if not rows:
            raise ValueError(
                "文件中未解析到 CCS 数据（需含 CCS 工作表，表头含「代码」「名称」）"
            )
        rows = _dedupe_ccs_rows(rows)
        stats = _upsert_ccs_rows(rows)
        return {
            "scheme": "CCS",
            "imported": stats["processed"],
            "created": stats["created"],
            "updated": stats["updated"],
        }
    finally:
        tmp_path.unlink(missing_ok=True)


def _upsert_ics_rows(rows: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    updated = 0
    with transaction.atomic():
        for r in rows:
            _, was_created = IcsIndustryClassification.objects.update_or_create(
                ics_code=r["ics_code"],
                defaults={
                    "ics_level": r.get("ics_level"),
                    "ics_name": r.get("ics_name"),
                    "ics_note": r.get("ics_note"),
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
    return {"created": created, "updated": updated, "processed": len(rows)}


def _upsert_ccs_rows(rows: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    updated = 0
    with transaction.atomic():
        for r in rows:
            _, was_created = CcsIndustryClassification.objects.update_or_create(
                ccs_code=r["ccs_code"],
                defaults={
                    "ccs_name": r.get("ccs_name"),
                    "parent_code": r.get("parent_code"),
                    "ccs_note": r.get("ccs_note"),
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
    return {"created": created, "updated": updated, "processed": len(rows)}


def query_taxonomy(keyword: str, _scheme: str | None = None) -> dict[str, Any]:
    kw = (keyword or "").strip()
    if not kw:
        raise ValueError("缺少参数 q")
    # _scheme 保留仅兼容旧调用；检索始终同时查 ICS + CCS（与去掉「仅检索当前体系」一致）。

    out: dict[str, Any] = {"ics": [], "ccs": []}

    q_ic = (
        Q(ics_code__icontains=kw)
        | Q(ics_name__icontains=kw)
        | Q(ics_note__icontains=kw)
    )
    qs_ic = (
        IcsIndustryClassification.objects.filter(q_ic)
        .order_by("ics_code")[:QUERY_LIMIT]
    )
    out["ics"] = [
        {
            "ics_code": r.ics_code,
            "ics_level": r.ics_level,
            "ics_name": r.ics_name,
            "ics_note": r.ics_note,
        }
        for r in qs_ic
    ]

    q_cc = (
        Q(ccs_code__icontains=kw)
        | Q(ccs_name__icontains=kw)
        | Q(ccs_note__icontains=kw)
        | Q(parent_code__icontains=kw)
    )
    qs_cc = (
        CcsIndustryClassification.objects.filter(q_cc)
        .order_by("ccs_code")[:QUERY_LIMIT]
    )
    out["ccs"] = [
        {
            "ccs_code": r.ccs_code,
            "ccs_name": r.ccs_name,
            "parent_code": r.parent_code,
            "ccs_note": r.ccs_note,
        }
        for r in qs_cc
    ]

    return out


def _ics_parent_code(code: str, code_set: set[str]) -> str | None:
    """根据库中已存在的分类号推断 ICS 父节点（点分层级）。"""
    if "." not in code:
        return None
    c = code
    while True:
        dot = c.rfind(".")
        if dot < 0:
            return None
        c = c[:dot]
        if c in code_set:
            return c


def _sort_tree_nodes(nodes: list[TaxonomyTreeNode]) -> None:
    nodes.sort(key=lambda n: n["code"])
    for n in nodes:
        ch = n.get("children") or []
        _sort_tree_nodes(ch)


def build_ics_tree(rows: list[IcsIndustryClassification]) -> list[TaxonomyTreeNode]:
    """由 ICS 平面表构建树（父级用分类号点分前缀在库中的最长匹配）。"""
    code_set = {r.ics_code for r in rows}
    nodes: dict[str, TaxonomyTreeNode] = {}
    for r in rows:
        n: TaxonomyTreeNode = {
            "id": r.id,
            "code": r.ics_code,
            "name": r.ics_name or "",
            "effective": True,
            "children": [],
        }
        nodes[r.ics_code] = n

    has_parent: set[str] = set()
    for r in rows:
        parent = _ics_parent_code(r.ics_code, code_set)
        if parent and parent in nodes:
            nodes[parent].setdefault("children", []).append(nodes[r.ics_code])
            has_parent.add(r.ics_code)

    roots = [nodes[c] for c in nodes if c not in has_parent]
    _sort_tree_nodes(roots)
    return roots


def build_ccs_tree(rows: list[CcsIndustryClassification]) -> list[TaxonomyTreeNode]:
    """由 CCS 的 parent_code 构建树。"""
    nodes: dict[str, TaxonomyTreeNode] = {}
    for r in rows:
        n: TaxonomyTreeNode = {
            "id": r.id,
            "code": r.ccs_code,
            "name": r.ccs_name or "",
            "effective": True,
            "children": [],
        }
        nodes[r.ccs_code] = n

    has_parent: set[str] = set()
    for r in rows:
        p = (r.parent_code or "").strip() or None
        if p and p in nodes:
            nodes[p].setdefault("children", []).append(nodes[r.ccs_code])
            has_parent.add(r.ccs_code)

    roots = [nodes[c] for c in nodes if c not in has_parent]
    _sort_tree_nodes(roots)
    return roots


def taxonomy_tree(scheme: str) -> dict[str, Any]:
    """
    整表构建行业分类树。scheme：ICS | CCS。
    节点：code、name、children、id（表主键）、effective（库内无单独字段时恒为 True）。
    """
    sch = _normalize_scheme(scheme)
    if sch not in ("ICS", "CCS"):
        raise ValueError("scheme 必须是 ICS 或 CCS")
    if sch == "ICS":
        rows = list(
            IcsIndustryClassification.objects.all().order_by("ics_code")
        )
        tree = build_ics_tree(rows)
        return {"scheme": "ICS", "tree": tree}

    rows = list(
        CcsIndustryClassification.objects.all().order_by("ccs_code")
    )
    tree = build_ccs_tree(rows)
    return {"scheme": "CCS", "tree": tree}


def _ics_row_dict(obj: IcsIndustryClassification) -> dict[str, Any]:
    return {
        "id": obj.id,
        "ics_code": obj.ics_code,
        "ics_level": obj.ics_level,
        "ics_name": obj.ics_name,
        "ics_note": obj.ics_note,
    }


def _ccs_row_dict(obj: CcsIndustryClassification) -> dict[str, Any]:
    return {
        "id": obj.id,
        "ccs_code": obj.ccs_code,
        "ccs_name": obj.ccs_name,
        "parent_code": obj.parent_code,
        "ccs_note": obj.ccs_note,
    }


def _normalize_text(v: Any, *, allow_empty_as_none: bool = True) -> str | None:
    if v is None:
        return None
    if not isinstance(v, str):
        return str(v).strip() or (None if allow_empty_as_none else "")
    s = v.strip()
    if not s and allow_empty_as_none:
        return None
    return s


def _coerce_smallint(v: Any) -> int | None:
    if v is None:
        return None
    if isinstance(v, bool):
        raise ValueError("ics_level 不能为布尔值")
    if isinstance(v, int):
        return v
    try:
        return int(str(v).strip())
    except (TypeError, ValueError) as e:
        raise ValueError("ics_level 须为整数") from e


def patch_taxonomy_item(item_id: int, scheme: str, body: TaxonomyItemPatchIn) -> dict[str, Any]:
    """按主键局部更新一条 ICS 或 CCS；`body` 仅处理与 scheme 对应的字段。"""
    sch = _normalize_scheme(scheme)
    if sch not in ("ICS", "CCS"):
        raise ValueError("scheme 必须是 ICS 或 CCS")

    raw = body.model_dump(exclude_unset=True)
    if sch == "ICS":
        allowed = {"ics_code", "ics_level", "ics_name", "ics_note"}
    else:
        allowed = {"ccs_code", "ccs_name", "parent_code", "ccs_note"}
    updates = {k: v for k, v in raw.items() if k in allowed}
    if not updates:
        raise ValueError("未提供任何可更新字段")

    try:
        if sch == "ICS":
            obj = IcsIndustryClassification.objects.filter(pk=item_id).first()
            if not obj:
                raise LookupError("记录不存在")
            if "ics_code" in updates:
                code = _normalize_text(updates["ics_code"], allow_empty_as_none=False)
                if not code:
                    raise ValueError("分类号不能为空")
                code = code[:64]
                if (
                    IcsIndustryClassification.objects.exclude(pk=item_id)
                    .filter(ics_code=code)
                    .exists()
                ):
                    raise ValueError(f"ICS 分类号已存在: {code}")
                obj.ics_code = code
            if "ics_level" in updates:
                obj.ics_level = _coerce_smallint(updates["ics_level"])
            if "ics_name" in updates:
                obj.ics_name = _normalize_text(updates["ics_name"])
            if "ics_note" in updates:
                obj.ics_note = _normalize_text(updates["ics_note"])
            obj.save()
            return {"scheme": "ICS", "item": _ics_row_dict(obj)}

        obj = CcsIndustryClassification.objects.filter(pk=item_id).first()
        if not obj:
            raise LookupError("记录不存在")
        if "ccs_code" in updates:
            code = _normalize_text(updates["ccs_code"], allow_empty_as_none=False)
            if not code:
                raise ValueError("分类号不能为空")
            code = code[:64]
            if (
                CcsIndustryClassification.objects.exclude(pk=item_id)
                .filter(ccs_code=code)
                .exists()
            ):
                raise ValueError(f"CCS 代码已存在: {code}")
            obj.ccs_code = code
        if "ccs_name" in updates:
            obj.ccs_name = _normalize_text(updates["ccs_name"])
        if "parent_code" in updates:
            p = updates["parent_code"]
            if p is None or (isinstance(p, str) and not p.strip()):
                obj.parent_code = None
            else:
                obj.parent_code = str(p).strip()[:64]
        if "ccs_note" in updates:
            obj.ccs_note = _normalize_text(updates["ccs_note"])
        obj.save()
        return {"scheme": "CCS", "item": _ccs_row_dict(obj)}
    except IntegrityError as e:
        raise ValueError("保存失败：分类号可能与其它记录冲突") from e


def delete_taxonomy_item(item_id: int, scheme: str) -> dict[str, Any]:
    sch = _normalize_scheme(scheme)
    if sch not in ("ICS", "CCS"):
        raise ValueError("scheme 必须是 ICS 或 CCS")
    if sch == "ICS":
        n, _ = IcsIndustryClassification.objects.filter(pk=item_id).delete()
    else:
        n, _ = CcsIndustryClassification.objects.filter(pk=item_id).delete()
    if n == 0:
        raise LookupError("记录不存在")
    return {"scheme": sch, "id": item_id, "deleted": True}


def import_taxonomy_table_template(
    upload: UploadedFile, scheme: str
) -> dict[str, Any]:
    """
    使用「与数据表字段对齐」的 CSV/xlsx：按分类号 upsert（无则插入，有则更新），不清空表。
    """
    from apps.standards.services.classification_table_template import (
        load_rows_from_template_upload,
    )

    sch = _normalize_scheme(scheme)
    if sch not in ("ICS", "CCS"):
        raise ValueError("scheme 必须是 ICS 或 CCS")
    rows = load_rows_from_template_upload(upload, sch)
    if not rows:
        raise ValueError(
            "未解析到数据行：请确认首行为表头（与下载模板一致），"
            "且 ICS 含「国际标准分类号」列、CCS 含「中国标准分类号」列；"
            "亦支持 ics_code / ccs_code 等英文字段名"
        )
    if sch == "ICS":
        rows = _dedupe_ics_rows(rows)
        stats = _upsert_ics_rows(rows)
        return {
            "scheme": "ICS",
            "imported": stats["processed"],
            "created": stats["created"],
            "updated": stats["updated"],
            "source": "table_template",
        }

    rows = _dedupe_ccs_rows(rows)
    stats = _upsert_ccs_rows(rows)
    return {
        "scheme": "CCS",
        "imported": stats["processed"],
        "created": stats["created"],
        "updated": stats["updated"],
        "source": "table_template",
    }
