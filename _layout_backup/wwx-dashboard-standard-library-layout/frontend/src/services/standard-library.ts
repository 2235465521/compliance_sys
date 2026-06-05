import axios from 'axios'
import type { AxiosResponse } from 'axios'
import request from '@/services/request'
import type {
  ApiEnvelope,
  BasicSearchItem,
  CheckLatestOk,
  DrfPaginated,
  IndexTableRow,
  IndustryTaxonomyHit,
  IndustryTaxonomyTreeApiNode,
  PedigreeRelationMutationPayload,
  PedigreeRelationsBatchResponse,
  PrefaceDiffResponse,
  StatisticsPayload,
  StdBaseRow,
  TreeDataPayload,
} from '@/types/standard-library'

/** 与后端 `/api/v1/standards/*` 对齐（`request` 的 baseURL 默认为 `/api`） */
const SL_V1 = 'v1/standards/'

/**
 * Django / Ninja HTTP 4xx JSON：优先 `detail`（字符串或可序列化数组），再到 `msg`/`message`，支持外层包一层 `data`。
 */
function parseHttpProblemDetailPayload(data: unknown): string | undefined {
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (data == null || typeof data !== 'object') return undefined
  const o = data as Record<string, unknown>
  const d = o.detail
  if (typeof d === 'string' && d.trim()) return d.trim()
  if (Array.isArray(d)) {
    const lines = d
      .map((item) => {
        if (item == null) return ''
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null && 'msg' in item) {
          const m = (item as { msg?: unknown }).msg
          return typeof m === 'string' ? m : JSON.stringify(item)
        }
        try {
          return JSON.stringify(item)
        } catch {
          return String(item)
        }
      })
      .filter((s) => s.trim())
    if (lines.length) return lines.join('\n')
  }
  const msg = o.msg ?? o.message
  if (typeof msg === 'string' && msg.trim()) return msg.trim()
  const nested = o.data
  if (nested != null && typeof nested === 'object') {
    return parseHttpProblemDetailPayload(nested)
  }
  return undefined
}

export async function listStandards(params: {
  page?: number
  /** DRF 常见 Query：`page_size`（需在服务端开启 `page_size_query_param` 时生效） */
  pageSize?: number
  search?: string
  ex_state?: string
}): Promise<DrfPaginated<StdBaseRow>> {
  const { data } = await request.get<DrfPaginated<StdBaseRow>>(`${SL_V1}`, {
    params: {
      page: params.page,
      ...(params.pageSize != null && params.pageSize > 0 ? { page_size: params.pageSize } : {}),
      search: params.search,
      ex_state: params.ex_state,
    },
  })
  return data
}

export async function fetchDetailInfo(bzId: string): Promise<Record<string, unknown>> {
  const { data } = await request.get<ApiEnvelope<Record<string, unknown>> | Record<string, unknown>>(
    `${SL_V1}detail-info/`,
    { params: { bz_id: bzId } },
  )
  if (data && typeof data === 'object' && 'code' in data) {
    const wrapped = data as ApiEnvelope<Record<string, unknown>> & { msg?: string }
    if (wrapped.code !== 200) {
      throw new Error(wrapped.msg || '获取详情失败')
    }
    if (!wrapped.data) {
      throw new Error(wrapped.msg || '暂无详情数据')
    }
    return wrapped.data
  }
  return data as Record<string, unknown>
}

async function mutateDetailInfo<T>(method: 'PATCH' | 'DELETE', bzId: string, body?: Record<string, unknown>): Promise<T> {
  const id = String(bzId ?? '').trim()
  if (!id) throw new Error('bz_id 不能为空')

  const run = async (path: string) => {
    if (method === 'DELETE') {
      return request.delete(path, {
        params: { bz_id: id },
        validateStatus: () => true,
      })
    }
    return request.patch(path, body ?? {}, {
      params: { bz_id: id },
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    })
  }

  let res = await run(`${SL_V1}detail-info/`)
  if (res.status === 404) {
    res = await run(`${SL_V1}detail-info`)
  }

  if (res.status >= 200 && res.status < 300) {
    return res.data as T
  }
  if (res.status === 404) {
    const altRes = await (method === 'DELETE'
      ? request.delete(`standards/detail-info/`, { params: { bz_id: id }, validateStatus: () => true })
      : request.patch(`standards/detail-info/`, body ?? {}, {
          params: { bz_id: id },
          headers: { 'Content-Type': 'application/json' },
          validateStatus: () => true,
        }))
    if (altRes.status >= 200 && altRes.status < 300) {
      return altRes.data as T
    }
    legacyDetailEnvelopeThrow(altRes.status, altRes.data)
  }
  legacyDetailEnvelopeThrow(res.status, res.data)
}

function detailPatchParsedData(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  if (typeof o.code === 'number') {
    if (o.code !== 200) {
      const msg =
        typeof o.msg === 'string' && o.msg.trim()
          ? o.msg.trim()
          : typeof o.message === 'string' && o.message.trim()
            ? o.message.trim()
            : ''
      throw new Error(msg || `操作失败（code ${o.code}）`)
    }
    if (o.data != null && typeof o.data === 'object') {
      return o.data as Record<string, unknown>
    }
    return {}
  }
  return o as Record<string, unknown>
}

