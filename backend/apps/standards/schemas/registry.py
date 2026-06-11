from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class StandardListItemOut(BaseModel):
    """标准列表行：字段均来自 `national_standard_basic`；JSON 使用 camelCase 别名便于前端表格绑定。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: int
    bz_id: str = Field(serialization_alias="bzId", description="标准号，对应 std_code")
    bz_name: str | None = Field(None, serialization_alias="bzName")
    bz_release_date: date | None = Field(
        None,
        serialization_alias="bzReleaseDate",
        description="发布日期，对应 publish_date",
    )
    implement_time: date | None = Field(
        None,
        serialization_alias="implementTime",
        description="实施日期，对应 effective_date",
    )
    ex_state: str | None = Field(
        None, serialization_alias="exState", description="执行状态，对应 std_status"
    )
    replace_bz_id: str | None = Field(
        None,
        serialization_alias="replaceBzId",
        description="代替标准，对应 replaces_std_code",
    )
    tree_id: str | None = Field(None, serialization_alias="treeId")
    std_category: str | None = Field(
        None, serialization_alias="stdCategory", description="标准类别，对应 std_category"
    )
    ccs_code: str | None = Field(None, serialization_alias="ccsCode")
    ics_code: str | None = Field(None, serialization_alias="icsCode")
    abolition_date: date | None = Field(
        None, serialization_alias="abolitionDate", description="废止日期"
    )
    replace_type: str | None = Field(
        None, serialization_alias="replaceType", description="代替类型"
    )


class StandardPaginatedOut(BaseModel):
    """与 DRF PageNumberPagination 常见字段对齐。"""

    count: int
    next: str | None = None
    previous: str | None = None
    results: list[StandardListItemOut]


class StandardExtensionOut(BaseModel):
    responsible_unit: str | None = None
    secondary_responsible_unit: str | None = None
    issuing_department: str | None = None
    executing_unit: str | None = None
    technical_committee: str | None = None
    governing_department: str | None = None
    adoption_status: str | None = None
    drafting_unit: str | None = None
    drafter: str | None = None


class StandardExtensionPatchIn(BaseModel):
    """扩展表增量更新；未出现的字段不改。"""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    responsible_unit: str | None = Field(None, alias="responsibleUnit")
    secondary_responsible_unit: str | None = Field(None, alias="secondaryResponsibleUnit")
    issuing_department: str | None = Field(None, alias="issuingDepartment")
    executing_unit: str | None = Field(None, alias="executingUnit")
    technical_committee: str | None = Field(None, alias="technicalCommittee")
    governing_department: str | None = Field(None, alias="governingDepartment")
    adoption_status: str | None = Field(None, alias="adoptionStatus")
    drafting_unit: str | None = Field(None, alias="draftingUnit")
    drafter: str | None = None


class StandardPatchIn(BaseModel):
    """国标主表 + 扩展表局部更新；不改变 `std_code`（谱系边以国标号为键）。"""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    std_name: str | None = Field(None, alias="stdName")
    std_status: str | None = Field(None, alias="stdStatus")
    ex_state: str | None = Field(None, alias="exState")
    publish_date: date | None = Field(None, alias="publishDate")
    effective_date: date | None = Field(None, alias="effectiveDate")
    abolition_date: date | None = Field(None, alias="abolitionDate")
    std_category: str | None = Field(None, alias="stdCategory")
    replaces_std_code: str | None = Field(None, alias="replacesStdCode")
    replace_type: str | None = Field(None, alias="replaceType")
    ccs_code: str | None = Field(None, alias="ccsCode")
    ics_code: str | None = Field(None, alias="icsCode")
    ped_id: str | None = Field(None, alias="pedId")
    detail_url: str | None = Field(None, alias="detailUrl")
    std_file_path: str | None = Field(None, alias="stdFilePath")
    extension: StandardExtensionPatchIn | None = None


class StandardDetailOut(BaseModel):
    id: int
    bz_id: str = Field(description="国标号，与列表 bz_id 一致（std_code）")
    bz_name: str | None = None
    ex_state: str | None = None
    std_code: str
    std_name: str | None = None
    std_status: str | None = None
    publish_date: date | None = None
    effective_date: date | None = None
    abolition_date: date | None = None
    std_category: str | None = None
    replaces_std_code: str | None = None
    replace_type: str | None = None
    ccs_code: str | None = None
    ics_code: str | None = None
    ped_id: str | None = None
    detail_url: str | None = None
    std_file_path: str | None = None
    extension: StandardExtensionOut | None = None


class StatusCountItem(BaseModel):
    """库表 std_status 原始取值及条数（Excel 原文可能略有差异）。"""

    status: str
    count: int


class StatusGroupItem(BaseModel):
    """按业务语义归类，便于前端卡片与占比（基于 std_status 文本关键词）。"""

    key: str = Field(description="abolished | current | upcoming | other")
    label: str = Field(description="废止 | 现行 | 即将实施 | 其它")
    count: int
    ratio: float = Field(description="占总条数百分比 0–100，保留两位小数")


class YearCountItem(BaseModel):
    year: int
    count: int


class StandardStatisticsData(BaseModel):
    """统计体：标准类型分布 types 仅按库字段 std_category 聚合；states 为状态语义分组。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    total: int = Field(description="national_standard_basic 全表行数")
    types: dict[str, int] = Field(
        default_factory=dict,
        description="标准类型分布：按 std_category 分组计数（饼图）；无类别时可能为空对象",
    )
    states: dict[str, int] = Field(
        default_factory=dict,
        description="现行/废止/即将实施/其它 条数（与大屏 states 一致）",
    )
    status_groups: list[StatusGroupItem] = Field(
        serialization_alias="statusGroups",
        description="分组及占比（新前端可用）",
    )
    by_status: list[StatusCountItem] = Field(
        serialization_alias="byStatus",
        description="按 std_status 原始值聚合",
    )
    by_publish_year: list[YearCountItem] = Field(
        serialization_alias="byPublishYear",
    )


