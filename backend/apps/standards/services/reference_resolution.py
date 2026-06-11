"""引用标准号 → 现行最新号（谱系表：STSC 为 ``std_pedigree.std_id_latest``，v1 为 ``standard_pedigree.latest_std_code``）。

STSC 库（``std_base`` + ``std_pedigree`` + ``std_ped_chain``）存在时自动走 ``apps.core.stsc_catalog_read``，无需兼容视图。

环境变量 ``REFERENCE_PEDIGREE_CHAIN_MAX_CHARS``：``pedigree_chain`` 中链文本的最大展示长度，默认 800；≤0 不截断。

合规自动比对仅认谱系现行号；``resolve_reference_for_parse_context`` 不以主表回退现行或补全锚点。

对外展示时，可按完整号 / 现行主号在 ``std_base`` 或 ``national_standard_basic`` 中 **只读** 查标准名称（见 ``fetch_national_standard_names_by_codes``），与合规判定无关。

``resolve_reference_for_task`` 可作为后续独立「批量查新」HTTP 接口的核心复用逻辑（输入标准号 + 任务时点上下文）。
"""

from __future__ import annotations

import os
import re
from typing import TYPE_CHECKING, Any, Iterable

from django.db import connection

from apps.compliance.db import is_mysql
from apps.core import stsc_catalog_read

if TYPE_CHECKING:
    from apps.compliance.models import ComplianceEvaluationTask

# 与 reference_bundle 聚合逻辑共用：轻工行业标准（QB 开头）不参与国标谱系。
# 路径名 qb_enterprise_citation 为历史 API 标识，保留不改；QB 不是企业标准 Q/…。
RESOLUTION_PATH_QB_ENTERPRISE_CITATION = "qb_enterprise_citation"
# 非 GB 开头的引用：不自动补全年代号、不查谱系，由审核员处理
RESOLUTION_PATH_MANUAL_REVIEW_NON_GB = "manual_review_non_gb"
# 解析结果中无有效企标号（Q/…）：无法关联时点，不返回「引用号冒充的现行」
RESOLUTION_PATH_MISSING_ENTERPRISE_QB = "missing_enterprise_qb_code"


def _is_qb_enterprise_citation(ref: str) -> bool:
    """规范性引用若以轻工行业标准号 QB 开头（大小写不敏感），则不做国标补全与谱系查新。"""
    s = (ref or "").strip()
    return bool(s) and s.upper().startswith("QB")


def _is_gb_national_standard_citation(ref: str) -> bool:
    """仅 GB / GB/T / GB/Z 等国标族（标准号以 GB 开头，大小写不敏感）走补全年代号与谱系查新。"""
    s = (ref or "").strip()
    return bool(s) and s.upper().startswith("GB")


def _complete_enterprise_qb_code(value: str | None) -> str:
    """
    仅当可识别为「企业标准号」``Q/…`` 时返回规范化串，否则空。

    无 ``Q/`` 前缀的占位串（如仅备案号、内部编号）**不**视为完整企标号，避免误用为时点推断上下文。
    """
    s = (value or "").strip().replace("／", "/")
    if not s:
        return ""
    if not s.upper().startswith("Q/"):
        return ""
    return s


def _effective_qb_code_from_context(pr: dict[str, Any], qb_code: str | None) -> str:
    """企标号：优先参数 ``qb_code``，否则从解析扁平结果中按常见键取值；须通过 ``_complete_enterprise_qb_code``。"""
    q = _complete_enterprise_qb_code(qb_code)
    if q:
        return q
    for key in (
        "qb_code",
        "qb_id",
        "qibiao_code",
        "企标号",
        "企标编号",
        "enterprise_std_code",
        "enterprise_qb_code",
    ):
        v = pr.get(key)
        if v is None:
            continue
        s = _complete_enterprise_qb_code(str(v))
        if s:
            return s
    return ""


_YEAR_SUFFIX_RE = re.compile(r"[-－﹣]\s*(\d{4})\s*$")


def std_code_has_year_suffix(std_code: str) -> bool:
    """是否含「年代号」：标准号末段为 `-YYYY` / `－YYYY` 等（与常见国标写法一致）。"""
    s = (std_code or "").strip()
    if not s:
        return False
    return bool(_YEAR_SUFFIX_RE.search(s))


