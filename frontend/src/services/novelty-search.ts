/**
 * 查新服务 — 前端数据层（演示 / Mock）
 *
 * MOCK: 任务列表、任务详情状态机、专用表持久化、比对编排、查新 PDF 等 REST 契约
 * 在后端说明文档中尚未覆盖，本文件全部走内存 Store + 人工延迟，便于界面联调与验收。
 * 对接真实 API 时：将下列函数改为 request 调用，并删除或收窄 Mock 分支。
 */
import { applyParsingCompleteForDemo, useNoveltyStore } from '@/stores/novelty-search'
import type {
  CreateTaskFromFormInput,
  CreateTaskFromUploadInput,
  NoveltyTask,
  ReferenceSheetRow,
  ReportState,
} from '@/types/novelty-search'

const MOCK_LATENCY_MS = 280

function delay(ms = MOCK_LATENCY_MS) {
  return new Promise((r) => setTimeout(r, ms))
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
