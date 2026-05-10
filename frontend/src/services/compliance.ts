import request from '@/services/request'
import type {
  ComplianceTask,
  CreateComplianceTaskRequest,
} from '@/types/compliance'
import axios from 'axios'

/** 标准列表/详情等与后端 `/api/v1/standards/` 对齐 */
const STANDARDS_V1_API = 'v1/standards/'
/** 尚未迁移到 v1 的接口仍挂在 `/api/standards/` 下 */
const STANDARDS_LEGACY_PREFIX = 'standards/'
const INDEXES_TABLE_API = '/indexes_table/'
const BATCH_REFERENCES_API = '/standards/batch-references/'
const BATCH_INDEXES_API = '/standards/batch-indexes/'
const EXPORT_REPORT_API = '/standards/export-report/'
const BASIC_SEARCH_API = '/standards/basic-search/'
const WARNING_TRACE_API = '/standards/warning-trace/'
const DOWNLOAD_DOC_API = '/standards/download-doc/'
const DASHBOARD_ALERTS_API = '/standards/dashboard-alerts/'
const STANDARDS_STATISTICS_API = 'v1/standards/statistics/'
const AUDIT_PENDING_INDEXES_API = '/audit/pending_indexes/'
const AUDIT_SUBMIT_API = '/audit/submit/'
const AUDIT_BULK_SUBMIT_API = '/audit/bulk_submit/'
const CHECK_REFERENCES_API = '/check_references/'
const ANALYZE_QB_REFERENCES_AUTO_API = '/analyze_qb_references_auto/'
const INSERT_ANTI_WARN_API = '/insert_anti_warn/'
const SAVE_MAPPING_API = '/save_mapping/'
const SAVE_MAPPING_COMPAT_API = '/mapping/save/'
const DIFY_PREFACE_DIFF_API = '/dify/preface-diff/'
const TREE_DATA_API = '/get_tree_data/'

type ListResponse<T> = {
  results?: T[]
  data?: T[]
} & T[]

export type PendingIndexItem = {
  id: string
  standardName: string
  indicatorName: string
  indicatorValue: string
  statusText: string
}

export type ReferenceCheckItem = {
  original_text: string
  status: string
  message: string
}

export type NationalIndexItem = {
  id: string
  standardId: string
  indexName: string
  indexValue: string
  singleResult?: string
  matchStatus?: string
}

export type StandardLatestCheckResult = {
  queryBzId: string
  isLatest: boolean
  currentLatestId: string
  pedigreeChain: string
}

export type SaveMappingPayload = {
  enterprise_bz_id: string
  national_bz_id: string
}

const toReadableText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '-'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(toReadableText).join('；')
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

const toIndicatorPlainText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '-'
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return '-'
    const looksLikeJson =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    if (looksLikeJson) {
      try {
        return toIndicatorPlainText(JSON.parse(trimmed))
      } catch {
        return trimmed.replace(/[\{\}"']/g, '').trim() || '-'
      }
    }
    return trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    const texts = value.map(toIndicatorPlainText).filter((text) => text && text !== '-')
    return texts.length > 0 ? texts.join('；') : '-'
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => {
        const text = toIndicatorPlainText(val)
        if (!text || text === '-') return ''
        return key ? `${key}：${text}` : text
      })
      .filter(Boolean)
    if (entries.length > 0) {
      return entries.join('；')
    }
    return '-'
  }
  return String(value)
}

const normalizeList = <T>(data: ListResponse<T>): T[] => {
  if (Array.isArray(data)) {
    return data
  }
  const listPayload = data as { results?: T[]; data?: T[] }
  return listPayload.results ?? listPayload.data ?? []
}

const with404Hint = (error: unknown, endpoint: string) => {
  if (axios.isAxiosError(error) && error.response?.status === 404) {
    throw new Error(`后端未提供接口: ${endpoint}`)
  }
  throw error
}

const mapStatusToTaskStatus = (rawStatus: unknown): ComplianceTask['status'] => {
  const statusText = String(rawStatus ?? '')
  if (statusText.includes('现行') || statusText.toLowerCase().includes('active')) {
    return 'completed'
  }
  if (statusText.includes('即将') || statusText.toLowerCase().includes('processing')) {
    return 'processing'
  }
  if (statusText.includes('废止') || statusText.toLowerCase().includes('invalid')) {
    return 'failed'
  }
  return 'pending'
}