function legacyDetailEnvelopeThrow(status: number, body: unknown): never {
  if (status === 404) throw new Error('未找到该标准或接口不可用')
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    const msg = typeof o.msg === 'string' ? o.msg.trim() : ''
    if (msg) throw new Error(msg)
  }
  throw new Error(parseHttpProblemDetailPayload(body) || `请求失败（HTTP ${status}）`)
}

/**
 * 标准详情 PATCH（**不改国标号**：勿传 std_code）。
 * — `PATCH /api/v1/standards/detail-info/?bz_id=` ，Body：`StandardPatchIn` camelCase 增量字段
 * — 成功体为详情对象或 `{ code, msg, data }`；HTTP 404 时尝试无尾斜杠与 `standards/detail-info/`
 */
export async function patchDetailInfo(bzId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const raw = await mutateDetailInfo<unknown>('PATCH', bzId, patch)
  return detailPatchParsedData(raw) ?? (typeof raw === 'object' && raw ? (raw as Record<string, unknown>) : {})
}

export type DetailInfoDeleteOk = {
  deleted: boolean
  bzId?: string
}

/** `DELETE /api/v1/standards/detail-info/?bz_id=` — 主表、扩展表、`standard_pedigree` 中该国标行（不删 `standard_pedigree_relation`） */
export async function deleteDetailInfo(bzId: string): Promise<DetailInfoDeleteOk> {
  const raw = await mutateDetailInfo<unknown>('DELETE', bzId)
  if (!raw || typeof raw !== 'object') return { deleted: true }
  const o = raw as Record<string, unknown>
  let inner = o
  const code = typeof o.code === 'number' ? o.code : undefined
  if (code != null && code !== 200 && typeof o.msg === 'string' && o.msg.trim()) {
    throw new Error(o.msg.trim())
  }
  if (typeof o.code === 'number' && o.data != null && typeof o.data === 'object') {
    inner = o.data as Record<string, unknown>
  }
  return {
    deleted: Boolean(inner.deleted),
    bzId: inner.bzId != null ? String(inner.bzId) : inner.bz_id != null ? String(inner.bz_id) : undefined,
  }
}

export async function basicSearch(q: string): Promise<BasicSearchItem[]> {
  const { data } = await request.get<ApiEnvelope<BasicSearchItem[]>>('standards/basic-search/', {
    params: { q },
  })
  if (data.code !== 200) {
    throw new Error(data.msg || '搜索失败')
  }
  return data.data ?? []
}

export async function fetchStatistics(): Promise<StatisticsPayload> {
  const { data } = await request.get<ApiEnvelope<StatisticsPayload>>(`${SL_V1}statistics/`)
  if (data.code !== 200) {
    throw new Error(data.msg || '统计失败')
  }
  return data.data
}

export async function checkLatest(bzId: string): Promise<CheckLatestOk> {
  const { data } = await request.get<
    (Omit<CheckLatestOk, 'pedigree_chain'> & { pedigree_chain?: unknown }) | { code: number; msg: string }
  >('standards/check-latest/', { params: { bz_id: bzId } })
  if (data && typeof data === 'object' && 'code' in data) {
    throw new Error((data as { msg?: string }).msg || '查新检查失败')
  }
  const raw = data as Omit<CheckLatestOk, 'pedigree_chain'> & { pedigree_chain?: unknown }
  const c = raw.pedigree_chain
  const pedigree_chain: string[] = Array.isArray(c)
    ? c.map((x) => String(x))
    : typeof c === 'string' && c.trim()
      ? [c.trim()]
      : []
  return {
    query_bz_id: String(raw.query_bz_id ?? ''),
    is_latest: Boolean(raw.is_latest),
    current_latest_id: String(raw.current_latest_id ?? ''),
    pedigree_chain,
  }
}

export async function fetchTreeData(bzId: string): Promise<TreeDataPayload> {
  const { data } = await request.get<ApiEnvelope<TreeDataPayload>>('get_tree_data/', {
    params: { bz_id: bzId },
  })
  if (data.code !== 200) {
    throw new Error(data.msg || '获取族谱失败')
  }
  return data.data
}

function pedigreeNodePatchParseSuccess(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {}
  const o = body as Record<string, unknown>
  if (typeof o.code === 'number' && o.code === 200 && o.data != null && typeof o.data === 'object') {
    return o.data as Record<string, unknown>
  }
  return body as Record<string, unknown>
}

function pedigreeNodePatchParseError(status: number, body: unknown): Error {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    const detail = typeof o.detail === 'string' ? o.detail.trim() : ''
    if (detail) return new Error(detail)
    const msg = typeof o.msg === 'string' ? o.msg.trim() : ''
    if (msg) return new Error(msg)
  }
  return new Error(`更新失败（HTTP ${status}）`)
}

/**
 * 谱系图谱节点元数据增量更新（**不改 std_code**）。
 * — `PATCH /api/v1/standards/pedigree/node/`（Ninja：HTTP 200 + StandardDetailOut；4xx：`detail`）
 * — HTTP 404 时回退 `PATCH /api/standards/pedigree/node/`（Envelope `code/msg/data`）
 *
 * Body：JSON，`bzId` 必填；其余仅传变更字段（camelCase），如 `stdName`、`exState`、`publishDate`、`effectiveDate`、`extension.responsibleUnit`。
 */
