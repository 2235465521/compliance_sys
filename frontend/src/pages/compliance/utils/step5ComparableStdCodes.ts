import type { ComparePairIn } from '@/types/compliance-api'
import type { Step5AuditDiagnostics } from '@/pages/compliance/utils/step5AuditDiagnostics'
import { buildBatchLatestStdCodes } from '@/pages/batch-normative-ref/utils/buildBatchLatestStdCodes'

/** 从 ③ 审核诊断结果生成 POST ensure 的 compare_pairs（与 UI 表格行一致） */
export function buildComparePairsFromDiagnostics(diagnostics: Step5AuditDiagnostics): ComparePairIn[] {
  const pairs: ComparePairIn[] = []

  for (const row of diagnostics.comparableReferences) {
    const publication = (row.historicalFullStdCode ?? '').trim()
    const latest = row.currentLatestId.trim()
    if (!latest) continue
    pairs.push({
      publication_std_code: publication || null,
      latest_std_code: latest,
    })
  }

  for (const code of diagnostics.supplementStdCodes) {
    const latest = code.trim()
    if (!latest) continue
    pairs.push({
      publication_std_code: null,
      latest_std_code: latest,
    })
  }

  return pairs
}

/** 从 compare_pairs 仅取 latest 侧标准号（指标编排与对比以最新国标为准） */
export function collectComparableStdCodes(pairs: ComparePairIn[]): string[] {
  const set = new Set<string>()
  for (const pair of pairs) {
    const latest = pair.latest_std_code.trim()
    if (latest) set.add(latest)
  }
  return [...set]
}

/** 从 reference-latest / references_resolved 推导最新 N 标准号（批量与合规复用） */
export function buildLatestOnlyStdCodesFromReferences(
  referencesResolved: unknown[] | null | undefined,
): string[] {
  return buildBatchLatestStdCodes(referencesResolved)
}

/** 用于 useEffect 依赖：③ 内容签名（避免引用数组浅比较失效） */
export function buildComparablePairsSignature(pairs: ComparePairIn[]): string {
  return pairs
    .map((p) => `${p.publication_std_code ?? ''}|${p.latest_std_code}`)
    .sort()
    .join(';')
}
