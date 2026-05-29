import type { BatchNormativeRefItemOut, BatchNormativeRefJobOut } from '@/types/batch-normative-ref'

const JOB_TERMINAL = new Set<BatchNormativeRefJobOut['status']>(['completed', 'failed'])
const ITEM_DONE = new Set<BatchNormativeRefItemOut['status']>(['completed', 'failed'])

export type BatchJobItemProgress = {
  total: number
  completed: number
  failed: number
  running: number
  pending: number
  finished: number
  percent: number
}

/** 根据子项 status 统计进度（与下方文件列表一致，可随轮询逐步更新） */
export function countBatchJobItemProgress(items: BatchNormativeRefItemOut[] | undefined): BatchJobItemProgress {
  const list = items ?? []
  let completed = 0
  let failed = 0
  let running = 0
  let pending = 0

  for (const item of list) {
    switch (item.status) {
      case 'completed':
        completed += 1
        break
      case 'failed':
        failed += 1
        break
      case 'running':
        running += 1
        break
      default:
        pending += 1
    }
  }

  const total = list.length
  const finished = completed + failed
  const percent = total > 0 ? Math.round((finished / total) * 100) : 0

  return { total, completed, failed, running, pending, finished, percent }
}

/** 展示用：优先子项统计；无 items 时回退 job 汇总字段 */
export function resolveBatchJobProgressDisplay(job: BatchNormativeRefJobOut): BatchJobItemProgress {
  const fromItems = countBatchJobItemProgress(job.items)
  if (fromItems.total > 0) return fromItems

  const total = job.total_items ?? 0
  const completed = job.completed_items ?? 0
  const failed = job.failed_items ?? 0
  const finished = completed + failed
  const percent = total > 0 ? Math.round((finished / total) * 100) : 0

  return {
    total,
    completed,
    failed,
    running: 0,
    pending: Math.max(0, total - finished),
    finished,
    percent,
  }
}

/** 是否仍需轮询（子项未全部结束，或任务级状态未终态） */
export function shouldPollBatchNormativeRefJob(job: BatchNormativeRefJobOut): boolean {
  const items = job.items ?? []
  if (items.length > 0) {
    const allItemsDone = items.every((i) => ITEM_DONE.has(i.status))
    if (!allItemsDone) return true
  }
  return !JOB_TERMINAL.has(job.status)
}
