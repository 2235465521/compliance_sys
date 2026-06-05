import type { NoveltyRowConclusion } from '@/types/novelty-search'

export type WarningTaskConclusion =
  | 'need_attention'
  | 'all_ok'
  | 'empty_history'
  | 'pending'
  | 'partial'

export interface WarningCompareRow {
  id: string
  referencedStdCode: string
  fullStdAtPublication: string
  baselineLatestStd: string
  currentLatestStd: string
  rowConclusion: NoveltyRowConclusion
  rowConclusionLabel: string
  explanation?: string
}

export interface ForwardWarningResult {
  qbCode: string
  enterpriseName?: string
  taskConclusion: WarningTaskConclusion
  taskSummary?: string
  compareRows: WarningCompareRow[]
}

export interface ReverseGbNovelty {
  inputBz: string
  latestBz: string
  gbUpdated: boolean
  statusLabel?: string
}

export interface ReverseAffectedEnterprise {
  qbCode: string
  enterpriseName?: string
  needModify: boolean
  conclusionLabel: string
  summary?: string
}

export interface ReverseWarningResult {
  taskConclusion: WarningTaskConclusion
  taskSummary?: string
  gbNovelty: ReverseGbNovelty
  enterprises: ReverseAffectedEnterprise[]
}

export interface MonitorActiveScan {
  jobId: string
  status: 'running' | 'paused'
  processedCount: number
  totalCount: number
  currentQbCode: string | null
  phase: string | null
  pauseRequested?: boolean
  notScannedCount: number
  needAttentionCount: number
  allOkCount: number
  noEvalRecordCount: number
}

export interface MonitorSummary {
  lastScanAt?: string
  totalEvaluatedQb: number
  needAttentionCount: number
  allOkCount: number
  noEvalRecordCount: number
  notScannedCount: number
  activeScan?: MonitorActiveScan | null
}

export type MonitorListStatus =
  | 'all'
  | 'need_attention'
  | 'all_ok'
  | 'no_eval_record'
  | 'not_scanned'

export type MonitorEnterpriseMonitorStatus =
  | 'need_attention'
  | 'all_ok'
  | 'partial'
  | 'no_eval_record'
  | 'not_scanned'

export interface MonitorEnterpriseItem {
  qbCode: string
  enterpriseName?: string
  monitorStatus: MonitorEnterpriseMonitorStatus
  taskConclusion: WarningTaskConclusion
  taskSummary?: string
  lastCheckedAt?: string
}
