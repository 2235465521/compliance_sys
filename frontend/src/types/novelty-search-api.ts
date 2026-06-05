/** 查新服务 API 契约（snake_case，与 docs/frontend-novelty-search-API-对接说明-2026.md 对齐） */

export type NoveltyTaskStatusApi =
  | 'queued'
  | 'loading_history'
  | 'parsing'
  | 'pending_confirm'
  | 'comparing'
  | 'completed'
  | 'failed'

export type NoveltyTaskSourceApi = 'upload' | 'form' | 'national'

export type NoveltyRowConclusionApi =
  | 'unchanged'
  | 'updated'
  | 'first_record'
  | 'unresolved'
  | 'not_assessable'

export type NoveltyTaskConclusionApi =
  | 'has_updates'
  | 'all_unchanged'
  | 'partial'
  | 'pending'
  | 'empty_history'

export type NoveltyReportStateApi = 'none' | 'generating' | 'ready' | 'failed'

export interface ReferenceSheetRowApi {
  id: string
  std_no: string
  std_name: string
  tech_fragment?: string | null
  remark?: string | null
}

export interface NoveltyCompareRowApi {
  id: string
  sheet_row_id: string
  referenced_std_code: string
  full_std_at_publication?: string | null
  baseline_latest_std_primary?: string | null
  current_latest_std_primary?: string | null
  row_conclusion: NoveltyRowConclusionApi
  row_conclusion_label: string
  compliance_assessable?: boolean
  explanation?: string | null
  baseline_source?: 'compliance' | 'batch' | null
  baseline_recorded_at?: string | null
}

export interface SourceEvaluationApi {
  source_type: 'compliance' | 'batch'
  source_id: number
  evaluated_at: string
  title: string
}

export interface NoveltyEnterpriseIndicatorApi {
  name?: string
  value?: string
  indicator_name?: string
  indicator_value?: string
  source?: string
  source_id?: number
}

export interface NoveltyIndicatorsApi {
  enterprise_indicators: NoveltyEnterpriseIndicatorApi[]
  national_by_std_code: Record<string, unknown[]>
  source_evaluations: SourceEvaluationApi[]
}

export interface NoveltyTaskOutApi {
  id: number | string
  title: string
  qb_code: string
  enterprise_name?: string | null
  status: NoveltyTaskStatusApi
  source: NoveltyTaskSourceApi
  file_name?: string | null
  sheet_confirmed: boolean
  task_conclusion?: NoveltyTaskConclusionApi | null
  task_summary?: string | null
  error_summary?: string | null
  compare_done: number
  compare_total: number
  report_state: NoveltyReportStateApi
  report_generated_at?: string | null
  reference_sheet: ReferenceSheetRowApi[]
  compare_rows: NoveltyCompareRowApi[]
  source_evaluations?: SourceEvaluationApi[]
  indicators_available?: boolean
  created_at: string
  updated_at: string
}

export interface NoveltyTaskSummaryOutApi {
  id: number | string
  title: string
  qb_code: string
  status: NoveltyTaskStatusApi
  source: NoveltyTaskSourceApi
  task_conclusion?: NoveltyTaskConclusionApi | null
  task_summary?: string | null
  error_summary?: string | null
  created_at: string
  updated_at: string
}

export interface NoveltyTaskListPageApi {
  results: NoveltyTaskSummaryOutApi[]
  total: number
  page: number
  page_size: number
}

export interface PatchReferenceSheetBodyApi {
  rows: ReferenceSheetRowApi[]
}

export interface NoveltyModuleMetaApi {
  module: string
  requirement_section?: string
  scope?: string
}
