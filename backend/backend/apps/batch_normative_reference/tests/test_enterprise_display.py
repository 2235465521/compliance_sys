from __future__ import annotations

from apps.batch_normative_reference.enterprise_display import enterprise_fields_from_parse_result


def test_enterprise_fields_from_flat_parse_result() -> None:
    pr = {
        "公司名称": "A公司",
        "企标名称": "速冻",
        "企标编号": "Q/001",
        "备案名称": "备案全名",
        "发布日期": "2024-01-01",
        "实施日期": "2024-06-01",
        "生效日期": "2024-03-01",
    }
    out = enterprise_fields_from_parse_result(pr)
    assert out["company_name"] == "A公司"
    assert out["qb_name"] == "速冻"
    assert out["qb_code"] == "Q/001"
    assert out["enterprise_standard_name"] == "备案全名"
    assert out["publish_date"] == "2024-01-01"
    assert out["implementation_date"] == "2024-06-01"
    assert out["effective_date"] == "2024-03-01"


def test_enterprise_fields_nested_keya() -> None:
    pr = {"keya": {"公司名称": "B公司", "企标名称": "产品"}}
    out = enterprise_fields_from_parse_result(pr)
    assert out["company_name"] == "B公司"
    assert out["qb_name"] == "产品"


def test_enterprise_fields_non_dict_returns_nulls() -> None:
    keys = (
        "company_name",
        "qb_name",
        "enterprise_standard_name",
        "qb_code",
        "qb_title",
        "standard_name",
        "implementation_date",
        "effective_date",
        "publish_date",
    )
    assert enterprise_fields_from_parse_result(None) == {k: None for k in keys}
