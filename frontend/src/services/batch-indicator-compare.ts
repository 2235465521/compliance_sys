/**
 * 批量指标对比 — `/api/v1/batch-indicator-compare`
 * 手册：docs/backend-batch-indicator-compare-API-前端对接手册.md
 */
import { batchIndicatorCompareClient } from '@/services/batch-indicator-compare-client'
import type {
  BatchIndicatorCompareItemOut,
  BatchIndicatorCompareJobListPage,
  BatchIndicatorCompareJobOut,
  BatchIndicatorCompareJobSummary,
  BatchIndicatorCompareModuleMetaOut,
  CreateBatchIndicatorCompareJobIn,
  PatchBatchIndicatorCompareItemIn,
} from '@/types/batch-indicator-compare'

export type {
  BatchIndicatorCompareItemOut,
  BatchIndicatorCompareJobOut,
  BatchIndicatorCompareJobSummary,
} from '@/types/batch-indicator-compare'

export async function getBatchIndicatorCompareModuleMeta(): Promise<BatchIndicatorCompareModuleMetaOut> {
  const { data } = await batchIndicatorCompareClient.get<BatchIndicatorCompareModuleMetaOut>('/module')
  return data
}

export async function createBatchIndicatorCompareJob(
  input: CreateBatchIndicatorCompareJobIn,
): Promise<BatchIndicatorCompareJobOut> {
  const { data } = await batchIndicatorCompareClient.post<BatchIndicatorCompareJobOut>('/jobs', input)
  return data
}

export async function listBatchIndicatorCompareJobs(params: {
  page?: number
  page_size?: number
  source_batch_job_id?: number
}): Promise<BatchIndicatorCompareJobListPage> {
  const page = params.page ?? 1
  const page_size = params.page_size ?? 20
  const { data } = await batchIndicatorCompareClient.get<unknown>('/jobs', {
    params: {
      page,
      page_size,
      ...(params.source_batch_job_id != null ? { source_batch_job_id: params.source_batch_job_id } : {}),
    },
  })
  return normalizeJobListResponse(data, page, page_size)
}

export async function getBatchIndicatorCompareJob(jobId: number): Promise<BatchIndicatorCompareJobOut> {
  const { data } = await batchIndicatorCompareClient.get<BatchIndicatorCompareJobOut>(`/jobs/${jobId}`)
  return data
}

export async function getBatchIndicatorCompareJobItem(
  jobId: number,
  itemId: number,
): Promise<BatchIndicatorCompareItemOut> {
  const { data } = await batchIndicatorCompareClient.get<BatchIndicatorCompareItemOut>(
    `/jobs/${jobId}/items/${itemId}`,
  )
  return data
}

export async function patchBatchIndicatorCompareJobItem(
  jobId: number,
  itemId: number,
  body: PatchBatchIndicatorCompareItemIn,
): Promise<BatchIndicatorCompareItemOut> {
  const { data } = await batchIndicatorCompareClient.patch<BatchIndicatorCompareItemOut>(
    `/jobs/${jobId}/items/${itemId}`,
    body,
  )
  return data
}

export async function rerunBatchIndicatorCompareJobItem(
  jobId: number,
  itemId: number,
): Promise<BatchIndicatorCompareItemOut> {
  const { data } = await batchIndicatorCompareClient.post<BatchIndicatorCompareItemOut>(
    `/jobs/${jobId}/items/${itemId}/rerun`,
  )
  return data
}

export async function deleteBatchIndicatorCompareJob(jobId: number): Promise<void> {
  await batchIndicatorCompareClient.delete(`/jobs/${jobId}`)
}

function normalizeJobListResponse(data: unknown, page: number, page_size: number): BatchIndicatorCompareJobListPage {
  if (Array.isArray(data)) {
    return { results: data as BatchIndicatorCompareJobSummary[], total: data.length, page, page_size }
  }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    const rawList =
      (Array.isArray(o.results) && o.results) ||
      (Array.isArray(o.items) && o.items) ||
      (Array.isArray(o.data) && o.data) ||
      []
    const total = pickNumber(o, ['count', 'total']) ?? rawList.length
    const parsedPage = pickNumber(o, ['page', 'current']) ?? page
    const parsedSize = pickNumber(o, ['page_size', 'pageSize', 'limit']) ?? page_size
    return {
      results: rawList as BatchIndicatorCompareJobSummary[],
      total: typeof total === 'number' && total >= 0 ? total : rawList.length,
      page: parsedPage,
      page_size: parsedSize,
    }
  }
  return { results: [], total: 0, page, page_size }
}

function pickNumber(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.trim())
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}
