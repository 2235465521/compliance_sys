import type { ComparePairIn } from '@/types/compliance-api'
import type { Step5AuditDiagnostics } from '@/pages/compliance/utils/step5AuditDiagnostics'

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

/** 从 compare_pairs 展开并去重全部标准号（两列非空均计入） */
export function collectComparableStdCodes(pairs: ComparePairIn[]): string[] {
  const set = new Set<string>()
  for (const pair of pairs) {
    const pub = (pair.publication_std_code ?? '').trim()
    const latest = pair.latest_std_code.trim()
    if (pub) set.add(pub)
    if (latest) set.add(latest)
  }
  return [...set]
}

/** 用于 useEffect 依赖：③ 内容签名（避免引用数组浅比较失效） */
export function buildComparablePairsSignature(pairs: ComparePairIn[]): string {
  return pairs
    .map((p) => `${p.publication_std_code ?? ''}|${p.latest_std_code}`)
    .sort()
    .join(';')
}
