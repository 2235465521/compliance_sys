import type { NoveltyRowConclusion, NoveltyTaskConclusion } from '@/types/novelty-search'

export const ROW_CONCLUSION_META: Record<
  NoveltyRowConclusion,
  { label: string; color: 'success' | 'error' | 'warning' | 'default' | 'processing' }
> = {
  unchanged: { label: '无变化', color: 'success' },
  updated: { label: '标准已更新', color: 'error' },
  first_record: { label: '首次建立基线', color: 'warning' },
  unresolved: { label: '无法解析现行号', color: 'default' },
  not_assessable: { label: '不可自动比对', color: 'processing' },
}

export const TASK_CONCLUSION_META: Record<
  NoveltyTaskConclusion,
  { label: string; type: 'success' | 'error' | 'warning' | 'info' }
> = {
  has_updates: { label: '存在标准更新', type: 'warning' },
  all_unchanged: { label: '引用标准均无变化', type: 'success' },
  partial: { label: '部分条目需人工核对', type: 'info' },
  pending: { label: '比对进行中', type: 'info' },
  empty_history: { label: '无历史评价数据', type: 'error' },
}

export function rowConclusionLabel(
  code: NoveltyRowConclusion,
  apiLabel?: string,
): string {
  if (apiLabel?.trim()) return apiLabel.trim()
  return ROW_CONCLUSION_META[code]?.label ?? code
}
