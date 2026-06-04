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

export interface MonitorSummary {
  lastScanAt?: string
  totalEvaluatedQb: number
  needAttentionCount: number
  allOkCount: number
  pendingCount: number
}

export interface MonitorEnterpriseItem {
  qbCode: string
  enterpriseName?: string
  taskConclusion: WarningTaskConclusion
  taskSummary?: string
  lastCheckedAt?: string
}
