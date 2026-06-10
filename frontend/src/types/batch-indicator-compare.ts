/** 批量指标对比 — `/api/v1/batch-indicator-compare`（见 docs/backend-batch-indicator-compare-API-前端对接手册.md） */

import type { MissingGbFileItem, StdCodeOrchestrationStatus } from '@/types/compliance-api'

export type BatchIndicatorCompareJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type BatchIndicatorCompareItemStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface BatchIndicatorCompareAuditEntry {
  at: string
  actor?: string | null
  action: string
  payload?: Record<string, unknown> | null
}

export interface BatchIndicatorCompareEnsureSummary {
  all_ready: boolean
  missing_gb_files?: MissingGbFileItem[]
  std_statuses?: StdCodeOrchestrationStatus[]
}

export interface BatchIndicatorCompareEnterpriseIndicator {
  name?: string
  value?: string
  indicator_name?: string
  indicator_value?: string
  [key: string]: unknown
}

export interface BatchIndicatorCompareResultOut {
  summary?: string | null
  markdown?: string | null
  details?: unknown
  [key: string]: unknown
}

export interface BatchIndicatorCompareItemOut {
  id: number
  source_batch_job_id: number
  source_batch_item_id: number
  subject_code?: string | null
  subject_name?: string | null
  company_name?: string | null
  original_filename?: string | null
  indicator_compare_status: BatchIndicatorCompareItemStatus
  skip_reason?: string | null
  error_message?: string | null
  latest_std_codes?: string[] | null
  enterprise_indicators?: BatchIndicatorCompareEnterpriseIndicator[] | null
  ensure_summary?: BatchIndicatorCompareEnsureSummary | null
  compare_result?: BatchIndicatorCompareResultOut | null
  audit_log?: BatchIndicatorCompareAuditEntry[] | null
  compared_at?: string | null
  workflow_metadata?: Record<string, unknown> | null
}

export interface BatchIndicatorCompareItemSummary {
  id: number
  source_batch_item_id: number
  subject_code?: string | null
  subject_name?: string | null
  original_filename?: string | null
  indicator_compare_status: BatchIndicatorCompareItemStatus
  skip_reason?: string | null
  error_message?: string | null
  compare_summary?: string | null
}

export interface BatchIndicatorCompareJobOut {
  id: number
  status: BatchIndicatorCompareJobStatus
  source_batch_job_id: number
  label?: string | null
  created_by?: string | null
  created_at: string
  updated_at?: string | null
  total_items: number
  completed_items: number
  failed_items: number
  skipped_items: number
  error_summary?: string | null
  items: BatchIndicatorCompareItemSummary[]
}

export type BatchIndicatorCompareJobSummary = Pick<
  BatchIndicatorCompareJobOut,
  | 'id'
  | 'status'
  | 'source_batch_job_id'
  | 'label'
  | 'created_by'
  | 'created_at'
  | 'updated_at'
  | 'total_items'
  | 'completed_items'
  | 'failed_items'
  | 'skipped_items'
  | 'error_summary'
>

export interface BatchIndicatorCompareJobListPage {
  results: BatchIndicatorCompareJobSummary[]
  total: number
  page: number
  page_size: number
}

export interface CreateBatchIndicatorCompareJobIn {
  source_batch_job_id: number
  source_item_ids?: number[]
  label?: string | null
}

export interface PatchBatchIndicatorCompareItemIn {
  enterprise_indicators?: BatchIndicatorCompareEnterpriseIndicator[]
  supplement_latest_std_codes?: string[]
  rerun?: boolean
}

export interface BatchIndicatorCompareModuleMetaOut {
  module: string
  requirement_section?: string
  scope?: string
}
