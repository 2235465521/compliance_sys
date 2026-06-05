/**
 * 查新服务 — 前端数据层（仅调用后端 API）
 * 手册：docs/frontend-novelty-search-API-对接说明-2026.md
 */
import request from './request'
import {
  confirmNoveltyReferenceSheet,
  createNoveltySearchTask,
  deleteNoveltySearchTask,
  getNoveltySearchTask,
  getNoveltySearchTaskIndicators,
  listNoveltySearchTasks,
  NoveltySearchApiError,
  patchNoveltyReferenceSheet,
  retryNoveltySearchTask,
} from '@/services/novelty-search-api'
import type { PaginatedResponse, StandardItem } from '@/types/dashboard'
import {
  mapNoveltyTaskFromApi,
  mapNoveltyTaskSummaryFromApi,
  mapReferenceSheetRowToApi,
} from '@/pages/novelty-search/utils/mapNoveltyApi'
import type {
  CreateTaskFromUploadInput,
  NoveltyIndicatorsBundle,
  NoveltyTask,
  ReferenceSheetRow,
} from '@/types/novelty-search'

export { NoveltySearchApiError } from '@/services/novelty-search-api'

/**
 * 按企标号在标准库检索：GET /api/standards/?bz_id=…（标准库模块，非查新 API）
 */
export async function queryStandardsByEnterpriseBzId(bzId: string): Promise<StandardItem[]> {
  const q = bzId.trim()
  if (!q) return []
  try {
    const res = await request.get<PaginatedResponse<StandardItem> | Record<string, unknown>>('v1/standards/', {
      params: { bz_id: q, page_size: 100 },
    })
    const data = res.data as Record<string, unknown>
    if (data?.code === 200 && data?.data && typeof data.data === 'object') {
      const inner = data.data as { results?: StandardItem[] }
      return Array.isArray(inner.results) ? inner.results : []
    }
    const paginated = data as unknown as PaginatedResponse<StandardItem>
    if (Array.isArray(paginated?.results)) {
      return paginated.results
    }
    return []
  } catch {
    return []
  }
}

export async function fetchTaskList(params?: {
  page?: number
  page_size?: number
  keyword?: string
  status?: string
  qb_code?: string
}): Promise<{ tasks: NoveltyTask[]; total: number; page: number; page_size: number }> {
  const page = await listNoveltySearchTasks({
    page: params?.page ?? 1,
    page_size: params?.page_size ?? 100,
    keyword: params?.keyword,
    status: params?.status,
    qb_code: params?.qb_code,
  })
  const results = Array.isArray(page.results) ? page.results : []
  return {
    tasks: results.map(mapNoveltyTaskSummaryFromApi),
    total: page.total,
    page: page.page,
    page_size: page.page_size,
  }
}

export async function fetchTaskById(id: string): Promise<NoveltyTask | null> {
  try {
    const api = await getNoveltySearchTask(id)
    return mapNoveltyTaskFromApi(api)
  } catch (e) {
    if (e instanceof NoveltySearchApiError && e.status === 404) return null
    throw e
  }
}

export async function createTaskFromUpload(input: CreateTaskFromUploadInput): Promise<NoveltyTask> {
  const api = await createNoveltySearchTask({
    qb_code: input.enterpriseStdNo,
    source: 'upload',
    file: input.file,
  })
  return mapNoveltyTaskFromApi(api)
}

/**
 * 一键查新：创建任务并自动确认专用表，返回含 compare_rows 的完成任务。
 * 后端为同步实现，无需轮询。
 */
export async function runNoveltySearchByQbCode(qbCode: string): Promise<NoveltyTask> {
  const code = qbCode.trim()
  if (!code) {
    throw new NoveltySearchApiError('请输入企标号', 400)
  }
  const created = await createNoveltySearchTask({ qb_code: code, source: 'form' })
  const rows = created.reference_sheet ?? []
  const confirmed = await confirmNoveltyReferenceSheet(
    created.id,
    rows.length > 0 ? { rows } : undefined,
  )
  return mapNoveltyTaskFromApi(confirmed)
}

export async function saveReferenceSheetDraft(taskId: string, rows: ReferenceSheetRow[]): Promise<NoveltyTask> {
  const api = await patchNoveltyReferenceSheet(taskId, {
    rows: rows.map(mapReferenceSheetRowToApi),
  })
  return mapNoveltyTaskFromApi(api)
}

export async function confirmReferenceSheet(taskId: string, rows?: ReferenceSheetRow[]): Promise<NoveltyTask> {
  const body = rows ? { rows: rows.map(mapReferenceSheetRowToApi) } : undefined
  const api = await confirmNoveltyReferenceSheet(taskId, body)
  return mapNoveltyTaskFromApi(api)
}

export async function retryNoveltyTask(taskId: string): Promise<NoveltyTask> {
  const api = await retryNoveltySearchTask(taskId)
  return mapNoveltyTaskFromApi(api)
}

/** 永久删除一条查新历史记录（DELETE /tasks/{id}，204 无 body） */
export async function deleteNoveltyTask(taskId: string | number): Promise<void> {
  await deleteNoveltySearchTask(taskId)
}

export async function fetchTaskIndicators(taskId: string): Promise<NoveltyIndicatorsBundle> {
  const api = await getNoveltySearchTaskIndicators(taskId)
  return {
    enterpriseIndicators: (api.enterprise_indicators ?? []).map((r, i) => ({
      id: `ent-${i}`,
      name: String(r.name ?? r.indicator_name ?? '—'),
      value: String(r.value ?? r.indicator_value ?? '—'),
      source: r.source,
      sourceId: r.source_id,
    })),
    nationalByStdCode: api.national_by_std_code ?? {},
    sourceEvaluations: (api.source_evaluations ?? []).map((s) => ({
      sourceType: s.source_type,
      sourceId: s.source_id,
      evaluatedAt: s.evaluated_at,
      title: s.title,
    })),
  }
}
