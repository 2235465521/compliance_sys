/** 预警模块 HTTP 契约（与 docs/backend-warnings-API-前端对接手册.md 对齐） */

export type WarningTaskConclusionApi =
  | 'need_attention'
  | 'all_ok'
  | 'empty_history'
  | 'pending'
  | 'partial'

export type WarningRowConclusionApi =
  | 'unchanged'
  | 'updated'
  | 'first_record'
  | 'unresolved'
  | 'not_assessable'

export interface WarningCompareRowApi {
  id?: string
  referenced_std_code: string
  full_std_at_publication?: string | null
  baseline_latest_std?: string | null
  current_latest_std?: string | null
  row_conclusion: WarningRowConclusionApi
  row_conclusion_label?: string
  explanation?: string | null
}

export interface WarningSourceEvaluationApi {
  source_type: 'compliance' | 'batch'
  evaluated_at?: string
  job_id?: string
}

export interface ForwardWarningResponseApi {
  qb_code: string
  enterprise_name?: string | null
  task_conclusion: WarningTaskConclusionApi
  task_summary?: string | null
  compare_rows: WarningCompareRowApi[]
  source_evaluations?: WarningSourceEvaluationApi[]
}

export interface ReverseGbNoveltyApi {
  input_bz: string
  latest_bz: string
  gb_updated?: boolean
  status_label?: string
}

export interface ReverseAffectedEnterpriseApi {
  qb_code: string
  enterprise_name?: string | null
  enterprise_need_modify?: boolean
  enterprise_conclusion_label?: string
  summary?: string | null
}

export interface ReverseWarningResponseApi {
  task_conclusion?: WarningTaskConclusionApi
  task_summary?: string | null
  gb_novelty?: ReverseGbNoveltyApi
  /** 旧版：字符串数组 */
  affected_enterprises?: (string | ReverseAffectedEnterpriseApi)[]
  input_bz?: string
  latest_bz?: string
  is_safe?: boolean
}

export interface WarningsActiveScanApi {
  job_id: string
  status: 'running' | 'paused'
  processed_count: number
  total_count: number
  current_qb_code: string | null
  /** not_scanned | all_ok | null */
  phase: string | null
  pause_requested?: boolean
  not_scanned_count: number
  need_attention_count: number
  all_ok_count: number
  no_eval_record_count: number
}

export interface MonitorSummaryApi {
  last_scan_at?: string | null
  total_evaluated_qb: number
  need_attention_count: number
  /** 含 all_ok + partial */
  all_ok_count: number
  no_eval_record_count: number
  not_scanned_count: number
  /** 兼容旧前端，等于 not_scanned_count */
  pending_count?: number
  /** 存在 running/paused 巡检时返回 */
  active_scan?: WarningsActiveScanApi | null
}

/** 监控列表筛选，与 GET /warnings/monitor/enterprises/ 的 status 一致 */
export type MonitorEnterpriseListStatusApi =
  | 'all'
  | 'need_attention'
  | 'all_ok'
  | 'no_eval_record'
  | 'not_scanned'

export type MonitorEnterpriseMonitorStatusApi =
  | 'need_attention'
  | 'all_ok'
  | 'partial'
  | 'no_eval_record'
  | 'not_scanned'

export interface MonitorEnterpriseListItemApi {
  qb_code: string
  enterprise_name?: string | null
  /** 与 monitor_status 分类一致；列表展示优先 monitor_status */
  monitor_status?: MonitorEnterpriseMonitorStatusApi
  task_conclusion: WarningTaskConclusionApi
  task_summary?: string | null
  last_checked_at?: string | null
}

export interface MonitorEnterpriseListPageApi {
  items: MonitorEnterpriseListItemApi[]
  total: number
}

export interface WarningsScanResponseApi {
  success?: boolean
  message?: string
  job_id?: string
  processed_count?: number
  /** 本轮巡检队列长度（尚未巡检 + 状态良好） */
  total_count?: number
}

/** 监控列表行 task_conclusion（勿再依赖 empty_history） */
export type MonitorEnterpriseConclusionApi =
  | 'need_attention'
  | 'all_ok'
  | 'partial'
  | 'not_scanned'
  | 'no_eval_record'