class ApiEnvelopeStatistics(BaseModel):
    """前端图表：约定 code === 200 且 data 为统计体。"""

    model_config = ConfigDict(serialize_by_alias=True)

    code: int = 200
    data: StandardStatisticsData


class BatchImportOut(BaseModel):
    imported: int = Field(description="新建条数")
    updated: int = Field(description="按 std_code 覆盖更新条数（仅 on_duplicate=update）")
    rejected_duplicates: int = Field(
        0,
        serialization_alias="rejectedDuplicates",
        description="国标号已存在被拒绝的行数（on_duplicate=reject）",
    )
    errors: list[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class StdIndexImportOut(BaseModel):
    """国标指标入库结果。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    bz_id: str = Field(serialization_alias="bzId", description="Dify 返回的国标号")
    imported: int = Field(description="写入 national_standard_indicator 的行数")
    skipped: int = Field(0, description="因国标号不存在被跳过的行数")
    warning: str | None = Field(None, description="非致命警告（如国标号不存在）")
    indexes_count: int = Field(
        0,
        serialization_alias="indexesCount",
        description="Dify 返回的 indexes 数组长度",
    )


class StdIndexBatchTaskOut(BaseModel):
    """批量入库中单个文件的状态。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    filename: str
    status: str = Field(description="pending / processing / done / failed")
    result: StdIndexImportOut | None = Field(None, description="完成时的入库结果")
    error: str | None = Field(None, description="失败时的错误信息")


class StdIndexBatchCreateOut(BaseModel):
    """批次创建响应。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    batch_id: str = Field(serialization_alias="batchId")
    total: int = Field(description="本批次文件总数")


class StdIndexBatchStatusOut(BaseModel):
    """批次轮询响应。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    batch_id: str = Field(serialization_alias="batchId")
    status: str = Field(description="running / done")
    total: int
    done_count: int = Field(serialization_alias="doneCount")
    tasks: list[StdIndexBatchTaskOut]


# ---------------------------------------------------------------------------
# 国标指标人工审核
# ---------------------------------------------------------------------------

class StdIndexReviewOut(BaseModel):
    """GET /index-review/ 返回体：当前存储的指标数据供前端渲染审核页。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    record_id: int | None = Field(None, serialization_alias="recordId", description="national_standard_indicator 的行 id，无记录时为 null")
    std_code: str = Field(serialization_alias="stdCode")
    indexes: list[dict] = Field(default_factory=list, description="indexes JSON 数组，每项含 index_name/index_type/index_content")
    manual_review_status: str | None = Field(
        None,
        serialization_alias="manualReviewStatus",
        description="pending / approved / rejected / null",
    )


class StdIndexReviewPutIn(BaseModel):
    """PUT /index-review/ 请求体：前端提交审核后的指标列表。"""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    indexes: list[dict] = Field(description="审核后保留的 indexes 数组（前端删除 / 编辑后的结果）")
    manual_review_status: str = Field(
        "approved",
        alias="manualReviewStatus",
        description="approved（通过）或 rejected（拒绝），默认 approved",
    )


class StdIndexReviewPutOut(BaseModel):
    """PUT /index-review/ 返回体。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    std_code: str = Field(serialization_alias="stdCode")
    indexes_count: int = Field(serialization_alias="indexesCount", description="最终保存的 indexes 条目数")
    manual_review_status: str = Field(serialization_alias="manualReviewStatus")


# ---------------------------------------------------------------------------
# 国标指标入库历史
# ---------------------------------------------------------------------------

class StdIndexImportHistoryItem(BaseModel):
    """历史列表单条记录。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: int
    std_code: str = Field(serialization_alias="stdCode")
    original_filename: str = Field(serialization_alias="originalFilename")
    import_status: str = Field(serialization_alias="importStatus", description="completed / failed")
    indexes_count: int = Field(serialization_alias="indexesCount")
    manual_review_status: str | None = Field(None, serialization_alias="manualReviewStatus")
    error_message: str | None = Field(None, serialization_alias="errorMessage")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


class StdIndexImportHistoryOut(BaseModel):
    """历史列表分页响应。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    count: int
    results: list[StdIndexImportHistoryItem]


# ---------------------------------------------------------------------------
# 国标指标入库批次（Job / Item）
# ---------------------------------------------------------------------------

class StdIndexImportItemOut(BaseModel):
    """批次下单个文件条目。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: int
    sort_order: int = Field(serialization_alias="sortOrder")
    original_filename: str = Field(serialization_alias="originalFilename")
    status: str = Field(description="pending / running / completed / failed / skipped")
    std_code: str | None = Field(None, serialization_alias="stdCode")
    indexes_count: int = Field(0, serialization_alias="indexesCount")
    manual_review_status: str | None = Field(None, serialization_alias="manualReviewStatus")
    error_message: str | None = Field(None, serialization_alias="errorMessage")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


class StdIndexImportJobOut(BaseModel):
    """批次详情（含 items）。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: int
    status: str = Field(description="pending / processing / completed / failed")
    label: str | None = None
    total_items: int = Field(serialization_alias="totalItems")
    completed_items: int = Field(serialization_alias="completedItems")
    failed_items: int = Field(serialization_alias="failedItems")
    error_summary: str | None = Field(None, serialization_alias="errorSummary")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")
    items: list[StdIndexImportItemOut] = Field(default_factory=list)


class StdIndexImportJobSummaryOut(BaseModel):
    """批次列表摘要（不含 items）。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: int
    status: str
    label: str | None = None
    total_items: int = Field(serialization_alias="totalItems")
    completed_items: int = Field(serialization_alias="completedItems")
    failed_items: int = Field(serialization_alias="failedItems")
    error_summary: str | None = Field(None, serialization_alias="errorSummary")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


class StdIndexImportJobApproveAllIn(BaseModel):
    """POST /index-import-jobs/{id}/approve-all/ 请求体（均可选）。"""

    model_config = ConfigDict(populate_by_name=True)

    only_pending: bool = Field(
        True,
        alias="onlyPending",
        description="true 时仅审核 pending/null 的子项；false 时对已完成子项全部重标为 approved",
    )
    manual_review_status: str = Field(
        "approved",
        alias="manualReviewStatus",
        description="approved 或 rejected，默认 approved",
    )


class StdIndexImportJobApproveAllOut(BaseModel):
    """批次一键审核结果。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    job_id: int = Field(serialization_alias="jobId")
    approved_count: int = Field(serialization_alias="approvedCount")
    skipped_count: int = Field(serialization_alias="skippedCount")
    failed_count: int = Field(serialization_alias="failedCount")
    skipped: list[str] = Field(
        default_factory=list,
        description="跳过的 stdCode 或文件名说明",
    )
    failed: list[str] = Field(
        default_factory=list,
        description="失败的 stdCode 及原因摘要",
    )


class StdIndexImportJobListOut(BaseModel):
    """批次列表分页响应。"""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    results: list[StdIndexImportJobSummaryOut]
    count: int
    total: int
    page: int
    page_size: int = Field(serialization_alias="pageSize")


# ---------------------------------------------------------------------------
# 国标指标列表（national_standard_indicator）
# ---------------------------------------------------------------------------

class NationalStandardIndicatorItem(BaseModel):
    """指标列表单行。"""

    id: int
    std_code: str
    indexes: list | None = None
    manual_review_status: str | None = None


class NationalStandardIndicatorListOut(BaseModel):
    """指标列表分页响应。"""

    count: int
    results: list[NationalStandardIndicatorItem]
