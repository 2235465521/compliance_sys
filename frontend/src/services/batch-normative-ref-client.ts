import axios from 'axios'

/** `/api/v1/batch-normative-reference`，与合规模块鉴权方式一致 */
export function getBatchNormativeRefApiBaseUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api'
  const normalized = base.replace(/\/+$/, '')
  return `${normalized}/v1/batch-normative-reference`
}

export const batchNormativeRefClient = axios.create({
  baseURL: getBatchNormativeRefApiBaseUrl(),
  timeout: 120_000,
})

batchNormativeRefClient.interceptors.request.use((config) => {
  const path = typeof config.url === 'string' ? config.url : ''
  const isModuleOnly = path === '/module' || path === 'module' || path.endsWith('/module')
  const token = (import.meta.env.VITE_COMPLIANCE_API_TOKEN as string | undefined)?.trim()
  if (token && !isModuleOnly) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

batchNormativeRefClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
)
