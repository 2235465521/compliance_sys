import type {
  DuplicateCheckHit,
  DuplicateCheckPayload,
  DuplicateCheckReport,
} from '@/types/duplicate-check'
import request from '@/services/request'
import { downloadBlob } from '@/utils/download'

/**
 * 与《标准化服务平台-查重模块API对接说明》对齐（Django Ninja，前缀 `/api/v1`）：
 * - 一审（名称快查）：POST /api/v1/duplicate-check/name-check
 * - 二审（语义立项）：POST /api/v1/duplicate-check/semantic-check
 *
 * axios `baseURL` 默认为 `VITE_API_BASE_URL` 或 `/api`，此处路径写为 `/v1/duplicate-check/...`。
 * 开发代理：`vite` 将 `/api` 转到后端（`VITE_DEV_PROXY_TARGET`，默认见 vite.config），浏览器请求同源无跨域。
 */

const DUPLICATE_API_ROOT =
  (import.meta.env.VITE_DUPLICATE_API_PREFIX as string | undefined)?.replace(/\/+$/, '') ||
  '/v1/duplicate-check'

const DUPLICATE_NAME_CHECK = `${DUPLICATE_API_ROOT}/name-check`
const DUPLICATE_SEMANTIC_CHECK = `${DUPLICATE_API_ROOT}/semantic-check`
/** 标准 PDF 下载（文档 §2.6），查重结果中的 bz_id 可用于下载对应标准全文 */
const STANDARDS_DOWNLOAD_DOC = '/standards/download-doc/'

/** 查重/语义/大文件下载可能超过 Axios 默认 30s，单独放宽（毫秒） */
const DUPLICATE_HTTP_TIMEOUT_MS = 120_000

/** 后端 name-check 单条结构（对接说明 3.2） */
export type DuplicateNameCheckRow = {
  bz_id: string
  bz_name: string
  status: string | null
  similarity: number
}

type NameCheckResponseBody = {
  success?: boolean
  message?: string
  error?: string
  data?: DuplicateNameCheckRow[]
}

/** 后端 semantic-check 响应（对接说明 3.3） */
export type SemanticCheckResponse = {
  success?: boolean
  task_id?: string
  message?: string
  error?: string
}

/** 用户检索原文 → 一审 name-check 的 keyword（整段文本，支持名称 / 关键词 / 立项说明混写） */
export function buildDuplicateKeyword(payload: DuplicateCheckPayload): string {
  return payload.queryText.trim()
}

function payloadDisplayLabel(payload: DuplicateCheckPayload): string {
  const t = payload.queryText.trim()
  if (!t) return '（未填写）'
  if (t.length <= 150) return t
  return `${t.slice(0, 150)}…`
}

/**
 * 名称快查（一审）
 * @see POST /api/v1/duplicate-check/name-check  body: `{ "keyword": "..." }`
 */
export async function fetchDuplicateNameCheck(keyword: string): Promise<DuplicateNameCheckRow[]> {
  const res = await request.post<NameCheckResponseBody>(
    DUPLICATE_NAME_CHECK,
    { keyword },
    { timeout: DUPLICATE_HTTP_TIMEOUT_MS },
  )
  const body = res.data
  if (body?.success === false) {
    throw new Error(body.error || body.message || '名称快查失败')
  }
  if (Array.isArray(body?.data)) return body.data
  return []
}

/**
 * 语义立项（二审），依赖一审返回的候选 `bz_id` 列表
 * @see POST /api/v1/duplicate-check/semantic-check
 */
export async function fetchDuplicateSemanticCheck(
  intentText: string,
  candidateIds: string[],
): Promise<SemanticCheckResponse> {
  const res = await request.post<SemanticCheckResponse>(
    DUPLICATE_SEMANTIC_CHECK,
    {
      intent_text: intentText,
      candidate_ids: candidateIds,
    },
    { timeout: DUPLICATE_HTTP_TIMEOUT_MS },
  )
  const body = res.data ?? {}
  if (body.success === false) {
    throw new Error(body.error || body.message || '语义立项失败')
  }
  return body
}

function mapRowsToHits(
  payload: DuplicateCheckPayload,
  rows: DuplicateNameCheckRow[],
): DuplicateCheckHit[] {
  const candidateName = payloadDisplayLabel(payload)
  const iso = new Date().toISOString()

  return rows.map((row, idx) => {
    const report: DuplicateCheckReport = {
      taskId: row.bz_id,
      summary: `与标准「${row.bz_name}」字面相似度 ${row.similarity}%（状态：${row.status ?? '—'}）`,
      overlapList: [
        {
          standardNo: row.bz_id,
          name: row.bz_name,
          similarity: row.similarity,
        },
      ],
    }
    return {
      id: `${row.bz_id}-${idx}`,
      candidateName,
      matchedName: row.bz_name,
      similarity: row.similarity,
      highlights: [row.bz_id, row.status].filter(Boolean),
      createdAt: iso,
      report,
    }
  })
}

