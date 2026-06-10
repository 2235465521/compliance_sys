import type { ComparePreviewRow } from '@/pages/compliance/comparison-types'
import { parseStep5CompareResultToRows } from '@/pages/compliance/utils/step5CompareParse'
import type { BatchIndicatorCompareItemOut } from '@/types/batch-indicator-compare'

export function mapCompareResultToPreviewRows(
  compareResult: BatchIndicatorCompareItemOut['compare_result'],
): ComparePreviewRow[] {
  if (!compareResult || typeof compareResult !== 'object') return []
  return parseStep5CompareResultToRows(compareResult as Record<string, unknown>)
}

export function pickCompareSummary(item: BatchIndicatorCompareItemOut): string {
  const s = item.compare_result?.summary
  if (typeof s === 'string' && s.trim()) return s.trim()
  return item.compare_result?.markdown ? '详见对比明细表' : ''
}

export function formatEnterpriseIndicatorLabel(
  ind: { name?: string; value?: string; indicator_name?: string; indicator_value?: string },
): string {
  const name = String(ind.name ?? ind.indicator_name ?? '').trim() || '—'
  const value = String(ind.value ?? ind.indicator_value ?? '').trim() || '—'
  return `${name}：${value}`
}