export async function patchPedigreeNode(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const bz = body.bzId ?? body.bz_id
  if (bz == null || String(bz).trim() === '') {
    throw new Error('bzId 必填')
  }
  const payload = { ...body, bzId: String(bz).trim() } as Record<string, unknown>
  delete payload.bz_id

  let res = await request.patch(`${SL_V1}pedigree/node/`, payload, { validateStatus: () => true })
  if (res.status >= 200 && res.status < 300) {
    return pedigreeNodePatchParseSuccess(res.data)
  }
  if (res.status === 404) {
    res = await request.patch('standards/pedigree/node/', payload, { validateStatus: () => true })
    if (res.status >= 200 && res.status < 300) {
      return pedigreeNodePatchParseSuccess(res.data)
    }
  }
  throw pedigreeNodePatchParseError(res.status, res.data)
}

export async function fetchPrefaceDiff(bzId: string): Promise<PrefaceDiffResponse> {
  const { data } = await request.get<PrefaceDiffResponse>('dify/preface-diff/', {
    params: { bz_id: bzId },
  })
  return data
}

export async function uploadPrefacePdf(bzId: string, file: File): Promise<void> {
  const form = new FormData()
  form.append('bz_id', bzId)
  form.append('file', file)
  const { data } = await request.post<{ code: number; msg: string }>('dify/preface-upload/', form)
  if (data.code !== 200) {
    throw new Error(data.msg || '上传失败')
  }
}

/** 返回 blob URL，调用方负责 revoke */
export async function downloadStandardPdfBlobUrl(bzId: string): Promise<string> {
  const res = await request.get<Blob>('standards/download-doc/', {
    params: { bz_id: bzId },
    responseType: 'blob',
  })
  const ct = String(res.headers['content-type'] ?? '')
  if (ct.includes('application/json')) {
    const text = await (res.data as Blob).text()
    const json = JSON.parse(text) as { msg?: string }
    throw new Error(json.msg || '下载失败')
  }
  return URL.createObjectURL(res.data as Blob)
}

/** 正文页演示：索引表只读一页 */
export async function listIndexesPage(params?: {
  page?: number
  index_type?: string
}): Promise<DrfPaginated<IndexTableRow>> {
  const { data } = await request.get<DrfPaginated<IndexTableRow>>('indexes_table/', {
    params: { page: params?.page ?? 1, index_type: params?.index_type },
  })
  return data
}

/**
 * 标准元数据批量入库（仅新建）。
 * `POST /api/v1/standards/metadata-batch-import/` · `multipart/form-data` · 字段 **`files`**（可多文件）。
 *
 * — 不要使用 `metadata-batch-import-upsert/`（国标号重复时覆盖）；本接口对已存在国标号一律拒绝。
 * — 任一重复行：后端返回 **HTTP 400**，body 常为 `{ "detail": "…摘要…" }`（部分成功同样在 `detail` 中说明）。
 * — **仅 HTTP 2xx 且无此类业务错误视为全部成功**，不再假定 200 + `rejectedDuplicates`。
 */
export async function importStandardMetadataBatch(files: File[]): Promise<void> {
  if (files.length === 0) {
    throw new Error('请先选择要入库的文件')
  }
  const form = new FormData()
  files.forEach((f) => form.append('files', f))

  try {
    const res = await request.post<ApiEnvelope<unknown> | Record<string, unknown>>(
      `${SL_V1}metadata-batch-import/`,
      form,
    )
    const { data } = res
    if (data && typeof data === 'object' && 'code' in data) {
      const wrapped = data as ApiEnvelope<unknown> & { msg?: string; detail?: unknown }
      if (wrapped.code !== 200) {
        const fromBody =
          typeof wrapped.detail === 'string'
            ? wrapped.detail
            : parseHttpProblemDetailPayload(data) ?? wrapped.msg
        throw new Error(fromBody?.trim() || wrapped.msg?.trim() || '批量入库未通过')
      }
    }
  } catch (e) {
    if (axios.isAxiosError(e)) {
      if (e.response) {
        const parsed = parseHttpProblemDetailPayload(e.response.data)
        if (parsed) throw new Error(parsed)
        const st = e.response.status
        if (st === 404) {
          throw new Error(
            '批量入库路径不存在（404），请确认后端已实现 POST /api/v1/standards/metadata-batch-import/',
          )
        }
        throw new Error(`批量入库请求失败（HTTP ${st}）`)
      }
      throw new Error(e.message || '批量入库失败：网络异常或未连接服务器')
    }
    throw e
  }
}

/**
 * 将「文件流」GET 响应落盘为下载；若 Content-Type 为 JSON 则解析 body 中的业务错误信息。
 */
