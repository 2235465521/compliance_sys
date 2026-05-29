import axios from 'axios'

/** `/api/v1/novelty-search`，鉴权与 batch-normative-reference 一致 */
export function getNoveltySearchApiBaseUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api'
  const normalized = base.replace(/\/+$/, '')
  return `${normalized}/v1/novelty-search`
}

export const noveltySearchClient = axios.create({
  baseURL: getNoveltySearchApiBaseUrl(),
  timeout: 120_000,
})

noveltySearchClient.interceptors.request.use((config) => {
  const path = typeof config.url === 'string' ? config.url : ''
  const isModuleOnly = path === '/module' || path === 'module' || path.endsWith('/module')
  const token = (import.meta.env.VITE_COMPLIANCE_API_TOKEN as string | undefined)?.trim()
  if (token && !isModuleOnly) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
