import { Alert } from 'antd'
import type { NoveltyTask } from '@/types/novelty-search'
import { TASK_CONCLUSION_META } from '@/pages/novelty-search/utils/noveltyCompareLabels'

export function NoveltyTaskConclusionAlert({ task }: { task: NoveltyTask }) {
  if (!task.taskConclusion && !task.taskSummary) return null
  const meta = task.taskConclusion ? TASK_CONCLUSION_META[task.taskConclusion] : undefined
  return (
    <Alert
      type={meta?.type ?? 'info'}
      showIcon
      message={meta?.label ?? '查新结论'}
      description={task.taskSummary ?? undefined}
      style={{ marginBottom: 16 }}
    />
  )
}