async function saveBlobDownloadFromAxiosResponse(res: AxiosResponse<Blob>, fallbackFilename: string): Promise<void> {
  const blob = res.data as Blob
  const ct = String(res.headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('application/json') || ct.includes('text/json')) {
    const text = await blob.text()
    let errMsg = '下载失败'
    try {
      const j = JSON.parse(text) as { msg?: string; detail?: string }
      errMsg = (typeof j.msg === 'string' && j.msg) || (typeof j.detail === 'string' && j.detail) || errMsg
    } catch {
      if (text.trim()) errMsg = text.slice(0, 400)
    }
    throw new Error(errMsg)
  }
  let filename = fallbackFilename
  const cd = res.headers['content-disposition']
  if (cd && typeof cd === 'string') {
    const star = cd.match(/filename\*=UTF-8''([^;\n]+)/i)
    const plain = cd.match(/filename="?([^";\n]+)"?/i)
    const raw = star?.[1] ?? plain?.[1]
    if (raw) {
      try {
        filename = decodeURIComponent(raw.replace(/\+/g, ' '))
      } catch {
        filename = raw.trim()
      }
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 下载标准元数据批量导入模板（文件流）。
 * `GET /api/v1/standards/metadata-import-template/?format=xlsx|csv`
 */
export async function downloadMetadataImportTemplate(format: 'xlsx' | 'csv'): Promise<void> {
  const res = await request.get<Blob>(`${SL_V1}metadata-import-template/`, {
    params: { format },
    responseType: 'blob',
  })
  const fallback = format === 'csv' ? 'metadata-import-template.csv' : 'metadata-import-template.xlsx'
  await saveBlobDownloadFromAxiosResponse(res, fallback)
}

/**
 * 国标正文拆解工作流入库（单文件与多文件共用）。
 * 约定：`POST /api/workflow/standard-body-ingest/`，`multipart`：`files`（必填，可多），`bz_id`（可选，单本时与文件对应）。
 */
export async function submitStandardBodyIngestWorkflow(files: File[], bzId?: string): Promise<void> {
  if (files.length === 0) {
    throw new Error('请先选择标准文档')
  }
  const form = new FormData()
  if (bzId?.trim()) {
    form.append('bz_id', bzId.trim())
  }
  files.forEach((f) => form.append('files', f))
  const { data } = await request.post<ApiEnvelope<unknown> | Record<string, unknown>>(
    'workflow/standard-body-ingest/',
    form,
  )
  if (data && typeof data === 'object' && 'code' in data) {
    const wrapped = data as ApiEnvelope<unknown> & { msg?: string }
    if (wrapped.code !== 200) {
      throw new Error(wrapped.msg || '正文入库任务提交失败')
    }
  }
}

/**
 * 官方整本 Excel（多 sheet 官方簿结构）。
 * `POST /api/standards/industry-taxonomy/import/` · multipart：`file`、`scheme`（ICS|CCS），整表覆盖该 scheme。
 * 勿与 {@link importIndustryTaxonomyTableTemplate}（库字段表模板）混用。
 */
export async function importIndustryTaxonomySheet(file: File, scheme: 'ICS' | 'CCS'): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  form.append('scheme', scheme)
  const { data } = await request.post<ApiEnvelope<unknown> | Record<string, unknown>>(
    'standards/industry-taxonomy/import/',
    form,
  )
  if (data && typeof data === 'object' && 'code' in data) {
    const wrapped = data as ApiEnvelope<unknown> & { msg?: string }
    if (wrapped.code !== 200) {
      throw new Error(wrapped.msg || '官方簿导入失败')
    }
  }
}

/**
 * 库表模板导入成功时，后端 `data` 中常见计数字段。
 */
export type IndustryTaxonomyTableImportResult = {
  /** 本条请求处理总行数（有 `processed`/`total` 等则用，否则为 created + updated） */
  processed: number
  created: number
  updated: number
}

function coerceImportCount(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : NaN
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.trunc(n)
}

function parseIndustryTaxonomyTableImportData(raw: unknown): IndustryTaxonomyTableImportResult {
  let o: Record<string, unknown> =
    raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}
  const nested = o.data
  if (nested != null && typeof nested === 'object' && !Array.isArray(nested)) {
    o = { ...o, ...(nested as Record<string, unknown>) }
  }
  const created = coerceImportCount(o.created)
  const updated = coerceImportCount(o.updated)
  let processed = coerceImportCount(o.processed ?? o.total ?? o.count ?? o.rows ?? o.handled)
  if (processed <= 0) processed = created + updated
  return { processed, created, updated }
}

/**
 * 与数据库字段对齐的「库表模板」导入（日常维护）。
 * `POST /api/standards/industry-taxonomy/import-table-template/` · multipart：`file`、`scheme`（ICS|CCS）。
 * 成功时从 `data` 解析 created / updated 等计数。
 */
export async function importIndustryTaxonomyTableTemplate(
  file: File,
  scheme: 'ICS' | 'CCS',
): Promise<IndustryTaxonomyTableImportResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('scheme', scheme)
  const { data } = await request.post<ApiEnvelope<unknown> | Record<string, unknown>>(
    'standards/industry-taxonomy/import-table-template/',
    form,
  )
  if (data && typeof data === 'object' && 'code' in data) {
    const wrapped = data as ApiEnvelope<unknown> & { msg?: string }
    if (wrapped.code !== 200) {
      throw new Error(wrapped.msg || '表模板导入失败')
    }
    return parseIndustryTaxonomyTableImportData(wrapped.data)
  }
  return parseIndustryTaxonomyTableImportData(undefined)
}

/**
 * 下载库字段对齐的行业分类导入模板（文件流；勿与 `/api/v1/standards/metadata-import-template/` 混用）。
 * `GET /api/standards/industry-taxonomy/table-import-template/?scheme=ICS|CCS&format=xlsx|csv`
 */
