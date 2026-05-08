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
