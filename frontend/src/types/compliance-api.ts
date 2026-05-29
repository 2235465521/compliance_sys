/** 新后端 `/api/v1/compliance` 契约（见 docs/backend-compliance-API-前端对接手册.md） */

export type ParseStatus = 'pending' | 'running' | 'completed' | 'failed' | string

export interface ComplianceTaskOut {
  id: number
  qb_code: string | null
  current_step: number
  status: string
  uploaded_file_name: string | null
  has_parse_result: boolean
  parse_status: ParseStatus
  parse_error: string | null
}

export interface ModuleMetaOut {
  module: string
  requirement_section: string
  scope: string
}

export interface Step1Out {
  task: ComplianceTaskOut
  parse_result: Record<string, unknown> | null
}

export interface Step1ConfirmIn {
  qb_code: string
  qb_name?: string | null
  company_name?: string | null
}

export interface ReferenceRowIn {
  referenced_std_code: string | null
  latest_std_code: string | null
}

/** `GET .../step/2` 中 suggested_references 单项（含解析扩展字段） */
export interface Step2SuggestedReferenceRow {
  referenced_std_code: string | null
  latest_std_code: string | null
  has_year?: boolean | null
  full_text?: string | null
}

export interface Step2Out {
  task: ComplianceTaskOut
  suggested_references: Step2SuggestedReferenceRow[]
  indicators: Array<Record<string, unknown>>
}

export interface Step2ConfirmIn {
  indicator_set?: Array<Record<string, unknown>>
  references?: ReferenceRowIn[]
}

/**
 * `GET .../step/3/reference-latest` 单行（归一化后字段名）。
 * 后端推荐阅读别名：referenced_std_code、full_std_at_publication、pedigree_lookup_std_code、
 * latest_std_codes、latest_std_primary —— 解析时写入下列同义字段。
 */
export interface ReferenceLatestRow {
  /** = referenced_std_code（审核后引用标准号） */
  query_bz_id: string
  /**
   * 与 `citation_matches_latest` 同义（2026-05）：补全后的发布时点标准与现行查新侧是否一致。
   * 解析时优先读接口的 `citation_matches_latest`。
   */
  is_latest: boolean
  /** 是否参与整文件自动合规强结论；false 时 `citation_matches_latest` 应为 null（2026-05 精简结构） */
  compliance_assessable?: boolean
  /** `true`/`false`：可比对；`null`：不可自动比对（与 assessable false 一致） */
  citation_matches_latest?: boolean | null
  /** = latest_std_primary（主展示现行号） */
  current_latest_id: string
  pedigree_chain: string
  id?: number
  /** = latest_std_codes（谱系拆分后的全部现行号） */
  current_latest_std_codes?: string[]
  resolution_path?: string | null
  enterprise_as_of_year?: number | null
  inferred_historical_std_code?: string | null
  /** = full_std_at_publication（企标发布时点完整国标；无年号且推断失败为 null） */
  historical_full_std_code?: string | null
  /** = pedigree_lookup_std_code（查 standard_pedigree 的锚点完整号） */
  pedigree_anchor_std_code?: string | null
  latest_std_code_raw?: string | null
}

export interface SupplementRowIn {
  latest_std_code: string
}

export interface SupplementsBodyIn {
  rows: SupplementRowIn[]
}

export interface Step3ConfirmIn {
  rows: Array<Record<string, unknown>>
}

export interface MissingGbFileItem {
  std_code: string
  std_name: string | null
  reason: string
}

export interface Step4IndicatorsOut {
  qb_code: string | null
  enterprise_indicators: unknown[]
  national_by_std_code: Record<string, unknown[]>
  missing_gb_files: MissingGbFileItem[]
  dify2_invoked_std_codes: string[]
}

/** 第五步 ③ 可对比标准一行（发布完整号 | 最新标准号） */
export interface ComparePairIn {
  publication_std_code: string | null
  latest_std_code: string
}

export interface Step4IndicatorsEnsureIn {
  compare_pairs: ComparePairIn[]
}

export type StdCodeOrchestrationStatusKind = 'ready' | 'parsed_via_dify2' | 'missing_file'

export interface StdCodeOrchestrationStatus {
  std_code: string
  std_name: string | null
  status: StdCodeOrchestrationStatusKind
  indicator_count: number
  reason?: string | null
}

/** POST .../step/4/indicators/ensure 响应（在 Step4IndicatorsOut 上扩展） */
export interface Step4IndicatorsEnsureOut extends Step4IndicatorsOut {
  all_ready: boolean
  std_statuses: StdCodeOrchestrationStatus[]
  /** N 侧发布时引用标准号（由 compare_pairs 派生，不含 M） */
  publication_std_codes?: string[]
  /** N+M 侧最新标准号（含补充 M） */
  latest_std_codes?: string[]
}

/** POST .../step/5/compare 可选请求体（构建时带上当前 ③ compare_pairs） */
export interface Step5CompareIn {
  compare_pairs?: ComparePairIn[]
}

/** 国标指标库单行（`national_standard_indicator`） */
export interface NationalIndicatorRowOut {
  id: number
  std_code: string
  specific_indicator_value: string
  manual_review_status: 'pending' | 'approved' | 'rejected' | null
  std_name?: string | null
}

export interface NationalIndicatorListOut {
  std_code: string
  std_name: string | null
  rows: NationalIndicatorRowOut[]
}

export interface NationalIndicatorReviewIn {
  manual_review_status: 'pending' | 'approved' | 'rejected'
}

export interface NationalIndicatorReviewOut {
  id: number
  std_code: string
  manual_review_status: string
}

export interface NationalIndicatorSaveIn {
  std_code: string
  specific_indicator_value: string
}

export interface NationalIndicatorSaveOut {
  id: number
  std_code: string
  specific_indicator_value: string
  manual_review_status: 'pending' | 'approved' | 'rejected' | null
}

export interface Step5CompareOut {
  compare_result: Record<string, unknown>
}

export interface ArtifactItem {
  kind: string
  label: string
  path: string
}

export interface ArtifactsListOut {
  artifacts: ArtifactItem[]
}

export interface SummaryOut {
  task: ComplianceTaskOut
  evaluation_result: Record<string, unknown> | null
  artifacts: ArtifactItem[]
}

export interface NationalStandardUploadOut {
  std_file_path: string
}
