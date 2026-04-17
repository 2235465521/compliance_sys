import request from '@/services/request'
import type {
  ComplianceTask,
  CreateComplianceTaskRequest,
} from '@/types/compliance'
import axios from 'axios'

const STANDARDS_API = '/standards/'
const INDEXES_TABLE_API = '/indexes_table/'
const ANALYZE_QB_REFERENCES_API = '/analyze_qb_references_auto/'
const EXPORT_REPORT_API = '/standards/export-report/'
const AUDIT_PENDING_INDEXES_API = '/audit/pending_indexes/'
const AUDIT_SUBMIT_API = '/audit/submit/'
const AUDIT_BULK_SUBMIT_API = '/audit/bulk_submit/'
const CHECK_REFERENCES_API = '/check_references/'
const INSERT_ANTI_WARN_API = '/insert_anti_warn/'
const INSERT_INDEXES_API = '/insert_indexes/'

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
}

export type StandardLatestCheckResult = {
  queryBzId: string
  isLatest: boolean
  currentLatestId: string
  pedigreeChain: string
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

const normalizeList = <T>(data: ListResponse<T>): T[] => {
  if (Array.isArray(data)) {
    return data
  }
  return data.results ?? data.data ?? []
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
    const response = await request.get<ListResponse<Record<string, unknown>>>(STANDARDS_API)
    const rows = normalizeList(response.data).map(toComplianceTask)
    return {
      ...response,
      data: rows,
    }
  } catch (error) {
    with404Hint(error, `${request.defaults.baseURL}${STANDARDS_API}`)
  }
}

export const getComplianceTask = async (id: string) =>
  request.get<ComplianceTask>(`${STANDARDS_API}${id}/`)

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

export const uploadEnterpriseStandard = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post(ANALYZE_QB_REFERENCES_API, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const exportComplianceReport = async (bzId: string) => {
  return request.get(EXPORT_REPORT_API, {
    params: { bz_id: bzId },
    responseType: 'blob',
  })
}

const toPendingIndexItem = (item: Record<string, unknown>, index: number): PendingIndexItem => ({
  id: String(item.id ?? `pending-${index}`),
  standardName: toReadableText(item.bz_name ?? item.standard_name ?? item.standard ?? item.bz_id),
  indicatorName: toReadableText(item.indicator_name ?? item.index_name ?? item.name ?? item.metric_name),
  indicatorValue: toReadableText(item.indicator_value ?? item.index_context ?? item.value ?? item.content),
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
  indexValue: toReadableText(item.index_context ?? item.indicator_value ?? item.value ?? item.content ?? '-'),
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
  return {
    ...response,
    data: normalizeList(response.data).map(toNationalIndexItem),
  }
}

export const checkLatestStandard = async (bzId: string): Promise<StandardLatestCheckResult> => {
  const response = await request.get<Record<string, unknown>>(`${STANDARDS_API}check-latest/`, {
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

/**
 * 指标入专用表（index_table），初始 status=0 待审核（通常由 Celery 在解析链路中调用；联调时可由前端直调）。
 */
export const postInsertIndexes = async (payload?: Record<string, unknown>) => {
  return request.post(INSERT_INDEXES_API, payload ?? {})
}
