"""从 Dify 批量工作流 `parse_result_json` 中抽取企标展示字段（多键名容错）。"""

from __future__ import annotations

from typing import Any


def _pick_str(pr: dict[str, Any], *keys: str) -> str | None:
    for k in keys:
        v = pr.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return None


def enterprise_fields_from_parse_result(parse_result: dict[str, Any] | None) -> dict[str, str | None]:
    """
    返回与 ``BatchNormativeRefItemOut`` 对齐的扁平字段；无数据时各值为 ``None``。

    键名覆盖常见 Dify 输出 / 中文别名，便于不同工作流版本兼容。
    """
    if not isinstance(parse_result, dict):
        parse_result = {}
    pr = dict(parse_result)
    keya = pr.pop("keya", None)
    if isinstance(keya, dict):
        pr = {**keya, **pr}
    return {
        "company_name": _pick_str(
            pr,
            "company_name",
            "enterprise_name",
            "company",
            "企业名称",
            "公司名称",
            "manufacturer",
            "org_name",
            "enterprise_org_name",
        ),
        "qb_name": _pick_str(pr, "qb_name", "qibiao_name", "企标名称", "enterprise_qb_short_name", "short_name"),
        "enterprise_standard_name": _pick_str(
            pr,
            "enterprise_standard_name",
            "std_full_name",
            "标准名称",
            "full_standard_name",
            "备案名称",
        ),
        "qb_code": _pick_str(
            pr, "qb_code", "qb_id", "qibiao_code", "企标号", "企标编号", "enterprise_std_code", "enterprise_qb_code"
        ),
        "qb_title": _pick_str(pr, "qb_title", "standard_title", "title", "标准标题", "企标标题"),
        "standard_name": _pick_str(pr, "standard_name", "std_name", "标准名", "standard_name_cn"),
        "implementation_date": _pick_str(
            pr,
            "implementation_date",
            "impl_date",
            "实施日期",
            "enterprise_implementation_date",
        ),
        "effective_date": _pick_str(pr, "effective_date", "生效日期", "enterprise_effective_date"),
        "publish_date": _pick_str(
            pr,
            "publish_date",
            "release_date",
            "qibiao_release_date",
            "enterprise_release_date",
            "发布日期",
            "qb_publish_date",
        ),
    }
