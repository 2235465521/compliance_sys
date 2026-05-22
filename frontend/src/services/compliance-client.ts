import axios from 'axios'

/** 与主站 `request` 的 `/api` 根一致，追加 `/v1/compliance` */
export function getComplianceApiBaseUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api'
  const normalized = base.replace(/\/+$/, '')
  return `${normalized}/v1/compliance`
}

export const complianceClient = axios.create({
  baseURL: getComplianceApiBaseUrl(),
  timeout: 120_000,
})

complianceClient.interceptors.request.use((config) => {
  const path = typeof config.url === 'string' ? config.url : ''
  const isModuleOnly = path === '/module' || path === 'module' || path.endsWith('/module')
  const token = (import.meta.env.VITE_COMPLIANCE_API_TOKEN as string | undefined)?.trim()
  if (token && !isModuleOnly) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

complianceClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
)
