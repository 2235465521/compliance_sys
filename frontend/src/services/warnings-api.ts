/**
 * 预警模块 HTTP 封装
 * 手册：docs/backend-warnings-API-前端对接手册.md
 */
import axios from 'axios'
import type {
  ForwardWarningResponseApi,
  MonitorEnterpriseListPageApi,
  MonitorSummaryApi,
  ReverseWarningResponseApi,
  WarningsScanResponseApi,
} from '@/types/warnings-api'

export class WarningsApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'WarningsApiError'
    this.status = status
  }
}

function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api'
}

const warningsClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 120_000,
})

warningsClient.interceptors.request.use((config) => {
  const token = (import.meta.env.VITE_COMPLIANCE_API_TOKEN as string | undefined)?.trim()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

function extractDetail(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { detail?: unknown; msg?: string; message?: string } } })
      .response
    const d = res?.data?.detail ?? res?.data?.msg ?? res?.data?.message
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d[0] && typeof d[0] === 'object' && 'msg' in (d[0] as object)) {
      return String((d[0] as { msg: string }).msg)
    }
  }
  return '请求失败'
}

function wrapError(err: unknown): never {
  const status =
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { status?: number } }).response?.status
      : undefined
  throw new WarningsApiError(extractDetail(err), status)
}

function unwrapData<T>(raw: unknown): T {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if ((o.code === 200 || o.code === 0) && o.data != null) return o.data as T
    if (o.success === true && o.data != null) return o.data as T
  }
  return raw as T
}

export async function fetchForwardWarningByQb(qbCode: string): Promise<ForwardWarningResponseApi> {
  try {
    const { data } = await warningsClient.get('/warnings/forward-by-qb/', {
      params: { qb_code: qbCode.trim() },
    })
    return unwrapData<ForwardWarningResponseApi>(data)
  } catch (e) {
    wrapError(e)
  }
}

export async function fetchForwardWarningByFile(
  file: File,
  qbCode?: string,
): Promise<ForwardWarningResponseApi> {
  const form = new FormData()
  form.append('file', file, file.name)
  if (qbCode?.trim()) form.append('qb_code', qbCode.trim())
  try {
    const { data } = await warningsClient.post('/warnings/forward-by-file/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return unwrapData<ForwardWarningResponseApi>(data)
  } catch (e) {
    wrapError(e)
  }
}

export async function fetchReverseWarning(bzId: string): Promise<ReverseWarningResponseApi> {
  try {
    const { data } = await warningsClient.get('/standards/warning-trace/', {
      params: { bz_id: bzId.trim() },
    })
    return unwrapData<ReverseWarningResponseApi>(data)
  } catch (e) {
    wrapError(e)
  }
}

export async function fetchMonitorSummary(): Promise<MonitorSummaryApi> {
  try {
    const { data } = await warningsClient.get('/warnings/monitor/summary/')
    return unwrapData<MonitorSummaryApi>(data)
  } catch (e) {
    wrapError(e)
  }
}

export async function fetchMonitorEnterprises(params: {
  page?: number
  page_size?: number
  keyword?: string
  status?: 'need_attention' | 'all_ok' | 'all'
}): Promise<MonitorEnterpriseListPageApi> {
  try {
    const { data } = await warningsClient.get('/warnings/monitor/enterprises/', { params })
    return unwrapData<MonitorEnterpriseListPageApi>(data)
  } catch (e) {
    wrapError(e)
  }
}

/**
 * 监控下钻明细。企标号常含 `/`（如 Q/15763.2-2005），必须用 query 传参，
 * 勿走路径 `/enterprises/{qb_code}/`（%2F 可能被当作路径分隔符导致 404）。
 */
export async function fetchMonitorEnterpriseDetail(
  qbCode: string,
): Promise<ForwardWarningResponseApi> {
  try {
    const { data } = await warningsClient.get('/warnings/monitor/enterprises/detail/', {
      params: { qb_code: qbCode.trim() },
    })
    return unwrapData<ForwardWarningResponseApi>(data)
  } catch (e) {
    wrapError(e)
  }
}

export async function triggerWarningsScan(): Promise<WarningsScanResponseApi> {
  try {
    const { data } = await warningsClient.post('/warnings/scan/')
    return unwrapData<WarningsScanResponseApi>(data)
  } catch (e) {
    wrapError(e)
  }
}

/** 文件解析入队（保留旧通道，与 WebSocket 配合） */
export async function submitAnalyzeQbReferences(file: File): Promise<{ code?: number; msg?: string }> {
  const form = new FormData()
  form.append('file', file, file.name)
  try {
    const { data } = await warningsClient.post('/analyze_qb_references_auto/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    })
    return (data ?? {}) as { code?: number; msg?: string }
  } catch (e) {
    wrapError(e)
  }
}