def _parse_year_from_date_string(raw: str) -> int | None:
    s = (raw or "").strip()
    if not s:
        return None
    m = re.search(r"(19|20)\d{2}", s)
    if m:
        return int(m.group(0))
    return None


def _part_chain_display_max_chars() -> int:
    """环境变量 REFERENCE_PEDIGREE_CHAIN_MAX_CHARS：默认 800；≤0 表示不截断 part_chain。"""
    raw = (os.environ.get("REFERENCE_PEDIGREE_CHAIN_MAX_CHARS", "800") or "800").strip()
    try:
        n = int(raw)
    except ValueError:
        return 800
    return n


def _truncate_part_chain_for_display(pc: str) -> str:
    s = (pc or "").strip()
    if not s:
        return ""
    max_c = _part_chain_display_max_chars()
    if max_c <= 0 or len(s) <= max_c:
        return s
    return s[:max_c] + "…"


def _historical_full_std_code_for_resolve(*, ref: str, has_year: bool, inferred: str | None) -> str | None:
    """前端别名：有年号时即原文引用；无年号时为推断出的当时完整国标号。"""
    if has_year:
        return ref.strip() or None
    if inferred:
        return inferred.strip() or None
    return None


def enterprise_as_of_year_from_parse_dict(
    pr: dict[str, Any] | None,
    *,
    qb_code: str | None,
    fallback_year: int,
) -> int:
    """
    企标侧「时点」年份：优先解析结果中的发布日期 → qb_code 末段四位年 → fallback_year。
    用于无年代号引用时，在谱系表前缀族中选取「当时有效」的带年号锚点。
    """
    pr = pr or {}
    for key in (
        "publish_date",
        "impl_date",
        "release_date",
        "qibiao_release_date",
        "enterprise_release_date",
        "qb_publish_date",
        "implementation_date",
    ):
        y = _parse_year_from_date_string(str(pr.get(key) or ""))
        if y is not None:
            return y
    q = (qb_code or "").strip()
    m = _YEAR_SUFFIX_RE.search(q)
    if m:
        return int(m.group(1))
    m2 = re.search(r"(19|20)\d{2}", q)
    if m2:
        return int(m2.group(0))
    return int(fallback_year)


def enterprise_as_of_year_from_task(task: ComplianceEvaluationTask) -> int:
    """兼容入口：从任务解析 JSON 与 qb_code 推导时点年。"""
    return enterprise_as_of_year_from_parse_dict(
        task.parse_result_json or {},
        qb_code=task.subject_code,
        fallback_year=task.created_at.year,
    )


def _split_latest_std_codes(blob: str | None) -> list[str]:
    """将谱系表 ``latest_std_code`` 中可能的多现行号（顿号、逗号、分号等）拆成有序去重列表。"""
    if not blob or not str(blob).strip():
        return []
    s = str(blob).strip()
    for sep in ("。", "、", ";", "；", ",", "|"):
        s = s.replace(sep, "\n")
    seen: set[str] = set()
    out: list[str] = []
    for line in s.split("\n"):
        t = line.strip()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _first_latest_std_token(latest_blob: str | None) -> str | None:
    """谱系表 latest_std_code 可能多条拼接，取首段作为展示主现行号（与 current_latest_id 兼容）。"""
    codes = _split_latest_std_codes(latest_blob)
    return codes[0] if codes else None


def _current_latest_codes_for_pedigree_hit(latest_blob: str | None, primary: str) -> list[str]:
    """谱系命中时：多现行号来自拆分；无拆分结果时用 primary（常为锚点号）。"""
    codes = _split_latest_std_codes(latest_blob)
    if codes:
        return codes
    p = (primary or "").strip()
    return [p] if p else []