const toComplianceTask = (item: Record<string, unknown>, index: number): ComplianceTask => {
  const status = mapStatusToTaskStatus(item.status)
  const progressByStatus: Record<ComplianceTask['status'], number> = {
    pending: 0,
    processing: 50,
    completed: 100,
    failed: 100,
  }
  return {
    id: String(item.id ?? item.bz_id ?? `std-${index}`),
    name: String(item.bz_name ?? item.name ?? item.title ?? '标准任务'),
    enterprise: String(item.draft_org ?? item.org_name ?? item.enterprise ?? '-'),
    status,
    progress: progressByStatus[status],
    createTime: String(item.created_at ?? item.publish_date ?? ''),
    deadline: String(item.impl_date ?? item.effective_date ?? ''),
    evaluator: String(item.evaluator ?? '-'),
    steps: [],
  }
}

export const getComplianceTasks = async () => {
  try {
    const response = await request.get<ListResponse<Record<string, unknown>>>(STANDARDS_V1_API)
    const rows = normalizeList(response.data).map(toComplianceTask)
    return {
      ...response,
      data: rows,
    }
  } catch (error) {
    with404Hint(error, `${request.defaults.baseURL}${STANDARDS_V1_API}`)
  }
}

export const getComplianceTask = async (id: string) =>
  request.get<ComplianceTask>(`${STANDARDS_V1_API}${id}/`)

export const createComplianceTask = async (_payload: CreateComplianceTaskRequest) => {
  throw new Error('后端暂未提供合规任务创建接口，请联系后端补充 /compliance/tasks/ 或等效接口。')
}

export const updateComplianceTask = async (
  _id: string,
  _payload: Partial<ComplianceTask>,
) => {
  throw new Error('后端暂未提供合规任务更新接口。')
}

export const deleteComplianceTask = async (_id: string) => {
  throw new Error('后端暂未提供合规任务删除接口。')
}

export const uploadEnterpriseStandard = async (file: File | File[], bzId?: string) => {
  const files = Array.isArray(file) ? file : [file]
  const formData = new FormData()
  files.forEach((item) => {
    // 兼容后端不同字段约定（file / files / files[]）
    formData.append('files', item)
    formData.append('files[]', item)
  })
  formData.append('file', files[0])
  if (bzId && bzId.trim()) {
    formData.append('bz_id', bzId.trim())
  }
  try {
    return await request.post(BATCH_REFERENCES_API, formData)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 405) {
      throw new Error('后端当前未开放 POST /api/standards/batch-references/，请后端在该新接口上启用 POST。')
    }
    throw error
  }
}

export const exportComplianceReport = async (bzId: string) => {
  return request.get(EXPORT_REPORT_API, {
    params: { bz_id: bzId },
    responseType: 'blob',
  })
}

export const exportComplianceReportBatch = async (bzIds: string[]) => {
  const ids = bzIds.map((item) => item.trim()).filter(Boolean)
  if (ids.length === 0) {
    throw new Error('请至少提供一个标准编号。')
  }
  return request.post(
    EXPORT_REPORT_API,
    { bz_ids: ids },
    {
      responseType: 'blob',
    },
  )
}

export const getStandardsBasicSearch = async (keyword: string) => {
  return request.get(BASIC_SEARCH_API, {
    params: { q: keyword.trim() },
  })
}

export const getStandardsWarningTrace = async (bzId: string) => {
  return request.get(WARNING_TRACE_API, {
    params: { bz_id: bzId.trim() },
  })
}

export const getStandardsDashboardAlerts = async () => {
  return request.get(DASHBOARD_ALERTS_API)
}

export const getStandardsStatistics = async () => {
  return request.get(STANDARDS_STATISTICS_API)
}

export const downloadStandardDoc = async (bzId: string) => {
  return request.get(DOWNLOAD_DOC_API, {
    params: { bz_id: bzId.trim() },
    responseType: 'blob',
  })
}

export const analyzeQbReferencesAuto = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post(ANALYZE_QB_REFERENCES_AUTO_API, formData)
}

export const getDifyPrefaceDiff = async (bzId: string) => {
  return request.get(DIFY_PREFACE_DIFF_API, {
    params: { bz_id: bzId.trim() },
  })
}

export const getTreeData = async (bzId: string) => {
  return request.get(TREE_DATA_API, {
    params: { bz_id: bzId.trim() },
  })
}

const toPendingIndexItem = (item: Record<string, unknown>, index: number): PendingIndexItem => ({
  id: String(item.id ?? `pending-${index}`),
  standardName: toReadableText(item.bz_name ?? item.standard_name ?? item.standard ?? item.bz_id),
  indicatorName: toReadableText(item.indicator_name ?? item.index_name ?? item.name ?? item.metric_name),
  indicatorValue: toIndicatorPlainText(item.indicator_value ?? item.index_context ?? item.value ?? item.content),
  statusText:
    Number(item.status) === 0
      ? '待审核'
      : Number(item.status) === 1
        ? '审核通过'
        : Number(item.status) === 2
          ? '审核驳回'
          : String(item.status_text ?? item.status ?? '待审核'),
})

