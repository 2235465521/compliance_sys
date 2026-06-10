import axios from 'axios'

/** `/api/v1/batch-indicator-compare`，鉴权与合规模块一致 */
export function getBatchIndicatorCompareApiBaseUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api'
  const normalized = base.replace(/\/+$/, '')
  return `${normalized}/v1/batch-indicator-compare`
}

export const batchIndicatorCompareClient = axios.create({
  baseURL: getBatchIndicatorCompareApiBaseUrl(),
  timeout: 120_000,
})

batchIndicatorCompareClient.interceptors.request.use((config) => {
  const path = typeof config.url === 'string' ? config.url : ''
  const isModuleOnly = path === '/module' || path === 'module' || path.endsWith('/module')
  const token = (import.meta.env.VITE_COMPLIANCE_API_TOKEN as string | undefined)?.trim()
  if (token && !isModuleOnly) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

batchIndicatorCompareClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
)