def fetch_national_standard_names_by_codes(codes: Iterable[str | None]) -> dict[str, str]:
    """
    按 ``std_code``（strip 后）查 ``national_standard_basic.std_name``；仅 MySQL。

    返回 ``dict``：key 为 strip 后的 ``std_code``；value 为 strip 后的非空 ``std_name``。
    主表无行或 ``std_name`` 为空时不含该 key（前端可视为无展示名称）。
    """
    uniq: list[str] = []
    seen: set[str] = set()
    for c in codes:
        if c is None:
            continue
        s = str(c).strip()
        if not s or s in seen:
            continue
        seen.add(s)
        uniq.append(s)
    if not uniq or not is_mysql():
        return {}
    if stsc_catalog_read.use_stsc_l1_catalog():
        return stsc_catalog_read.fetch_std_names_by_codes(uniq)
    placeholders = ",".join(["%s"] * len(uniq))
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT std_code, std_name FROM national_standard_basic WHERE std_code IN ({placeholders})",
            uniq,
        )
        rows = cursor.fetchall()
    out: dict[str, str] = {}
    for sc, nm in rows:
        key = (sc or "").strip()
        if not key:
            continue
        val = (nm or "").strip() if nm is not None else ""
        if val:
            out[key] = val
    return out


def _fetch_pedigree_row(std_code: str) -> tuple[str | None, str | None, str | None]:
    """(latest_std_code 原文, ped_id, part_chain)"""
    if stsc_catalog_read.use_stsc_l1_catalog():
        return stsc_catalog_read.fetch_pedigree_row(std_code)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT latest_std_code, ped_id, part_chain
            FROM standard_pedigree
            WHERE std_code = %s
            ORDER BY id DESC
            LIMIT 1
            """,
            [std_code],
        )
        row = cursor.fetchone()
    if not row:
        return None, None, None
    return (row[0] or None), (row[1] or None), (row[2] or None)


def _infer_std_code_from_pedigree_prefix(prefix: str, as_of_year: int) -> str | None:
    """
    无年代号：在 ``standard_pedigree`` 中按 ``std_code = prefix`` 或 ``std_code LIKE prefix-`` 族扫描，
    取末段 ``-YYYY`` 中 **Y ≤ as_of_year** 的候选，按年降序取一条；若无时点内带年号行，再回退 ``std_code = prefix`` 的谱系行（若存在）。
    """
    p = (prefix or "").strip()
    if not p:
        return None
    if stsc_catalog_read.use_stsc_l1_catalog():
        return stsc_catalog_read.infer_std_code_from_pedigree_prefix(p, as_of_year)

    like_pat = f"{p}-%"
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT std_code, id
            FROM standard_pedigree
            WHERE std_code = %s OR std_code LIKE %s
            ORDER BY id DESC
            """,
            [p, like_pat],
        )
        rows = cursor.fetchall()
    if not rows:
        return None
    seen: set[str] = set()
    codes_in_order: list[str] = []
    for std_code, _rid in rows:
        sc = (std_code or "").strip()
        if not sc or sc in seen:
            continue
        seen.add(sc)
        codes_in_order.append(sc)

    dated: list[tuple[int, str]] = []
    exact_prefix: list[str] = []
    for sc in codes_in_order:
        if sc == p:
            exact_prefix.append(sc)
            continue
        m = _YEAR_SUFFIX_RE.search(sc)
        if m:
            y = int(m.group(1))
            if y <= as_of_year:
                dated.append((y, sc))
    if dated:
        dated.sort(key=lambda t: (-t[0], t[1]))
        return dated[0][1]
    if exact_prefix:
        return exact_prefix[0]
    return None


def _compliance_assessable_from_pedigree_hit(
    *,
    token_primary: str | None,
    has_year: bool,
    inferred: str | None,
) -> bool:
    """仅当谱系给出可分拆的 ``latest_std_code`` 且已具备时点完整号（有年号或已通过前缀族推断锚点）时可自动比对合规。"""
    if not (token_primary or "").strip():
        return False
    return bool(has_year or inferred)


