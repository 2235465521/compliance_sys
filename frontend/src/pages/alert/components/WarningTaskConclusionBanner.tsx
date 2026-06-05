import { Alert } from 'antd'
import type { WarningTaskConclusion } from '@/types/warnings'
import { WARNING_TASK_CONCLUSION_META } from '@/pages/alert/utils/warningCompareLabels'

export function WarningTaskConclusionBanner({
  taskConclusion,
  taskSummary,
  qbCode,
  enterpriseName,
}: {
  taskConclusion?: WarningTaskConclusion
  taskSummary?: string
  qbCode?: string
  enterpriseName?: string
}) {
  if (!taskConclusion && !taskSummary) return null
  const meta = taskConclusion ? WARNING_TASK_CONCLUSION_META[taskConclusion] : undefined
  const titleParts = [meta?.label ?? '预警结论']
  if (qbCode) titleParts.push(qbCode)
  if (enterpriseName) titleParts.push(enterpriseName)

  return (
    <Alert
      type={meta?.type ?? 'info'}
      showIcon
      message={titleParts.join(' · ')}
      description={taskSummary}
      style={{ marginBottom: 16 }}
    />
  )
}
