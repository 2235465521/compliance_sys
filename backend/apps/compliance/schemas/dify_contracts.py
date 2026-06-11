"""
Dify 工作流 ①②③ 的 JSON 契约草稿（阶段 0 / 阶段 6 冻结前可迭代）。
与 Dify 应用侧字段对齐后，在《Dify 工作流对接冻结清单》中签字锁定。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class DifyParseIndicatorItem(BaseModel):
    """工作流 ① 输出的单条技术指标（示例形状）。"""

    name: str | None = None
    value: str | None = None
    raw: dict[str, Any] | None = None


class DifyWorkflow1ReferenceItem(BaseModel):
    """工作流 ① 引用标准列表中单条（对象形态）。"""

    standard_id: str | None = None
    has_year: bool | None = None
    full_text: str | None = None


class DifyWorkflow1Output(BaseModel):
    """工作流 ①：企标解析 — 落库前校验用结构。"""

    qb_code: str = Field(..., description="企标号")
    qb_name: str | None = Field(None, description="企标名称")
    company_name: str | None = Field(None, description="企业名称")
    publish_date: str | None = Field(
        None,
        description="企标发布日期（Dify 可提供 publish_date / release_date / qibiao_release_date 等，用于无年代号引用时的时点推断）",
    )
    indicators: list[DifyParseIndicatorItem] = Field(default_factory=list)
    referenced_std_codes: list[str] = Field(
        default_factory=list, description="规范性引用标准号列表（与 references_detail 同源摘要）"
    )
    references_detail: list[DifyWorkflow1ReferenceItem] = Field(
        default_factory=list,
        description="规范性引用逐条提取：标准编号、是否含年、原文描述；审核 2 GET 会映射为 suggested_references",
    )


class DifyWorkflow1QBInitIndexRow(BaseModel):
    """Dify 工作流 ① 内嵌 JSON（QB_init_info）中单条指标。"""

    index_name: str | None = None
    key: str | None = None
    value: str | None = None
    index_type: str | None = None


class DifyWorkflow1QBInitInner(BaseModel):
    """Dify 工作流 ① 内嵌结构：与 outputs.QB_init_info 解析后对齐。"""

    qb_id: str | None = Field(None, description="企标号，映射为 qb_code")
    qb_code: str | None = Field(None, description="若与 qb_id 并存则作别名")
    qb_name: str | None = None
    company_name: str | None = None
    qibiao_release_date: str | None = Field(
        None, description="企标发布日期（与 publish_date 映射同源字段之一）"
    )
    indexes: list[DifyWorkflow1QBInitIndexRow] = Field(default_factory=list)
    referenced_std_codes: list[str] | None = None
    references: list[DifyWorkflow1ReferenceItem | str | dict[str, Any]] | None = None


class DifyWorkflow2Input(BaseModel):
    """工作流 ②：国标指标补缺 — 调用前输入。"""

    std_code: str
    national_standard_file_uri: str = Field(
        ..., description="可读文件 URI 或受控存储路径，由 engine 与 Dify 约定"
    )


class DifyWorkflow2OutputRow(BaseModel):
    """工作流 ②：国标 std_code 对应一条 national_standard_indicator，值为 indexes 整数组 JSON。"""

    std_code: str
    specific_indicator_value: str | None = Field(
        None, description="indexes 数组的 JSON 字符串（含 index_name / index_type / index_content）"
    )


class DifyWorkflow2Output(BaseModel):
    """工作流 ②：解析结果批量。"""

    rows: list[DifyWorkflow2OutputRow] = Field(default_factory=list)


class DifyWorkflow3Input(BaseModel):
    """工作流 ③：指标对比 — 调用前输入。"""

    qb_code: str
    enterprise_indicators: list[dict[str, Any]] = Field(default_factory=list)
    national_side_by_std_code: dict[str, list[dict[str, Any]]] = Field(
        default_factory=dict, description="std_code -> 指标行列表"
    )


class DifyWorkflow3Output(BaseModel):
    """工作流 ③：对比结论；后端存 compare_result_json（含 markdown 表格）。"""

    summary: str | None = None
    details: list[dict[str, Any]] = Field(default_factory=list)
    markdown: str | None = Field(None, description="Dify 输出的 Markdown 表格全文")
