import type {
  BatchIndicatorCompareItemSummary,
  BatchIndicatorCompareJobOut,
} from '@/types/batch-indicator-compare'

const JOB_TERMINAL = new Set<BatchIndicatorCompareJobOut['status']>(['completed', 'failed'])
const ITEM_DONE = new Set<BatchIndicatorCompareItemSummary['indicator_compare_status']>([
  'completed',
  'failed',
  'skipped',
])

export type BatchIndicatorCompareJobProgress = {
  total: number
  completed: number
  failed: number
  skipped: number
  running: number
  pending: number
  finished: number
  percent: number
}

export function countBatchIndicatorCompareProgress(
  items: BatchIndicatorCompareItemSummary[] | undefined,
): BatchIndicatorCompareJobProgress {
  const list = items ?? []
  let completed = 0
  let failed = 0
  let skipped = 0
  let running = 0
  let pending = 0
  for (const item of list) {
    const s = item.indicator_compare_status
    if (s === 'completed') completed += 1
    else if (s === 'failed') failed += 1
    else if (s === 'skipped') skipped += 1
    else if (s === 'running') running += 1
    else pending += 1
  }
  const total = list.length
  const finished = completed + failed + skipped
  const percent = total > 0 ? Math.round((finished / total) * 100) : 0
  return { total, completed, failed, skipped, running, pending, finished, percent }
}

export function resolveBatchIndicatorCompareProgressDisplay(
  job: BatchIndicatorCompareJobOut,
): BatchIndicatorCompareJobProgress {
  const fromItems = countBatchIndicatorCompareProgress(job.items)
  if (fromItems.total > 0) return fromItems
  const total = job.total_items ?? 0
  const finished = (job.completed_items ?? 0) + (job.failed_items ?? 0) + (job.skipped_items ?? 0)
  return {
    total,
    completed: job.completed_items ?? 0,
    failed: job.failed_items ?? 0,
    skipped: job.skipped_items ?? 0,
    running: 0,
    pending: Math.max(0, total - finished),
    finished,
    percent: total > 0 ? Math.round((finished / total) * 100) : 0,
  }
}

export function shouldPollBatchIndicatorCompareJob(job: BatchIndicatorCompareJobOut): boolean {
  if (JOB_TERMINAL.has(job.status)) {
    const items = job.items ?? []
    if (items.length === 0) return false
    return items.some((i) => !ITEM_DONE.has(i.indicator_compare_status))
  }
  return true
}