def infer_compliance_assessable_from_reference_row(row: dict[str, Any]) -> bool:
    """
    从单条引用对象（精简字段 + 历史 PATCH/落库中的 legacy 键混用）推断是否可做自动合规比对。

    用于 GET 批量子项、PATCH 保存前等：**勿**用 ``setdefault(..., False)`` 把缺省键钉死为不可比对；
    应与 ``resolve_reference_for_parse_context`` 的判定一致。

    说明：落库/对外精简结构常含 ``full_std_at_publication`` 但省略 ``inferred_historical_std_code``。
    对 ``historical_then_pedigree``（引用无年号、由谱系前缀族补全锚点），此时应以非空的时点完整号
    等价于解析阶段的 ``inferred_historical_std_code``，否则会误判为不可比对。
    """
    path = (row.get("resolution_path") or "").strip()
    if not path or path == "empty":
        return False
    if path == RESOLUTION_PATH_QB_ENTERPRISE_CITATION:
        return False
    if path == RESOLUTION_PATH_MANUAL_REVIEW_NON_GB:
        return False
    if path == RESOLUTION_PATH_MISSING_ENTERPRISE_QB:
        return False
    if path == "sqlite_stub":
        return False
    if path == "unresolved_no_historical_row" or path.endswith("_miss"):
        return False

    ref = (row.get("referenced_std_code") or row.get("query_bz_id") or "").strip()
    has_year = std_code_has_year_suffix(ref)

    inf_raw = row.get("inferred_historical_std_code")
    if inf_raw is not None and str(inf_raw).strip():
        inferred: str | None = str(inf_raw).strip()
    else:
        inferred = None

    if inferred is None and path == "historical_then_pedigree" and not has_year:
        full_pub = (row.get("full_std_at_publication") or row.get("historical_full_std_code") or "").strip()
        if full_pub and std_code_has_year_suffix(full_pub):
            inferred = full_pub

    primary = (row.get("latest_std_primary") or row.get("current_latest_id") or "").strip()
    if not primary:
        primary = (_first_latest_std_token(row.get("latest_std_code_raw")) or "").strip()
    token_primary = primary if primary else None

    return _compliance_assessable_from_pedigree_hit(
        token_primary=token_primary,
        has_year=has_year,
        inferred=inferred,
    )


