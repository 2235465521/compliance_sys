import {
  backendCurrentStepToMaxWizardIndex,
  checkLatestStandardsBatch,
  getPendingIndexes,
  loadStep5CompareSnapshot,
  type PendingIndexItem,
  type StandardLatestCheckResult,
} from '@/services/compliance'
import { getEvaluation, getStep1 } from '@/services/compliance-api'
import type { ComparePreviewRow } from '@/pages/compliance/comparison-types'

export type HydrateStep5Result = {
  rows: ComparePreviewRow[]
  compareResult: Record<string, unknown>
  summary: string
} | null

export async function hydrateStep5Compare(taskId: number): Promise<HydrateStep5Result> {
  const loaded = await loadStep5CompareSnapshot(taskId)
  if (!loaded || loaded.rows.length === 0) return null
  const summary =
    typeof loaded.compareResult.summary === 'string'
      ? loaded.compareResult.summary
      : typeof loaded.compareResult.summary === 'object' && loaded.compareResult.summary !== null
        ? JSON.stringify(loaded.compareResult.summary)
        : ''
  return { rows: loaded.rows, compareResult: loaded.compareResult, summary }
}

export async function hydrateStep3Tables(): Promise<{
  pendingRows: PendingIndexItem[]
  referenceRows: PendingIndexItem[]
}> {
  const response = await getPendingIndexes()
  const pendingRows = response.data
  const referenceRows =
    'referenceExtracts' in response ? (response.referenceExtracts ?? []) : []
  return { pendingRows, referenceRows }
}

export async function hydrateStep4ValidityRows(
  referenceRows: PendingIndexItem[],
): Promise<StandardLatestCheckResult[]> {
  const uniq = Array.from(
    new Set(
      referenceRows.map((r) => r.standardName.trim()).filter((name) => name.length > 0 && name !== '-'),
    ),
  )
  if (uniq.length === 0) return []
  const { results } = await checkLatestStandardsBatch(uniq)
  return results
}

export async function hydrateDescriptiveFromStep1(taskId: number): Promise<{
  bzId: string
  enterpriseName: string
}> {
  const step1 = await getStep1(taskId)
  const parse = (step1.parse_result ?? {}) as Record<string, unknown>
  const qb = String(step1.task.qb_code ?? parse.qb_code ?? '').trim()
  const enterpriseName = String(parse.company_name ?? parse.qb_name ?? '').trim()
  return { bzId: qb, enterpriseName }
}

export async function fetchTaskBackendMaxIndex(taskId: number): Promise<number> {
  const ev = await getEvaluation(taskId)
  return backendCurrentStepToMaxWizardIndex(ev.current_step)
}
