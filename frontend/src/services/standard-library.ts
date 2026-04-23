import request from '@/services/request'
import type {
  ApiEnvelope,
  BasicSearchItem,
  CheckLatestOk,
  DrfPaginated,
  IndexTableRow,
  IndustryTaxonomyHit,
  PedigreeRelationMutationPayload,
  PrefaceDiffResponse,
  StatisticsPayload,
  StdBaseRow,
  TreeDataPayload,
} from '@/types/standard-library'

export async function listStandards(params: {
  page?: number
  /** DRF 常见 Query：`page_size`（需在服务端开启 `page_size_query_param` 时生效） */
  pageSize?: number
  search?: string
  ex_state?: string
}): Promise<DrfPaginated<StdBaseRow>> {
  const { data } = await request.get<DrfPaginated<StdBaseRow>>('standards/', {
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
    'standards/detail-info/',
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
  const { data } = await request.get<ApiEnvelope<StatisticsPayload>>('standards/statistics/')
  if (data.code !== 200) {
    throw new Error(data.msg || '统计失败')
  }
  return data.data
}

export async function checkLatest(bzId: string): Promise<CheckLatestOk> {
  const { data } = await request.get<CheckLatestOk | { code: number; msg: string }>(
    'standards/check-latest/',
    { params: { bz_id: bzId } },
  )
  if (data && typeof data === 'object' && 'code' in data) {
    throw new Error((data as { msg?: string }).msg || '查新检查失败')
  }
  return data as CheckLatestOk
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
 * 标准元数据批量入库（如 Excel/压缩包）。
 * 约定：`POST /api/standards/metadata-batch-import/`，`multipart` 字段 `files`（多文件）。
 * 后端未实现时会表现为网络错误，由页面提示「待对接」。
 */
export async function importStandardMetadataBatch(files: File[]): Promise<void> {
  if (files.length === 0) {
    throw new Error('请先选择要入库的文件')
  }
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  const { data } = await request.post<ApiEnvelope<unknown> | Record<string, unknown>>(
    'standards/metadata-batch-import/',
    form,
  )
  if (data && typeof data === 'object' && 'code' in data) {
    const wrapped = data as ApiEnvelope<unknown> & { msg?: string }
    if (wrapped.code !== 200) {
      throw new Error(wrapped.msg || '批量入库失败')
    }
  }
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
 * 上传行业分类对照表并写入后端（ICS 或 CCS）。
 * 约定：`POST /api/standards/industry-taxonomy/import/`，`multipart`：`file`、`scheme`（ICS|CCS）。
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
      throw new Error(wrapped.msg || '分类表导入失败')
    }
  }
}

/**
 * 按行业名称或关键词查询所属 ICS/CCS 分类。
 * 约定：`GET /api/standards/industry-taxonomy/query/?q=&scheme=`
 */
export async function queryIndustryClassification(
  q: string,
  scheme?: 'ICS' | 'CCS',
): Promise<IndustryTaxonomyHit[]> {
  const { data } = await request.get<ApiEnvelope<IndustryTaxonomyHit[]> | IndustryTaxonomyHit[]>(
    'standards/industry-taxonomy/query/',
    { params: { q, scheme } },
  )
  if (Array.isArray(data)) {
    return data
  }
  if (data && typeof data === 'object' && 'code' in data) {
    const wrapped = data as ApiEnvelope<IndustryTaxonomyHit[]> & { msg?: string }
    if (wrapped.code !== 200) {
      throw new Error(wrapped.msg || '查询失败')
    }
    return wrapped.data ?? []
  }
  return []
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
 * 单条谱系关系增删改。
 * 约定：`POST /api/standards/pedigree/relation-mutation/`，JSON：`op`、`source`、`target`、`relation_type`（create/update 必填类型时带上）。
 */
export async function mutatePedigreeRelation(body: PedigreeRelationMutationPayload): Promise<void> {
  const { data } = await request.post<ApiEnvelope<unknown> | Record<string, unknown>>(
    'standards/pedigree/relation-mutation/',
    body,
  )
  assertPostEnvelopeOk(data)
}

/**
 * 批量提交谱系关系（新增为主，后端可定义是否幂等）。
 * 约定：`POST /api/standards/pedigree/relations/batch/`，JSON：`items: [{ source, target, relation_type }]`
 */
export async function submitPedigreeRelationsBatch(
  items: { source: string; target: string; relation_type: string }[],
): Promise<void> {
  if (items.length === 0) {
    throw new Error('没有可提交的关系')
  }
  const { data } = await request.post<ApiEnvelope<unknown> | Record<string, unknown>>(
    'standards/pedigree/relations/batch/',
    { items },
  )
  assertPostEnvelopeOk(data)
}
