/**
 * 批量企标规范性引用评价 — `/api/v1/batch-normative-reference`
 * 手册：docs/backend-batch-normative-reference-API-前端对接手册.md
 */
import { batchNormativeRefClient } from '@/services/batch-normative-ref-client'
import type {
  BatchNormativeRefJobListPage,
  BatchNormativeRefJobOut,
  BatchNormativeRefItemOut,
  BatchNormativeRefJobSummary,
  BatchNormativeRefModuleMetaOut,
} from '@/types/batch-normative-ref'

export type { BatchNormativeRefJobOut, BatchNormativeRefItemOut, BatchNormativeRefJobSummary } from '@/types/batch-normative-ref'

export async function getBatchNormativeRefModuleMeta(): Promise<BatchNormativeRefModuleMetaOut> {
  const { data } = await batchNormativeRefClient.get<BatchNormativeRefModuleMetaOut>('/module')
  return data
}

export async function createBatchNormativeRefJob(files: File[], label?: string): Promise<BatchNormativeRefJobOut> {
  const form = new FormData()
  if (label?.trim()) form.append('label', label.trim())
  for (const f of files) {
    form.append('files', f, f.name)
  }
  const { data } = await batchNormativeRefClient.post<BatchNormativeRefJobOut>('/jobs', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getBatchNormativeRefJob(jobId: number): Promise<BatchNormativeRefJobOut> {
  const { data } = await batchNormativeRefClient.get<BatchNormativeRefJobOut>(`/jobs/${jobId}`)
  return data
}

export async function getBatchNormativeRefJobItem(
  jobId: number,
  itemId: number,
): Promise<BatchNormativeRefItemOut> {
  const { data } = await batchNormativeRefClient.get<BatchNormativeRefItemOut>(
    `/jobs/${jobId}/items/${itemId}`,
  )
  return data
}

/**
 * 分页列出批次任务（后端补充的 GET /jobs）。
 * 请求：`GET /jobs?page=&page_size=`（若后端使用 offset/limit，可在此适配）。
 */
export async function listBatchNormativeRefJobs(params: {
  page?: number
  page_size?: number
}): Promise<BatchNormativeRefJobListPage> {
  const page = params.page ?? 1
  const page_size = params.page_size ?? 20
  const { data } = await batchNormativeRefClient.get<unknown>('/jobs', {
    params: { page, page_size },
  })
  return normalizeJobListResponse(data, page, page_size)
}

function normalizeJobListResponse(data: unknown, page: number, page_size: number): BatchNormativeRefJobListPage {
  if (Array.isArray(data)) {
    return { results: data as BatchNormativeRefJobSummary[], total: data.length, page, page_size }
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
      results: rawList as BatchNormativeRefJobSummary[],
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

/**
 * 更新子项的 `references_resolved`（后端补充的 PATCH）。
 * 契约：`PATCH /jobs/{job_id}/items/{item_id}`，body `{ references_resolved: unknown[] }`
 */
export async function updateBatchNormativeRefJobItemReferences(
  jobId: number,
  itemId: number,
  referencesResolved: unknown[],
): Promise<BatchNormativeRefItemOut> {
  const { data } = await batchNormativeRefClient.patch<BatchNormativeRefItemOut>(
    `/jobs/${jobId}/items/${itemId}`,
    { references_resolved: referencesResolved },
  )
  return data
}

/** 删除批次任务（后端需实现 `DELETE /jobs/{job_id}`，未实现时返回 405/404） */
export async function deleteBatchNormativeRefJob(jobId: number): Promise<void> {
  await batchNormativeRefClient.delete(`/jobs/${jobId}`)
}
