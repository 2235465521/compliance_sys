import type {
  BatchNormativeRefItemStatus,
  BatchNormativeRefJobStatus,
} from '@/types/batch-normative-ref'

type StatusTagMeta = { label: string; color: string }

/** 整批任务 `job.status`（手册 §3.1） */
export const BATCH_JOB_STATUS_META: Record<BatchNormativeRefJobStatus, StatusTagMeta> = {
  pending: { label: '待处理', color: 'default' },
  processing: { label: '处理中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

/** 子项 `items[].status`（手册 §3.2） */
export const BATCH_ITEM_STATUS_META: Record<BatchNormativeRefItemStatus, StatusTagMeta> = {
  pending: { label: '待处理', color: 'default' },
  running: { label: '处理中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

export function batchJobStatusMeta(status: string | null | undefined): StatusTagMeta {
  const key = status as BatchNormativeRefJobStatus
  return BATCH_JOB_STATUS_META[key] ?? { label: status?.trim() || '—', color: 'default' }
}

export function batchItemStatusMeta(status: string | null | undefined): StatusTagMeta {
  const key = status as BatchNormativeRefItemStatus
  return BATCH_ITEM_STATUS_META[key] ?? { label: status?.trim() || '—', color: 'default' }
}

export function batchJobStatusLabel(status: string | null | undefined): string {
  return batchJobStatusMeta(status).label
}

export function batchItemStatusLabel(status: string | null | undefined): string {
  return batchItemStatusMeta(status).label
}
