import type {
  BatchIndicatorCompareItemStatus,
  BatchIndicatorCompareJobStatus,
} from '@/types/batch-indicator-compare'

type StatusTagMeta = { label: string; color: string }

export const BATCH_IC_JOB_STATUS_META: Record<BatchIndicatorCompareJobStatus, StatusTagMeta> = {
  pending: { label: '等待中', color: 'default' },
  processing: { label: '处理中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

export const BATCH_IC_ITEM_STATUS_META: Record<BatchIndicatorCompareItemStatus, StatusTagMeta> = {
  pending: { label: '等待中', color: 'default' },
  running: { label: '对比中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  skipped: { label: '已跳过', color: 'warning' },
}

export function batchIndicatorCompareJobStatusMeta(status: string): StatusTagMeta {
  const key = status as BatchIndicatorCompareJobStatus
  return BATCH_IC_JOB_STATUS_META[key] ?? { label: status || '—', color: 'default' }
}

export function batchIndicatorCompareItemStatusMeta(status: string): StatusTagMeta {
  const key = status as BatchIndicatorCompareItemStatus
  return BATCH_IC_ITEM_STATUS_META[key] ?? { label: status || '—', color: 'default' }
}