/**
 * 查重主流程：调用一审接口，并按用户设置的相似度阈值过滤后映射为列表数据。
 * 二审（语义）为异步 task，若产品上需要可在页面层先调本接口再调 `fetchDuplicateSemanticCheck`。
 */
export async function submitDuplicateCheck(
  payload: DuplicateCheckPayload,
): Promise<DuplicateCheckHit[]> {
  const keyword = buildDuplicateKeyword(payload)
  if (!keyword.trim()) return []
  const rows = await fetchDuplicateNameCheck(keyword)
  return mapRowsToHits(payload, rows)
}

/** 后端不可用时用于界面演示的示例数据（与 Mock 约定一致） */
export function buildMockDuplicateHits(payload: DuplicateCheckPayload): DuplicateCheckHit[] {
  const raw = payload.queryText?.trim() || ''
  const base =
    raw.split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 80) ||
    raw.slice(0, 80) ||
    '未命名标准'
  const iso = new Date().toISOString()

  const reportBase: DuplicateCheckReport = {
    taskId: '',
    summary: '示例报告：后端未返回或请求失败时的占位数据。',
    overlapList: [
      {
        standardNo: 'GB/T XXXXX—20XX',
        name: `${base} 术语与定义`,
        similarity: 86,
      },
    ],
    conclusion: '请联通后端后展示真实查重报告内容。',
  }

  return [
    {
      id: 'mock-1',
      candidateName: payloadDisplayLabel(payload),
      matchedName: `${base} 术语与定义`,
      similarity: 86,
      highlights: ['GB/T XXXXX—20XX', '现行'],
      createdAt: iso,
      report: { ...reportBase, taskId: 'mock-1' },
    },
    {
      id: 'mock-2',
      candidateName: payloadDisplayLabel(payload),
      matchedName: `${base} 技术要求`,
      similarity: 72,
      highlights: ['GB/T XXXX—20XX', '现行'],
      createdAt: iso,
      report: { ...reportBase, taskId: 'mock-2' },
    },
  ]
}

function sanitizeBzIdForFilename(bzId: string) {
  return bzId.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, '_')
}

/** 判断是否为 PDF 二进制（以 %PDF 开头） */
function looksLikePdfBuffer(buf: ArrayBuffer) {
  if (buf.byteLength < 4) return false
  const u = new Uint8Array(buf.slice(0, 4))
  return u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46
}

/**
 * 下载标准库中的标准 PDF（文档 §2.6 GET /api/standards/download-doc/?bz_id=）
 * 部分实现使用查询参数 `biz_id`，此处同时附带 `bz_id` 与 `biz_id`（同值）以兼容。
 *
 * 注意：这是「标准全文 PDF」，不是查重模块单独生成的报告 PDF；若后端未入库该标准 PDF，可能返回 JSON 错误体，
 * 以前会被误存为 .pdf 导致无法打开，此处会校验内容并抛出可读错误。
 */
export async function downloadStandardPdfByBzId(bzId: string): Promise<void> {
  const res = await request.get<Blob>(STANDARDS_DOWNLOAD_DOC, {
    params: { bz_id: bzId, biz_id: bzId },
    responseType: 'blob',
    timeout: DUPLICATE_HTTP_TIMEOUT_MS,
  })
  const blob = res.data
  const buf = await blob.arrayBuffer()
  const ct = (res.headers['content-type'] || '').toLowerCase()

  if (ct.includes('application/pdf') || looksLikePdfBuffer(buf)) {
    downloadBlob(
      new Blob([buf], { type: 'application/pdf' }),
      `${sanitizeBzIdForFilename(bzId)}.pdf`,
    )
    return
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  let detail = '服务器返回的不是 PDF（可能该标准暂无文件或无权访问）。'
  try {
    const j = JSON.parse(text) as Record<string, unknown>
    detail =
      (typeof j.detail === 'string' && j.detail) ||
      (typeof j.message === 'string' && j.message) ||
      (typeof j.msg === 'string' && j.msg) ||
      detail
  } catch {
    if (text.length > 0 && text.length < 800) detail = text
  }
  throw new Error(detail)
}
