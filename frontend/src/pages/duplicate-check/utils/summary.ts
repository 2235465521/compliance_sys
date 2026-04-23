import type {
  DuplicateCheckHit,
  DuplicateCheckRiskLevel,
  DuplicateCheckSummary,
} from '@/types/duplicate-check'

function conclusionForRisk(risk: DuplicateCheckRiskLevel, maxSimilarity: number) {
  if (risk === 'low') return '结论：重合度较低，建议立项。'
  if (risk === 'medium')
    return `结论：重合度介于 70% 与 85% 之间（当前最高 ${Math.round(maxSimilarity)}%），建议修改后再立项。`
  return `结论：重合度 ≥ 85%（当前最高 ${Math.round(maxSimilarity)}%），不建议立项。`
}

/** 流程图：按最高重合度分档（低 / 中 / 高三档） */
export function computeDuplicateSummary(
  hits: DuplicateCheckHit[],
): DuplicateCheckSummary | null {
  if (!hits.length) return null
  const maxSimilarity = Math.max(...hits.map((h) => h.similarity))

  let riskLevel: DuplicateCheckRiskLevel
  if (maxSimilarity < 70) riskLevel = 'low'
  else if (maxSimilarity < 85) riskLevel = 'medium'
  else riskLevel = 'high'

  return {
    maxSimilarity,
    riskLevel,
    conclusionText: conclusionForRisk(riskLevel, maxSimilarity),
  }
}