export async function downloadIndustryTaxonomyTableImportTemplate(
  scheme: 'ICS' | 'CCS',
  format: 'xlsx' | 'csv',
): Promise<void> {
  const res = await request.get<Blob>('standards/industry-taxonomy/table-import-template/', {
    params: { scheme, format },
    responseType: 'blob',
  })
  const prefix = scheme === 'ICS' ? 'ics' : 'ccs'
  const fallback =
    format === 'csv'
      ? `${prefix}_industry_classification_import_template.csv`
      : `${prefix}_industry_classification_import_template.xlsx`
  await saveBlobDownloadFromAxiosResponse(res, fallback)
}

/** 单行命中映射为表格展示用结构 */
function mapRowToTaxonomyHit(row: unknown, defaultScheme: 'ICS' | 'CCS'): IndustryTaxonomyHit | null {
  if (row == null || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const scheme: 'ICS' | 'CCS' = o.scheme === 'ICS' || o.scheme === 'CCS' ? o.scheme : defaultScheme
  const code = String(o.code ?? o.ics_code ?? o.ccs_code ?? '').trim()
  const name = String(o.name ?? o.ics_name ?? o.ccs_name ?? '').trim()
  if (!code && !name) return null
  return {
    scheme,
    code: code || '—',
    name: name || '—',
    path: typeof o.path === 'string' ? o.path : undefined,
  }
}

function mergeIcsCcsBuckets(o: Record<string, unknown>): IndustryTaxonomyHit[] {
  const out: IndustryTaxonomyHit[] = []
  if (Array.isArray(o.ics)) {
    for (const r of o.ics) {
      const h = mapRowToTaxonomyHit(r, 'ICS')
      if (h) out.push(h)
    }
  }
  if (Array.isArray(o.ccs)) {
    for (const r of o.ccs) {
      const h = mapRowToTaxonomyHit(r, 'CCS')
      if (h) out.push(h)
    }
  }
  return out
}

function inferLegacyRowScheme(o: Record<string, unknown>): 'ICS' | 'CCS' {
  if (o.scheme === 'ICS' || o.scheme === 'CCS') return o.scheme
  if (String(o.parent_code ?? '').trim()) return 'CCS'
  if (String(o.ccs_code ?? '').trim()) return 'CCS'
  return 'ICS'
}

/** 解析 query 接口 `data`：支持 `{ ics, ccs }`、嵌套在 `data` 下、或旧版数组 */
function parseIndustryTaxonomyQueryPayload(payload: unknown): IndustryTaxonomyHit[] {
  if (payload == null) return []
  if (Array.isArray(payload)) {
    return payload
      .map((r) => {
        if (r && typeof r === 'object') {
          const o = r as Record<string, unknown>
          return mapRowToTaxonomyHit(r, inferLegacyRowScheme(o))
        }
        return null
      })
      .filter((h): h is IndustryTaxonomyHit => h != null)
  }
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>
    if (Array.isArray(o.ics) || Array.isArray(o.ccs)) return mergeIcsCcsBuckets(o)
    const nested = o.data
    if (nested != null && typeof nested === 'object') {
      const d = nested as Record<string, unknown>
      if (Array.isArray(d.ics) || Array.isArray(d.ccs)) return mergeIcsCcsBuckets(d)
    }
  }
  return []
}

/**
 * 关键词检索行业分类。
 * `GET /api/standards/industry-taxonomy/query/?q=`；可选 `scheme`（与当前 Tab 一致传入亦可，后端不据此筛结果）。
 * 成功体优先解析 **`data.ics`** 与 **`data.ccs`** 合并为表格行；兼容旧版扁平数组。
 */
export async function queryIndustryClassification(
  q: string,
  scheme?: 'ICS' | 'CCS',
): Promise<IndustryTaxonomyHit[]> {
  const params: Record<string, string> = { q }
  if (scheme) {
    params.scheme = scheme
  }
  const { data } = await request.get<
    ApiEnvelope<unknown> | IndustryTaxonomyHit[] | Record<string, unknown>
  >('standards/industry-taxonomy/query/', { params })

  if (data && typeof data === 'object' && 'code' in data) {
    const wrapped = data as ApiEnvelope<unknown> & { msg?: string; message?: string }
    if (wrapped.code !== 200) {
      throw new Error(wrapped.msg || wrapped.message || '查询失败')
    }
    return parseIndustryTaxonomyQueryPayload(wrapped.data)
  }

  return parseIndustryTaxonomyQueryPayload(data)
}

function unwrapIndustryTaxonomyTreePayload(data: unknown): IndustryTaxonomyTreeApiNode[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (Array.isArray(d.tree)) return d.tree as IndustryTaxonomyTreeApiNode[]
    if (Array.isArray(d.nodes)) return d.nodes as IndustryTaxonomyTreeApiNode[]
    if (Array.isArray(d.results)) return d.results as IndustryTaxonomyTreeApiNode[]
  }
  return []
}

/**
 * 拉取 ICS/CCS 分类树（嵌套 children）。
 * `GET /api/standards/industry-taxonomy/tree/?scheme=ICS|CCS`
 * 成功体：`IndustryTaxonomyTreeApiNode[]` 或 `{ code:200, data: … }`；`data` 亦可为 `{ tree: [...] }`。
 */