def resolve_reference_for_parse_context(
    referenced_std: str,
    *,
    pr: dict[str, Any] | None = None,
    qb_code: str | None = None,
    fallback_year: int,
) -> dict[str, Any]:
    """
    将单条「企标中的引用标准号」解析为现行侧展示信息（不依赖 ComplianceEvaluationTask）。

    逻辑与 ``resolve_reference_for_task`` 相同；时点年份由 ``pr`` / ``qb_code`` / ``fallback_year`` 推导。
    仅 **GB 开头**的引用走谱系前缀补全与谱系查新；其它（除 QB 轻工行业标准外）为 ``manual_review_non_gb``。
    """
    pr = pr or {}
    ref = (referenced_std or "").strip()
    if not ref:
        return {
            "query_bz_id": "",
            "is_latest": True,
            "current_latest_id": "",
            "current_latest_std_codes": [],
            "pedigree_chain": "",
            "resolution_path": "empty",
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "historical_full_std_code": None,
            "compliance_assessable": False,
        }

    if _is_qb_enterprise_citation(ref):
        return {
            "query_bz_id": ref,
            "historical_full_std_code": None,
            "current_latest_id": "",
            "current_latest_std_codes": [],
            "pedigree_chain": (
                "引用为轻工行业标准（以 QB 开头），不参与国标补全与谱系查新；"
                "现行最新标准号不以引用原文代替，请在审核映射或后续流程中由管理员编辑、核对。"
            ),
            "resolution_path": RESOLUTION_PATH_QB_ENTERPRISE_CITATION,
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "pedigree_anchor_std_code": None,
            "compliance_assessable": False,
        }

    if not _is_gb_national_standard_citation(ref):
        return {
            "query_bz_id": ref,
            "historical_full_std_code": None,
            "current_latest_id": "",
            "current_latest_std_codes": [],
            "pedigree_chain": (
                "引用标准号非 GB 开头，系统不自动补全年代号、不查国标谱系；"
                "请在审核映射等环节由审核员补全或手工查新后处理。"
            ),
            "resolution_path": RESOLUTION_PATH_MANUAL_REVIEW_NON_GB,
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "pedigree_anchor_std_code": None,
            "compliance_assessable": False,
        }

    if not is_mysql():
        hy = std_code_has_year_suffix(ref)
        return {
            "query_bz_id": ref,
            "is_latest": True,
            "current_latest_id": "",
            "current_latest_std_codes": [],
            "pedigree_chain": "sqlite_dev_stub（非 MySQL：不返回引用号作为现行最新；请在 MySQL 环境联调谱系查新）",
            "resolution_path": "sqlite_stub",
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "historical_full_std_code": _historical_full_std_code_for_resolve(ref=ref, has_year=hy, inferred=None),
            "compliance_assessable": False,
        }

    if not _effective_qb_code_from_context(pr, qb_code):
        return {
            "query_bz_id": ref,
            "historical_full_std_code": None,
            "current_latest_id": "",
            "current_latest_std_codes": [],
            "pedigree_chain": (
                "未解析到完整企标号（须为 Q/… 形式的企业标准号），无法关联企标时点进行国标补全与谱系查新；"
                "现行最新标准号不以企标中的引用号代替；请检查 Dify 解析或在审核环节补全企标号后重新处理。"
            ),
            "resolution_path": RESOLUTION_PATH_MISSING_ENTERPRISE_QB,
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "pedigree_anchor_std_code": None,
            "compliance_assessable": False,
        }

    as_of_year = enterprise_as_of_year_from_parse_dict(pr, qb_code=qb_code, fallback_year=fallback_year)
    has_year = std_code_has_year_suffix(ref)

    anchor = ref
    resolution_path = "pedigree_direct"
    inferred: str | None = None

    if not has_year:
        inferred = _infer_std_code_from_pedigree_prefix(ref, as_of_year)
        if not inferred:
            return {
                "query_bz_id": ref,
                "is_latest": False,
                "current_latest_id": "",
                "current_latest_std_codes": [],
                "pedigree_chain": (
                    f"标准年代号无法补全：谱系表未筛出 ≤{as_of_year} 年的带年号版本（请补全引用年代号或维护 standard_pedigree）。"
                ),
                "resolution_path": "unresolved_no_historical_row",
                "inferred_historical_std_code": None,
                "enterprise_as_of_year": as_of_year,
                "historical_full_std_code": None,
                "compliance_assessable": False,
            }
        anchor = inferred
        resolution_path = "historical_then_pedigree"

    latest_blob, ped_id, part_chain = _fetch_pedigree_row(anchor)
    token_primary = _first_latest_std_token(latest_blob)
    if latest_blob or part_chain:
        chain_bits = []
        if part_chain:
            pc = _truncate_part_chain_for_display(str(part_chain))
            chain_bits.append(pc)
        elif ped_id:
            chain_bits.append(f"ped_id={ped_id}")
        pedigree_chain = " | ".join(chain_bits) if chain_bits else (f"ped_id={ped_id}" if ped_id else "谱系表有现行列")
        if not token_primary:
            pedigree_chain += "；谱系未给出 latest_std_code，无法自动比对合规，请维护谱系数据或转审核员处理。"
        hf = _historical_full_std_code_for_resolve(ref=ref, has_year=has_year, inferred=inferred)
        primary = token_primary or ""
        codes_out = _current_latest_codes_for_pedigree_hit(latest_blob, primary)
        assessable = _compliance_assessable_from_pedigree_hit(
            token_primary=token_primary, has_year=has_year, inferred=inferred
        )
        return {
            "query_bz_id": ref,
            "is_latest": True,
            "current_latest_id": primary,
            "current_latest_std_codes": codes_out,
            "pedigree_chain": pedigree_chain,
            "resolution_path": resolution_path,
            "inferred_historical_std_code": inferred,
            "enterprise_as_of_year": as_of_year if not has_year else None,
            "pedigree_anchor_std_code": anchor,
            "latest_std_code_raw": latest_blob,
            "historical_full_std_code": hf,
            "compliance_assessable": assessable,
        }

    return {
        "query_bz_id": ref,
        "is_latest": False,
        "current_latest_id": "",
        "current_latest_std_codes": [],
        "pedigree_chain": (
            "谱系表未命中锚点标准号（无 std_code 行）；无法从谱系取得现行信息，请补全谱系数据或转审核员处理。"
        ),
        "resolution_path": resolution_path + "_miss",
        "inferred_historical_std_code": inferred,
        "enterprise_as_of_year": as_of_year if not has_year else None,
        "pedigree_anchor_std_code": anchor,
        "latest_std_code_raw": None,
        "historical_full_std_code": _historical_full_std_code_for_resolve(ref=ref, has_year=has_year, inferred=inferred),
        "compliance_assessable": False,
    }


