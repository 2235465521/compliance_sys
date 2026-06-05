import type { MissingGbFileItem, StdCodeOrchestrationStatus } from '@/types/compliance-api'

export type StdOrchestrationDisplay = {
  stdCode: string
  hasIndicators: boolean
  stdName: string | null
  reason: string | null
  indicatorCount: number
  statusKind: StdCodeOrchestrationStatus['status'] | 'unknown' | 'missing_file' | 'parsing'
  /** 前端上传国标后、轮询 ensure 完成前 */
  isParsing?: boolean
}

const MISSING_REASON_LABEL: Record<string, string> = {
  empty_std_file_path: '缺少国标电子版或服务器未配置 std_file_path',
  file_not_found: '库内路径已配置但服务器上找不到对应文件',
}

export function formatStdMissingReason(reason: string | null | undefined): string {
  if (!reason?.trim()) return '未知原因'
  return MISSING_REASON_LABEL[reason.trim()] ?? reason.trim()
}

/** 合并 ensure 返回的 std_statuses 与 missing_gb_files，供 ③ 表格按标准号展示状态 */
export function buildStdOrchestrationLookup(
  stdStatuses: StdCodeOrchestrationStatus[],
  missingGbFiles: MissingGbFileItem[],
  parsingStdCodes?: Iterable<string>,
): Map<string, StdOrchestrationDisplay> {
  const parsingSet = new Set(
    [...(parsingStdCodes ?? [])].map((c) => c.trim()).filter((c) => c.length > 0),
  )
  const map = new Map<string, StdOrchestrationDisplay>()

  for (const row of stdStatuses) {
    const code = row.std_code.trim()
    if (!code) continue
    const hasIndicators =
      row.status === 'ready' ||
      row.status === 'parsed_via_dify2' ||
      (row.indicator_count ?? 0) > 0
    map.set(code, {
      stdCode: code,
      hasIndicators,
      stdName: row.std_name ?? null,
      reason: row.reason ?? null,
      indicatorCount: row.indicator_count ?? 0,
      statusKind: row.status,
    })
  }

  for (const miss of missingGbFiles) {
    const code = miss.std_code.trim()
    if (!code) continue
    const existing = map.get(code)
    if (existing?.hasIndicators) continue
    map.set(code, {
      stdCode: code,
      hasIndicators: false,
      stdName: miss.std_name ?? existing?.stdName ?? null,
      reason: miss.reason ?? existing?.reason ?? null,
      indicatorCount: existing?.indicatorCount ?? 0,
      statusKind: 'missing_file',
    })
  }

  for (const code of parsingSet) {
    const existing = map.get(code)
    if (existing?.hasIndicators) continue
    map.set(code, {
      stdCode: code,
      hasIndicators: false,
      stdName: existing?.stdName ?? null,
      reason: existing?.reason ?? null,
      indicatorCount: existing?.indicatorCount ?? 0,
      statusKind: 'parsing',
      isParsing: true,
    })
  }

  return map
}

export function getStdOrchestrationDisplay(
  lookup: Map<string, StdOrchestrationDisplay>,
  stdCode: string,
): StdOrchestrationDisplay | null {
  const code = stdCode.trim()
  if (!code) return null
  const base =
    lookup.get(code) ?? {
      stdCode: code,
      hasIndicators: false,
      stdName: null,
      reason: null,
      indicatorCount: 0,
      statusKind: 'unknown' as const,
    }
  if (base.isParsing) {
    return { ...base, hasIndicators: false, statusKind: 'parsing' }
  }
  return base
}