const toNationalIndexItem = (item: Record<string, unknown>, index: number): NationalIndexItem => ({
  id: toReadableText(item.id ?? `national-${index}`),
  standardId: toReadableText(item.bz_id ?? item.standard_id ?? item.standard ?? '-'),
  indexName: toReadableText(item.index_name ?? item.indicator_name ?? item.name ?? '-'),
  indexValue: toIndicatorPlainText(item.index_context ?? item.indicator_value ?? item.value ?? item.content ?? '-'),
  singleResult: toReadableText(
    item.single_result ??
      item.comparison_result ??
      item.compliance_result ??
      item.judge_result ??
      item.result ??
      '',
  ),
  matchStatus: toReadableText(
    item.match_status ??
      item.mapping_status ??
      item.matching_status ??
      '',
  ),
})

export const getPendingIndexes = async () => {
  const response = await request.get<ListResponse<Record<string, unknown>>>(AUDIT_PENDING_INDEXES_API)
  return {
    ...response,
    data: normalizeList(response.data).map(toPendingIndexItem),
  }
}

export const getNationalIndexes = async (params?: Record<string, unknown>) => {
  const response = await request.get<ListResponse<Record<string, unknown>>>(INDEXES_TABLE_API, { params })
  const mappedRows = normalizeList(response.data).map(toNationalIndexItem)
  const requestedBzId =
    typeof params?.bz_id === 'string' ? params.bz_id.trim() : ''
  const data =
    requestedBzId.length > 0
      ? mappedRows.filter((row) => row.standardId.trim() === requestedBzId)
      : mappedRows
  return {
    ...response,
    data,
  }
}

export const checkLatestStandard = async (bzId: string): Promise<StandardLatestCheckResult> => {
  const response = await request.get<Record<string, unknown>>(`${STANDARDS_LEGACY_PREFIX}check-latest/`, {
    params: { bz_id: bzId },
  })
  const data = response.data
  return {
    queryBzId: toReadableText(data.query_bz_id ?? bzId),
    isLatest: Boolean(data.is_latest),
    currentLatestId: toReadableText(data.current_latest_id ?? data.query_bz_id ?? bzId),
    pedigreeChain: toReadableText(data.pedigree_chain ?? '-'),
  }
}

export const submitAuditDecision = async (
  id: string,
  action: 'approve' | 'reject',
  details?: Record<string, unknown>,
) => {
  return request.post(AUDIT_SUBMIT_API, { id, action, ...details })
}

export const submitAuditBulkDecision = async (
  ids: string[],
  action: 'approve' | 'reject',
) => {
  return request.post(AUDIT_BULK_SUBMIT_API, { ids, action })
}

export const checkReferencesComparison = async (payload: {
  qibiao_release_date: string
  references: Array<{ standard_id: string; has_year: boolean; full_text: string }>
}) => {
  const response = await request.post<{
    success?: boolean
    evaluation_results?: ReferenceCheckItem[]
    data?: ReferenceCheckItem[]
  }>(CHECK_REFERENCES_API, payload)
  return {
    ...response,
    data: response.data.evaluation_results ?? response.data.data ?? [],
  }
}

/**
 * 解析结果落库：引用映射、反向预警链等（通常由 Celery 在收到大模型 JSON 后调用；联调时可由前端直调）。
 */
export const postInsertAntiWarn = async (payload: Record<string, unknown>) => {
  return request.post(INSERT_ANTI_WARN_API, payload)
}

export const saveReferenceMapping = async (payload: SaveMappingPayload) => {
  try {
    return await request.post(SAVE_MAPPING_API, payload)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return request.post(SAVE_MAPPING_COMPAT_API, payload)
    }
    throw error
  }
}

/**
 * 指标入专用表（index_table），初始 status=0 待审核（通常由 Celery 在解析链路中调用；联调时可由前端直调）。
 */
export const postInsertIndexes = async (file: File | File[], bzId?: string) => {
  const files = Array.isArray(file) ? file : [file]
  const formData = new FormData()
  files.forEach((item) => {
    // 兼容后端不同字段约定（file / files / files[]）
    formData.append('files', item)
    formData.append('files[]', item)
  })
  formData.append('file', files[0])
  if (typeof bzId === 'string' && bzId.trim()) {
    formData.append('bz_id', bzId.trim())
  }
  try {
    return await request.post(BATCH_INDEXES_API, formData)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 405) {
      throw new Error('后端当前未开放 POST /api/standards/batch-indexes/，请后端在该新接口上启用 POST。')
    }
    throw error
  }
}
