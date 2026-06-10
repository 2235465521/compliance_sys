import { mapReferencesResolvedToStandardLatestResults } from '@/services/compliance'

/**
 * 从批量子项 `references_resolved` 推导参与指标对比的「最新 N 个国标」标准号。
 * 规则：仅 `compliance_assessable === true` 且 `latest_std_primary` 非空；不含 M 补充行。
 */
export function buildBatchLatestStdCodes(referencesResolved: unknown[] | null | undefined): string[] {
  const rows = mapReferencesResolvedToStandardLatestResults(referencesResolved)
  const set = new Set<string>()
  for (const row of rows) {
    if (!row.complianceAssessable) continue
    const latest = row.currentLatestId.trim()
    if (latest) set.add(latest)
  }
  return [...set]
}

/** 从 compare_pairs 仅取 latest 侧（合规向导批量复用） */
export function buildLatestOnlyStdCodesFromComparePairs(
  pairs: Array<{ publication_std_code?: string | null; latest_std_code: string }>,
): string[] {
  const set = new Set<string>()
  for (const p of pairs) {
    const latest = p.latest_std_code?.trim()
    if (latest) set.add(latest)
  }
  return [...set]
}