export async function fetchIndustryTaxonomyTree(scheme: 'ICS' | 'CCS'): Promise<IndustryTaxonomyTreeApiNode[]> {
  const { data } = await request.get<
    ApiEnvelope<unknown> | IndustryTaxonomyTreeApiNode[] | Record<string, unknown>
  >('standards/industry-taxonomy/tree/', { params: { scheme } })

  if (Array.isArray(data)) return data

  if (data && typeof data === 'object' && 'code' in data) {
    const wrapped = data as ApiEnvelope<unknown> & { msg?: string }
    if (wrapped.code !== 200) {
      throw new Error(wrapped.msg || '获取分类树失败')
    }
    return unwrapIndustryTaxonomyTreePayload(wrapped.data)
  }

  return unwrapIndustryTaxonomyTreePayload(data)
}

function coerceIndustryTaxonomyAxiosError(e: unknown): Error | null {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object' && 'code' in e.response.data) {
    const w = e.response.data as ApiEnvelope<unknown> & { msg?: string }
    if (w.code !== 200) {
      return new Error(w.msg || '请求失败')
    }
  }
  return null
}

/**
 * 更新单条行业分类（部分字段）。
 * `PATCH /api/standards/industry-taxonomy/item/{id}/?scheme=ICS|CCS`
 * ICS body：`code` / `name` / `level` 等与专用字段等价（后端任选）；CCS 见接口说明。
 */
export async function patchIndustryTaxonomyItem(
  id: string | number,
  scheme: 'ICS' | 'CCS',
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = `standards/industry-taxonomy/item/${encodeURIComponent(String(id))}/`
  try {
    const { data } = await request.patch<
      ApiEnvelope<{ scheme: string; item: Record<string, unknown> }> & { msg?: string }
    >(path, body, { params: { scheme } })
    if (data && typeof data === 'object' && 'code' in data) {
      const w = data as ApiEnvelope<{ scheme: string; item: Record<string, unknown> }> & { msg?: string }
      if (w.code !== 200) {
        throw new Error(w.msg || '保存失败')
      }
      return w.data?.item ?? {}
    }
    throw new Error('保存失败')
  } catch (e) {
    const coerced = coerceIndustryTaxonomyAxiosError(e)
    if (coerced) throw coerced
    throw e instanceof Error ? e : new Error('保存失败')
  }
}

/**
 * 删除单条行业分类。
 * `DELETE /api/standards/industry-taxonomy/item/{id}/?scheme=ICS|CCS`
 */
export async function deleteIndustryTaxonomyItem(id: string | number, scheme: 'ICS' | 'CCS'): Promise<void> {
  const path = `standards/industry-taxonomy/item/${encodeURIComponent(String(id))}/`
  try {
    const { data } = await request.delete<ApiEnvelope<{ scheme: string; id: unknown; deleted: boolean }> & { msg?: string }>(
      path,
      { params: { scheme } },
    )
    if (data && typeof data === 'object' && 'code' in data) {
      const w = data as ApiEnvelope<unknown> & { msg?: string }
      if (w.code !== 200) {
        throw new Error(w.msg || '删除失败')
      }
      return
    }
    throw new Error('删除失败')
  } catch (e) {
    const coerced = coerceIndustryTaxonomyAxiosError(e)
    if (coerced) throw coerced
    throw e instanceof Error ? e : new Error('删除失败')
  }
}

function assertPostEnvelopeOk(data: unknown): void {
  if (data && typeof data === 'object' && 'code' in data) {
    const w = data as ApiEnvelope<unknown> & { msg?: string }
    if (w.code !== 200) {
      throw new Error(w.msg || '请求失败')
    }
  }
}

/**
 * 单条谱系关系新增或更新。
 * `POST /api/standards/pedigree/relation-mutation/`，body：`{ op, source, target, relation_type? }`（create/update）。
 */
export async function mutatePedigreeRelation(body: PedigreeRelationMutationPayload): Promise<void> {
  const payload: Record<string, unknown> = {
    op: body.op,
    source: body.source,
    target: body.target,
  }
  if (body.relation_type != null && String(body.relation_type).trim() !== '') {
    payload.relation_type = body.relation_type
  }
  const { data } = await request.post<Record<string, unknown>>('standards/pedigree/relation-mutation/', payload)
  assertPostEnvelopeOk(data)
}

/**
 * 批量提交谱系关系。
 * `POST /api/standards/pedigree/relations/batch/` Body：`{ items: [...] }`
 * 成功体至少含 `code: 200`，以及 `created` / `skipped`；可有 `errors`。
 */
export async function submitPedigreeRelationsBatch(
  items: { source: string; target: string; relation_type: string }[],
): Promise<PedigreeRelationsBatchResponse> {
  if (items.length === 0) {
    throw new Error('没有可提交的关系')
  }
  const { data } = await request.post<PedigreeRelationsBatchResponse>('standards/pedigree/relations/batch/', {
    items,
  })
  assertPostEnvelopeOk(data)
  return data
}

export type IndexImportResult = {
  bzId: string
  imported: number
  skipped: number
  warning: string | null
  indexesCount: number
}

/**
 * 国标指标入库（单文件，AI 解析）。
 * `POST /api/v1/standards/index-import/` · multipart：`file`，Query：`replace`（默认 true）。
 * — 503：Dify 未配置；500：Dify 调用失败；200：成功，含 imported / bzId / warning。
 */
