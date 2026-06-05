import type { StandardLatestCheckResult } from '@/services/compliance'

/** 与第四步「仅 GB 须填最新标准号」一致 */
export function isGbReferencedStandard(code: string): boolean {
  return /^GB/i.test(code.trim())
}

export type Step5AuditDiagnostics = {
  /** ① 不参与指标对比：企标引用中非 GB 开头 */
  excludedNonGb: StandardLatestCheckResult[]
  /** ② 库内信息不完整：GB 引用但发布时完整号或最新标准号为空 */
  incompleteDb: StandardLatestCheckResult[]
  /** ③ 左列：可进行指标对比的 GB 引用（两字段均有值） */
  comparableReferences: StandardLatestCheckResult[]
  /** ③ 右列：第四步 supplements 补充的 M 个标准号 */
  supplementStdCodes: string[]
}

/**
 * 基于第四步「引用标准有效性与更替确认」查新表（reference-latest）及已补充的 M 标准号分类。
 */
export function classifyStep5AuditDiagnostics(
  referenceLatestRows: StandardLatestCheckResult[],
  supplementStdCodes: string[],
): Step5AuditDiagnostics {
  const excludedNonGb: StandardLatestCheckResult[] = []
  const incompleteDb: StandardLatestCheckResult[] = []
  const comparableReferences: StandardLatestCheckResult[] = []

  for (const row of referenceLatestRows) {
    const ref = row.queryBzId.trim()
    if (!ref || ref === '-') continue

    if (!isGbReferencedStandard(ref)) {
      excludedNonGb.push(row)
      continue
    }

    const publicationFull = (row.historicalFullStdCode ?? '').trim()
    const latestStd = row.currentLatestId.trim()
    if (!publicationFull || !latestStd) {
      incompleteDb.push(row)
      continue
    }

    comparableReferences.push(row)
  }

  const supplements = Array.from(
    new Set(supplementStdCodes.map((code) => code.trim()).filter((code) => code.length > 0)),
  )

  return {
    excludedNonGb,
    incompleteDb,
    comparableReferences,
    supplementStdCodes: supplements,
  }
}
