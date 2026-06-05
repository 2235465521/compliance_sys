/**
 * 查新服务 HTTP 薄封装
 * 手册：docs/frontend-novelty-search-API-对接说明-2026.md
 */
import { noveltySearchClient } from '@/services/novelty-search-client'
import type {
  NoveltyIndicatorsApi,
  NoveltyModuleMetaApi,
  NoveltyTaskListPageApi,
  NoveltyTaskOutApi,
  PatchReferenceSheetBodyApi,
} from '@/types/novelty-search-api'

export type { NoveltyTaskOutApi, NoveltyTaskListPageApi, NoveltyIndicatorsApi } from '@/types/novelty-search-api'

function extractDetail(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { detail?: unknown } } }).response
    const d = res?.data?.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d[0] && typeof d[0] === 'object' && 'msg' in (d[0] as object)) {
      return String((d[0] as { msg: string }).msg)
    }
  }
  return '请求失败'
}

export class NoveltySearchApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'NoveltySearchApiError'
    this.status = status
  }
}

function wrapError(err: unknown): never {
  const status =
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { status?: number } }).response?.status
      : undefined
  throw new NoveltySearchApiError(extractDetail(err), status)
}

export async function getNoveltySearchModuleMeta(): Promise<NoveltyModuleMetaApi> {
  try {
    const { data } = await noveltySearchClient.get<NoveltyModuleMetaApi>('/module')
    return data
  } catch (e) {
    wrapError(e)
  }
}

/** POST /tasks：仅 multipart，必填 qb_code；可选 source、file */
export async function createNoveltySearchTask(input: {
  qb_code: string
  source?: 'upload' | 'form' | 'national'
  file?: File
}): Promise<NoveltyTaskOutApi> {
  const form = new FormData()
  form.append('qb_code', input.qb_code.trim())
  form.append('source', input.source ?? 'upload')
  if (input.file) form.append('file', input.file, input.file.name)
  try {
    const { data } = await noveltySearchClient.post<NoveltyTaskOutApi>('/tasks', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      validateStatus: (s) => s === 200 || s === 201,
    })
    return data
  } catch (e) {
    wrapError(e)
  }
}

export async function listNoveltySearchTasks(params: {
  page?: number
  page_size?: number
  qb_code?: string
  status?: string
  keyword?: string
}): Promise<NoveltyTaskListPageApi> {
  try {
    const query: Record<string, string | number> = {
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
    }
    const term = (params.qb_code ?? params.keyword ?? '').trim()
    if (term) {
      query.qb_code = term
      query.keyword = term
    }
    if (params.status?.trim()) query.status = params.status.trim()

    const { data } = await noveltySearchClient.get<unknown>('/tasks', { params: query })
    return normalizeListPage(data, params.page ?? 1, params.page_size ?? 20)
  } catch (e) {
    wrapError(e)
  }
}

function pickNumber(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

/** 兼容 Ninja 直出、分页对象、以及 { code, data: { results, total } } 包装 */
function unwrapListPayload(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    return { results: data, total: data.length, page: 1, page_size: data.length }
  }
  if (!data || typeof data !== 'object') return null
  const root = data as Record<string, unknown>

  if (
    Array.isArray(root.results) ||
    Array.isArray(root.items) ||
    Array.isArray(root.list) ||
    pickNumber(root, ['total', 'count']) != null
  ) {
    return root
  }

  const inner = root.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const nested = inner as Record<string, unknown>
    if (
      Array.isArray(nested.results) ||
      Array.isArray(nested.items) ||
      Array.isArray(nested.list) ||
      pickNumber(nested, ['total', 'count']) != null
    ) {
      return nested
    }
  }

  if (Array.isArray(inner)) {
    return { results: inner, total: inner.length }
  }

  if (Array.isArray(root.items)) {
    return { results: root.items, total: root.items.length }
  }

  return root
}

function normalizeListPage(data: unknown, page: number, page_size: number): NoveltyTaskListPageApi {
  const payload = unwrapListPayload(data)
  if (!payload) {
    return { results: [], total: 0, page, page_size }
  }

  const rawList =
    (Array.isArray(payload.results) && payload.results) ||
    (Array.isArray(payload.items) && payload.items) ||
    (Array.isArray(payload.list) && payload.list) ||
    []

  const total = pickNumber(payload, ['total', 'count']) ?? rawList.length

  return {
    results: rawList as NoveltyTaskListPageApi['results'],
    total: total >= 0 ? total : rawList.length,
    page: pickNumber(payload, ['page', 'current']) ?? page,
    page_size: pickNumber(payload, ['page_size', 'pageSize', 'limit']) ?? page_size,
  }
}

export async function getNoveltySearchTask(taskId: string | number): Promise<NoveltyTaskOutApi> {
  try {
    const { data } = await noveltySearchClient.get<NoveltyTaskOutApi>(`/tasks/${taskId}`)
    return data
  } catch (e) {
    wrapError(e)
  }
}

export async function patchNoveltyReferenceSheet(
  taskId: string | number,
  body: PatchReferenceSheetBodyApi,
): Promise<NoveltyTaskOutApi> {
  try {
    const { data } = await noveltySearchClient.patch<NoveltyTaskOutApi>(
      `/tasks/${taskId}/reference-sheet`,
      body,
    )
    return data
  } catch (e) {
    wrapError(e)
  }
}

export async function confirmNoveltyReferenceSheet(
  taskId: string | number,
  body?: PatchReferenceSheetBodyApi,
): Promise<NoveltyTaskOutApi> {
  try {
    const { data } = await noveltySearchClient.post<NoveltyTaskOutApi>(
      `/tasks/${taskId}/confirm-sheet`,
      body ?? {},
    )
    return data
  } catch (e) {
    wrapError(e)
  }
}

export async function retryNoveltySearchTask(taskId: string | number): Promise<NoveltyTaskOutApi> {
  try {
    const { data } = await noveltySearchClient.post<NoveltyTaskOutApi>(`/tasks/${taskId}/retry`, {})
    return data
  } catch (e) {
    wrapError(e)
  }
}

/** DELETE /tasks/{task_id} — 成功 204，无响应体 */
export async function deleteNoveltySearchTask(taskId: string | number): Promise<void> {
  try {
    await noveltySearchClient.delete(`/tasks/${taskId}`, {
      validateStatus: (status) => status === 204 || status === 200,
    })
  } catch (e) {
    wrapError(e)
  }
}

export async function getNoveltySearchTaskIndicators(taskId: string | number): Promise<NoveltyIndicatorsApi> {
  try {
    const { data } = await noveltySearchClient.get<NoveltyIndicatorsApi>(`/tasks/${taskId}/indicators`)
    return data
  } catch (e) {
    wrapError(e)
  }
}

/** 后端当前固定 501，勿在生产环境调用 */
export async function requestNoveltySearchReport(taskId: string | number): Promise<never> {
  try {
    await noveltySearchClient.post(`/tasks/${taskId}/report`, {})
  } catch (e) {
    wrapError(e)
  }
  throw new NoveltySearchApiError('未预期的报告响应', 501)
}