def resolve_reference_for_task(task: ComplianceEvaluationTask, referenced_std: str) -> dict[str, Any]:
    """
    将单条「企标中的引用标准号」解析为现行侧展示信息。

    逻辑概要：
    0. **仅 GB 开头**（大小写不敏感，如 GB、GB/T、GB/Z）：才进行年代号补全推断与谱系查新；其余引用走
       ``manual_review_non_gb``，由审核员处理。
    1. 含年代号：用该完整标准号查 ``standard_pedigree``，取 ``latest_std_code`` 拆分为 ``current_latest_std_codes``，
       ``current_latest_id`` 为其首项（兼容旧字段）。
    2. 不含年代号：用企标发布年等在 ``standard_pedigree`` 前缀族中筛出 ≤ 时点年的带年号锚点，再查谱系得 ``latest_std_code``。
    """
    return resolve_reference_for_parse_context(
        referenced_std,
        pr=task.parse_result_json or {},
        qb_code=task.subject_code,
        fallback_year=task.created_at.year,
    )


def resolve_latest_for_code(std_code: str) -> dict:
    """
    兼容旧签名：无任务上下文时无法做「无年代号 + 企标发布年」推断，仅按完整号走谱系或主表。
    """
    std_code = (std_code or "").strip()
    if not std_code:
        return {
            "query_bz_id": "",
            "is_latest": True,
            "current_latest_id": "",
            "current_latest_std_codes": [],
            "pedigree_chain": "",
            "resolution_path": "empty",
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "historical_full_std_code": None,
        }
    if not is_mysql():
        return {
            "query_bz_id": std_code,
            "is_latest": True,
            "current_latest_id": std_code,
            "current_latest_std_codes": [std_code],
            "pedigree_chain": "sqlite_dev_stub",
            "resolution_path": "sqlite_stub",
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "historical_full_std_code": std_code.strip() or None,
        }
    latest_blob, ped_id, part_chain = _fetch_pedigree_row(std_code)
    primary = _first_latest_std_token(latest_blob) or std_code
    if latest_blob or part_chain:
        pc_disp = _truncate_part_chain_for_display(str(part_chain or ""))
        return {
            "query_bz_id": std_code,
            "is_latest": True,
            "current_latest_id": primary,
            "current_latest_std_codes": _current_latest_codes_for_pedigree_hit(latest_blob, primary),
            "pedigree_chain": pc_disp or (f"ped_id={ped_id}" if ped_id else ""),
            "resolution_path": "pedigree_direct_legacy_call",
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "pedigree_anchor_std_code": std_code,
            "latest_std_code_raw": latest_blob,
            "historical_full_std_code": std_code.strip() or None,
        }
    if stsc_catalog_read.use_stsc_l1_catalog():
        code, _name, ped = stsc_catalog_read.fetch_std_base_row(std_code)
        row = (code, _name, ped) if code else None
    else:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT std_code, std_name, ped_id FROM national_standard_basic WHERE std_code = %s LIMIT 1",
                [std_code],
            )
            row = cursor.fetchone()
    if not row:
        return {
            "query_bz_id": std_code,
            "is_latest": False,
            "current_latest_id": std_code,
            "current_latest_std_codes": [std_code],
            "pedigree_chain": "未在谱系表与国标主表找到该号",
            "resolution_path": "miss",
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "historical_full_std_code": None,
        }
    code, _name, ped = row[0], row[1], row[2] or ""
    c = (code or "").strip()
    return {
        "query_bz_id": std_code,
        "is_latest": True,
        "current_latest_id": code,
        "current_latest_std_codes": [c] if c else [],
        "pedigree_chain": f"ped_id={ped}" if ped else "无谱系扩展信息",
        "resolution_path": "national_basic_only_legacy_call",
        "inferred_historical_std_code": None,
        "enterprise_as_of_year": None,
        "historical_full_std_code": std_code.strip() or None,
    }


def list_latest_side_std_codes_for_task(subject_code: str) -> list[str]:
    """n+m：主映射行 latest_std_code 非空 + 补充行（referenced_std_code 为空且 latest_std_code 非空）。"""
    from apps.core import regulation_subject as reg

    if not subject_code or not is_mysql():
        return []
    with connection.cursor() as cursor:
        anchor_id = reg.get_enterprise_anchor_id(cursor, subject_code)
        if anchor_id is None:
            return []
        return reg.list_latest_std_codes_for_anchor(cursor, anchor_id)
