import axios from 'axios'
import type { MissingGbFileItem } from '@/types/compliance-api'

/** 与手册 §8 一致的友好提示（detail 已含长说明时仍以 detail 优先） */
export const COMPLIANCE_MYSQL_REQUIRED_HINT =
  '本步骤需要后端使用 MySQL 数据库。当前为 SQLite 或未配置 MySQL 时接口会返回 503，请配置 MYSQL_DATABASE 等环境变量后重试。'

const MISSING_GB_REASON_HINT: Record<string, string> = {
  empty_std_file_path: '缺少国标电子版或服务器未配置 std_file_path',
}

/** 手册 4.14：审核 4 确认 422 时 detail 常为 JSON 字符串，内含 missing_gb_files */
export function formatMissingGbFilesMessage(items: MissingGbFileItem[]): string {
  if (items.length === 0) return '仍有国标文件未就绪，无法通过审核 4。'
  const lines = items.slice(0, 15).map((it) => {
    const code = it.std_code?.trim() || '-'
    const name = it.std_name?.trim() ? `（${it.std_name.trim()}）` : ''
    const hint = it.reason ? MISSING_GB_REASON_HINT[it.reason] ?? it.reason : ''
    return `・${code}${name}${hint ? `：${hint}` : ''}`
  })
  const tail =
    items.length > 15
      ? `\n… 共 ${items.length} 项标准缺文件，请上传国标或联系管理员配置路径后再点「下一步」。`
      : `\n共 ${items.length} 项标准缺文件，请在本页「引用标准补齐工具」上传国标，或联系管理员配置服务器上的国标文件路径后再点「下一步」。`
  return `无法进入下一步：审核 4 确认要求「缺失国标文件」为空，当前仍有未就绪项。\n${lines.join('\n')}${tail}`
}

function tryExtractMissingGbFilesFromResponseData(data: unknown): MissingGbFileItem[] | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  if (Array.isArray(o.missing_gb_files)) {
    return o.missing_gb_files as MissingGbFileItem[]
  }
  const detail = o.detail
  if (typeof detail === 'string') {
    const t = detail.trim()
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t) as Record<string, unknown>
        if (Array.isArray(parsed.missing_gb_files)) {
          return parsed.missing_gb_files as MissingGbFileItem[]
        }
      } catch {
        return null
      }
    }
  }
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>
    if (Array.isArray(d.missing_gb_files)) {
      return d.missing_gb_files as MissingGbFileItem[]
    }
  }
  return null
}

export function getComplianceApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return '网络连接失败：无法访问后端，请确认服务已启动且代理/地址正确。'
    }
    const data = error.response.data
    const missing = tryExtractMissingGbFilesFromResponseData(data)
    if (missing && missing.length > 0) {
      return formatMissingGbFilesMessage(missing)
    }
    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = (data as { detail: unknown }).detail
      if (typeof detail === 'string' && detail.trim()) {
        return detail.trim()
      }
      if (Array.isArray(detail)) {
        try {
          return JSON.stringify(detail)
        } catch {
          return '请求参数校验失败'
        }
      }
    }
    const st = error.response.status
    if (st === 503) {
      return COMPLIANCE_MYSQL_REQUIRED_HINT
    }
    if (st >= 500) {
      return `服务端异常（HTTP ${st}），请稍后重试。`
    }
    if (st === 404) {
      return '资源不存在（404）。'
    }
    if (st === 403) {
      return '无权限访问（403），请检查鉴权 Token 与租户。'
    }
  }
  return error instanceof Error ? error.message : '请求失败'
}

/** 手册 4.14：422 时 detail 可能为 JSON 字符串 */
export function tryParseComplianceDetailJson<T>(error: unknown): T | null {
  if (!axios.isAxiosError(error)) return null
  const detail = (error.response?.data as { detail?: unknown })?.detail
  if (typeof detail !== 'string') return null
  const t = detail.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return null
  try {
    return JSON.parse(t) as T
  } catch {
    return null
  }
}

export function isComplianceMysql503(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 503
}