export async function importStandardIndexes(file: File, replace = true): Promise<IndexImportResult> {
  const form = new FormData()
  form.append('file', file)
  let res
  try {
    res = await request.post<IndexImportResult>(`${SL_V1}index-import/`, form, {
      params: { replace },
      validateStatus: () => true,
    })
  } catch (e) {
    if (axios.isAxiosError(e) && !e.response) {
      throw new Error(e.message || '网络异常或未连接服务器')
    }
    throw e
  }
  const { status, data } = res
  if (status >= 200 && status < 300) {
    return data as IndexImportResult
  }
  if (status === 503) {
    throw new Error('Dify 未配置，请联系管理员配置后再试')
  }
  const detail = parseHttpProblemDetailPayload(data)
  if (status === 500) {
    throw new Error(detail || 'Dify 调用失败（网络或解析问题），请稍后重试')
  }
  throw new Error(detail || `指标入库请求失败（HTTP ${status}）`)
}

// ─── 批量指标入库 ─────────────────────────────────────────────────────────────

/** 批次内单个文件条目（snake_case，与后端完全一致） */
export type BatchIndexTask = {
  id: string | number
  sort_order?: number
  original_filename: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  std_code: string | null
  indexes_count: number | null
  manual_review_status: string | null
  error_message: string | null
}

/** 完整批次 Job 对象（snake_case，POST 提交和 GET 轮询均返回此结构） */
export type IndexImportJob = {
  id: string | number
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_items: number
  completed_items: number
  failed_items: number
  items: BatchIndexTask[]
  created_at?: string
  updated_at?: string
}

/** 向后兼容别名 */
export type BatchIndexPollResult = IndexImportJob

/** 批次列表分页结果 */
export type IndexImportJobListPage = {
  results: IndexImportJob[]
  total: number
  page: number
  page_size: number
}

/**
 * 提交批量指标入库批次。
 * `POST /api/v1/standards/index-import-jobs/` · multipart：`files`（多文件同字段名）。
 * 返回完整 Job 对象，使用 `res.id` 作为后续轮询 ID。
 */
export async function submitBatchIndexImport(
  files: File[],
  replace = true,
): Promise<IndexImportJob> {
  if (files.length === 0) throw new Error('请先选择至少一个国标文件')
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  let res
  try {
    res = await request.post<IndexImportJob>(`${SL_V1}index-import-jobs/`, form, {
      params: { replace },
      validateStatus: () => true,
    })
  } catch (e) {
    if (axios.isAxiosError(e) && !e.response) {
      throw new Error(e.message || '网络异常或未连接服务器')
    }
    throw e
  }
  const { status, data } = res
  if (status >= 200 && status < 300) return data as IndexImportJob
  if (status === 503) throw new Error('Dify 未配置，请联系管理员配置后再试')
  const detail = parseHttpProblemDetailPayload(data)
  throw new Error(detail || `批次提交失败（HTTP ${status}）`)
}

// ── 指标入库历史 ───────────────────────────────────────────────────────────

