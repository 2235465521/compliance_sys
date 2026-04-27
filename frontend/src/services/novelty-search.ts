/**
 * 查新服务 — 前端数据层（演示 / Mock）
 *
 * MOCK: 任务列表、任务详情状态机、专用表持久化、比对编排、查新 PDF 等 REST 契约
 * 在后端说明文档中尚未覆盖，本文件全部走内存 Store + 人工延迟，便于界面联调与验收。
 * 对接真实 API 时：将下列函数改为 request 调用，并删除或收窄 Mock 分支。
 */
import request from './request'
import type { PaginatedResponse, StandardItem } from '@/types/dashboard'
import { applyParsingCompleteForDemo, useNoveltyStore } from '@/stores/novelty-search'
import type {
  CreateTaskFromFormInput,
  CreateTaskFromNationalInput,
  CreateTaskFromUploadInput,
  NoveltyTask,
  ReferenceSheetRow,
  ReportState,
} from '@/types/novelty-search'

const MOCK_LATENCY_MS = 280

function delay(ms = MOCK_LATENCY_MS) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 按企标号在标准库（StdBase）中检索：GET /api/standards/?bz_id=…
 * 与《后端接口文档》2.1 列表/搜索标准一致；失败时返回空数组（由界面提示）。
 */
export async function queryStandardsByEnterpriseBzId(bzId: string): Promise<StandardItem[]> {
  const q = bzId.trim()
  if (!q) return []
  try {
    const res = await request.get<PaginatedResponse<StandardItem> | Record<string, unknown>>('/standards/', {
      params: { bz_id: q, page_size: 100 },
    })
    const data = res.data as Record<string, unknown>
    if (data?.code === 200 && data?.data && typeof data.data === 'object') {
      const inner = data.data as { results?: StandardItem[] }
      return Array.isArray(inner.results) ? inner.results : []
    }
    if (Array.isArray((data as PaginatedResponse<StandardItem>)?.results)) {
      return (data as PaginatedResponse<StandardItem>).results
    }
    return []
  } catch {
    return []
  }
}

export async function fetchTaskList(): Promise<NoveltyTask[]> {
  await delay()
  return [...useNoveltyStore.getState().tasks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export async function fetchTaskById(id: string): Promise<NoveltyTask | null> {
  await delay(120)
  return useNoveltyStore.getState().getTask(id) ?? null
}

/** MOCK: 上传通道创建任务（未调用 POST /api/analyze_qb_references_auto/） */
export async function createTaskFromUpload(input: CreateTaskFromUploadInput): Promise<NoveltyTask> {
  await delay()
  const task = useNoveltyStore.getState().addTaskFromUpload(input)
  return task
}

/** MOCK: 表单通道创建任务 */
export async function createTaskFromForm(input: CreateTaskFromFormInput): Promise<NoveltyTask> {
  await delay()
  return useNoveltyStore.getState().addTaskFromForm(input)
}

/** MOCK: 上传国标通道（顿号分隔多国标，演示「最新版」映射） */
export async function createTaskFromNational(input: CreateTaskFromNationalInput): Promise<NoveltyTask> {
  await delay()
  return useNoveltyStore.getState().addTaskFromNational(input)
}

/** MOCK: 保存专用表草稿 */
export async function saveReferenceSheetDraft(taskId: string, rows: ReferenceSheetRow[]): Promise<void> {
  await delay(160)
  useNoveltyStore.getState().saveReferenceDraft(taskId, rows)
}

/** MOCK: 确认专用表并触发演示比对流水线 */
export async function confirmReferenceSheet(taskId: string): Promise<void> {
  await delay(200)
  useNoveltyStore.getState().confirmReferenceSheet(taskId)
}

/**
 * MOCK: 模拟「企标解析完成」并写入专用表初稿。
 * 真实环境应由 WebSocket 或轮询任务状态后刷新详情。
 */
export async function runDemoParsingSequence(taskId: string): Promise<void> {
  await delay(600)
  applyParsingCompleteForDemo(taskId)
}

/** MOCK: 生成查新 PDF（占位） */
export async function requestReportPdf(taskId: string): Promise<void> {
  await delay(150)
  useNoveltyStore.getState().setReportState(taskId, 'generating')
  await delay(1200)
  useNoveltyStore.getState().setReportState(taskId, 'ready', new Date().toISOString())
}

export async function setReportStateMock(taskId: string, state: ReportState, at?: string): Promise<void> {
  await delay(80)
  useNoveltyStore.getState().setReportState(taskId, state, at)
}
