import type { WarningTaskConclusion } from '@/types/warnings'

export const WARNING_TASK_CONCLUSION_META: Record<
  WarningTaskConclusion,
  { label: string; type: 'success' | 'error' | 'warning' | 'info' }
> = {
  need_attention: { label: '需要更新', type: 'warning' },
  all_ok: { label: '状态良好，暂不需更新', type: 'success' },
  empty_history: { label: '无评价记录', type: 'error' },
  pending: { label: '处理中', type: 'info' },
  partial: { label: '部分条目需人工核对', type: 'info' },
}