export interface IndexImportHistoryItem {
  id: number
  stdCode: string
  originalFilename: string
  importStatus: 'completed' | 'failed' | string
  indexesCount: number
  manualReviewStatus: 'pending' | 'approved' | 'rejected' | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface IndexImportHistoryResult {
  count: number
  results: IndexImportHistoryItem[]
}

/**
 * 获取指标入库历史列表。
 * `GET /api/v1/standards/index-import-history/`
 */
export async function getIndexImportHistory(params?: {
  page?: number
  pageSize?: number
  stdCode?: string
}): Promise<IndexImportHistoryResult> {
  const res = await request.get<IndexImportHistoryResult>(
    `${SL_V1}index-import-history/`,
    { params, validateStatus: () => true },
  )
  const { status, data } = res
  if (status >= 200 && status < 300) return data as IndexImportHistoryResult
  const detail = parseHttpProblemDetailPayload(data)
  throw new Error(detail || `获取历史记录失败（HTTP ${status}）`)
}

// ── 指标审核 ──────────────────────────────────────────────────────────────

export interface IndexItem {
  index_name: string
  index_type: string
  index_content: Record<string, unknown>
}

export interface IndexReviewResult {
  stdCode: string
  indexes: IndexItem[]
  manualReviewStatus: 'pending' | 'approved' | 'rejected' | null
}

export interface IndexReviewSubmitBody {
  indexes: IndexItem[]
  manualReviewStatus: 'approved' | 'rejected'
}

function normalizeIndexReviewResult(raw: Record<string, unknown>): IndexReviewResult {
  const g = (a: string, b: string) => raw[a] ?? raw[b]
  return {
    stdCode: (g('stdCode', 'std_code') ?? '') as string,
    indexes: (raw.indexes ?? []) as IndexItem[],
    manualReviewStatus: (g('manualReviewStatus', 'manual_review_status') ?? null) as IndexReviewResult['manualReviewStatus'],
  }
}

/**
 * 获取指标审核数据。
 * `GET /api/v1/standards/index-review/?stdCode=`
 */
export async function getIndexReview(stdCode: string): Promise<IndexReviewResult> {
  const res = await request.get<Record<string, unknown>>(`${SL_V1}index-review/`, {
    params: { stdCode },
    validateStatus: () => true,
  })
  const { status, data } = res
  if (status >= 200 && status < 300) {
    return normalizeIndexReviewResult((data ?? {}) as Record<string, unknown>)
  }
  const detail = parseHttpProblemDetailPayload(data)
  throw new Error(detail || `获取审核数据失败（HTTP ${status}）`)
}

/**
 * 提交审核结果。
 * `PUT /api/v1/standards/index-review/?stdCode=`
 */
export async function submitIndexReview(
  stdCode: string,
  body: IndexReviewSubmitBody,
): Promise<void> {
  const res = await request.put(`${SL_V1}index-review/`, body, {
    params: { stdCode },
    validateStatus: () => true,
  })
  const { status, data } = res
  if (status >= 200 && status < 300) return
  const detail = parseHttpProblemDetailPayload(data)
  throw new Error(detail || `提交审核失败（HTTP ${status}）`)
}

/**
 * 轮询批量指标入库进度。
 * `GET /api/v1/standards/index-import-jobs/{id}/`
 * status === "done" 时停止轮询。
 */
export async function pollBatchIndexImport(job_id: string): Promise<BatchIndexPollResult> {
  if (!job_id || job_id === 'undefined') {
    throw new Error('job id 无效，无法轮询进度')
  }
  const res = await request.get<BatchIndexPollResult>(
    `${SL_V1}index-import-jobs/${encodeURIComponent(job_id)}/`,
    { validateStatus: () => true },
  )
  const { status, data } = res
  if (status >= 200 && status < 300) return data as BatchIndexPollResult
  const detail = parseHttpProblemDetailPayload(data)
  throw new Error(detail || `进度查询失败（HTTP ${status}）`)
}

/**
 * 删除指定批次。
 * `DELETE /api/v1/standards/index-import-jobs/{id}/`
 */
export async function deleteIndexImportJob(id: string | number): Promise<void> {
  const res = await request.delete(`${SL_V1}index-import-jobs/${encodeURIComponent(String(id))}/`, {
    validateStatus: () => true,
  })
  const { status, data } = res
  if (status >= 200 && status < 300) return
  const detail = parseHttpProblemDetailPayload(data)
  throw new Error(detail || `删除失败（HTTP ${status}）`)
}

/**
 * 分页获取批次任务列表。
 * `GET /api/v1/standards/index-import-jobs/?page=&page_size=`
 */
export async function listIndexImportJobs(params: {
  page?: number
  page_size?: number
} = {}): Promise<IndexImportJobListPage> {
  const page = params.page ?? 1
  const page_size = params.page_size ?? 20
  const res = await request.get<unknown>(`${SL_V1}index-import-jobs/`, {
    params: { page, page_size },
    validateStatus: () => true,
  })
  const { status, data } = res
  if (status >= 200 && status < 300) {
    return normalizeJobListPage(data, page, page_size)
  }
  const detail = parseHttpProblemDetailPayload(data)
  throw new Error(detail || `获取批次列表失败（HTTP ${status}）`)
}

function normalizeJobListPage(
  data: unknown,
  page: number,
  page_size: number,
): IndexImportJobListPage {
  if (Array.isArray(data)) {
    return { results: data as IndexImportJob[], total: data.length, page, page_size }
  }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    const rawList =
      (Array.isArray(o.results) && o.results) ||
      (Array.isArray(o.items)   && o.items)   ||
      (Array.isArray(o.data)    && o.data)    ||
      []
    const total = pickJobNum(o, ['count', 'total']) ?? rawList.length
    return {
      results:   rawList as IndexImportJob[],
      total:     typeof total === 'number' && total >= 0 ? total : rawList.length,
      page:      pickJobNum(o, ['page', 'current']) ?? page,
      page_size: pickJobNum(o, ['page_size', 'pageSize', 'limit']) ?? page_size,
    }
  }
  return { results: [], total: 0, page, page_size }
}

function pickJobNum(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'number') return v
    if (typeof v === 'string' && !isNaN(Number(v))) return Number(v)
  }
  return undefined
}

// ── 指标列表 ──────────────────────────────────────────────────────────────

export interface IndicatorItem {
  id: number
  std_code: string
  indexes: Array<{
    index_name: string
    index_type: string
    index_content: Record<string, unknown>
  }>
  manual_review_status: 'pending' | 'approved' | 'rejected' | null
}

export interface IndicatorListResult {
  count: number
  results: IndicatorItem[]
}

/**
 * 删除指定指标记录。
 * `DELETE /api/v1/standards/indicator-list/{id}/`
 */
export async function deleteIndicatorItem(id: number): Promise<void> {
  const res = await request.delete(`${SL_V1}indicator-list/${id}/`, {
    validateStatus: () => true,
  })
  const { status, data } = res
  if (status >= 200 && status < 300) return
  const detail = parseHttpProblemDetailPayload(data)
  throw new Error(detail || `删除失败（HTTP ${status}）`)
}

/**
 * 获取指标列表。
 * `GET /api/v1/standards/indicator-list/`
 */
export async function getIndicatorList(params?: {
  stdCode?: string
  page?: number
  pageSize?: number
}): Promise<IndicatorListResult> {
  const res = await request.get<IndicatorListResult>(`${SL_V1}indicator-list/`, {
    params: {
      stdCode:  params?.stdCode  || undefined,
      page:     params?.page     ?? 1,
      pageSize: params?.pageSize ?? 20,
    },
    validateStatus: () => true,
  })
  const { status, data } = res
  if (status >= 200 && status < 300) return data as IndicatorListResult
  const detail = parseHttpProblemDetailPayload(data)
  throw new Error(detail || `获取指标列表失败（HTTP ${status}）`)
}
