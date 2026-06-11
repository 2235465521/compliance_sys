from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ComplianceTaskOut(BaseModel):
    id: int = Field(
        ...,
        description="任务主键；后续 /compliance/evaluations/{task_id}/... 路径中的 task_id 必须使用本值（勿沿用文档示例中的任意数字）。",
    )
    catalog_std_type_no: str | None = Field(
        default=None,
        description="企标为 null；与 subject_code 组成锚表键",
    )
    subject_code: str | None = None
    subject_name: str | None = None
    company_name: str | None = None
    current_step: int = 1
    status: str = "active"
    uploaded_file_name: str | None = None
    has_parse_result: bool = False
    parse_status: str = Field(
        default="completed",
        description="企标解析：pending / running / completed / failed（异步或同步路径均会更新）",
    )
    parse_error: str | None = Field(default=None, description="解析失败时的错误摘要")
    has_compare_result: bool = False
    compare_result_updated_at: str | None = None
    step4_indicators_confirmed: bool = False
    step5_compare_confirmed: bool = False
    updated_at: str | None = None
    progress_percent: int = 0
    step_label: str = "步骤 1/6"
    display_status: str = Field(
        default="draft",
        description="任务中心展示状态：draft / in_progress / completed / failed",
    )


class ComplianceTaskListOut(BaseModel):
    items: list[ComplianceTaskOut] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20


class Step1ConfirmIn(BaseModel):
    subject_code: str
    subject_name: str | None = None
    company_name: str | None = None


class ReferenceRowIn(BaseModel):
    referenced_std_code: str | None = None
    latest_std_code: str | None = None


class Step2ConfirmIn(BaseModel):
    indicator_set: list[dict[str, Any]] = Field(default_factory=list)
    references: list[ReferenceRowIn] = Field(default_factory=list)


class SupplementRowIn(BaseModel):
    latest_std_code: str = Field(..., description="补充的最新标准号；referenced 为空表示纯补充行")


class SupplementsBodyIn(BaseModel):
    rows: list[SupplementRowIn] = Field(default_factory=list)


class Step3ConfirmIn(BaseModel):
    """审核 3：逐行人工结论；与 regulation_normative_reference_mapping.manual_review_status 对齐。"""

    rows: list[dict[str, Any]] = Field(
        default_factory=list,
        description="每项含 id（映射行主键）与 manual_review_status 等",
    )


class MissingGbFileItem(BaseModel):
    std_code: str
    std_name: str | None = None
    reason: Literal["empty_std_file_path", "file_not_found"]


class Step4IndicatorsOut(BaseModel):
    """步骤 4 编排结果：可返回部分指标 + 缺文件清单。"""

    subject_code: str | None
    enterprise_indicators: list[dict[str, Any]] = Field(default_factory=list)
    national_by_std_code: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    missing_gb_files: list[MissingGbFileItem] = Field(default_factory=list)
    dify2_invoked_std_codes: list[str] = Field(default_factory=list)


class ComparePairIn(BaseModel):
    """与前端 ③ 查新表一行对应：发布完整号 + 最新标准号。"""

    publication_std_code: str | None = Field(
        default=None,
        description="发布时引用的完整标准号（N 侧）；M 补充行为 null",
    )
    latest_std_code: str = Field(..., description="最新标准号（N+M 侧）")


class Step4IndicatorsEnsureIn(BaseModel):
    compare_pairs: list[ComparePairIn] = Field(..., min_length=1)
    target_std_codes: list[str] | None = Field(
        default=None,
        description="本次仅对这些标准号调用 Dify 解析入库；须在 compare_pairs 展开集合内。不传则只刷新状态、不触发 Dify。",
    )


class StdCodeOrchestrationStatus(BaseModel):
    std_code: str
    std_name: str | None = None
    status: Literal["ready", "parsed_via_dify2", "missing_file", "pending_parse", "parse_failed"]
    indicator_count: int = 0
    reason: Literal["empty_std_file_path", "file_not_found"] | None = None
    error_message: str | None = Field(default=None, description="parse_failed 时最近一次 Dify 错误摘要")


class NationalStandardUploadOut(BaseModel):
    std_code: str
    std_file_path: str
    replaced: bool = Field(description="是否覆盖了已有文件路径")
    indicators_cleared: bool = Field(description="是否已清除该标准号旧指标，便于重新解析")
    message: str = Field(default="文件已保存，可更换文件后再次上传；请调用 ensure 并传入 target_std_codes 解析")


class Step4IndicatorsEnsureOut(Step4IndicatorsOut):
    all_ready: bool = Field(description="compare_pairs 展开的全部标准号均为 ready 时为 true")
    std_statuses: list[StdCodeOrchestrationStatus] = Field(default_factory=list)
    publication_std_codes: list[str] = Field(
        default_factory=list,
        description="N 侧发布时点标准号（不含 M 补充行 publication=null）",
    )
    latest_std_codes: list[str] = Field(
        default_factory=list,
        description="N+M 最新侧标准号（含补充 M）",
    )


class Step5CompareIn(BaseModel):
    """可选：构建对比前按当前 ③ 表格刷新编排。"""

    compare_pairs: list[ComparePairIn] | None = Field(
        default=None,
        description="非空时先执行与 ensure 相同的编排并刷新 indicator_bundle_json",
    )


ManualReviewStatus = Literal["pending", "approved", "rejected"]


class NationalIndicatorRowOut(BaseModel):
    id: int
    std_code: str
    specific_indicator_value: str | None = None
    manual_review_status: ManualReviewStatus | None = None


class NationalIndicatorListOut(BaseModel):
    std_code: str
    std_name: str | None = None
    rows: list[NationalIndicatorRowOut] = Field(default_factory=list)


class NationalIndicatorReviewIn(BaseModel):
    std_code: str = Field(..., min_length=1)
    manual_review_status: ManualReviewStatus


class NationalIndicatorReviewOut(BaseModel):
    id: int
    std_code: str
    manual_review_status: ManualReviewStatus | None = None


class NationalIndicatorSaveIn(BaseModel):
    std_code: str = Field(..., min_length=1)
    specific_indicator_value: str = Field(
        ...,
        min_length=1,
        description="indexes 数组的 JSON 字符串（已序列化）",
    )


class NationalIndicatorSaveOut(BaseModel):
    id: int
    std_code: str
    specific_indicator_value: str
    manual_review_status: ManualReviewStatus | None = None


class Step5CompareOut(BaseModel):
    compare_result: dict[str, Any] = Field(default_factory=dict)


class ArtifactItem(BaseModel):
    kind: str
    label: str
    path: str
    content_type: str | None = None


class SummaryOut(BaseModel):
    task: dict[str, Any]
    evaluation_result: dict[str, Any] | None = None
    artifacts: list[ArtifactItem] = Field(default_factory=list)
    report_path: str | None = Field(
        default=None,
        description="自动生成的 HTML 汇总报告（相对 MEDIA_ROOT），可用 artifacts/file 或 /report 下载",
    )
