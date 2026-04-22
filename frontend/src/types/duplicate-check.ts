/** 查重服务：请求体（与后端对齐时可扩展字段） */
export type DuplicateCheckPayload = {
  standardName: string
  keywords?: string[]
  outline?: string
}

/** 单条重合/相似结果 */
export type DuplicateCheckHit = {
  id: string
  candidateName: string
  matchedName: string
  /** 0–100 */
  similarity: number
  highlights?: string[]
  createdAt: string
  /** 后端返回的报告摘要或详情 */
  report?: DuplicateCheckReport | unknown
}

export type DuplicateCheckReport = {
  taskId?: string
  summary?: string
  overlapList?: DuplicateOverlapRow[]
  conclusion?: string
  [key: string]: unknown
}

export type DuplicateOverlapRow = {
  standardNo?: string
  name: string
  similarity: number
}

export type DuplicateCheckRiskLevel = 'low' | 'medium' | 'high'

/** 前端根据阈值与最高相似度给出的结论（流程图：与阈值比对） */
export type DuplicateCheckSummary = {
  maxSimilarity: number
  riskLevel: DuplicateCheckRiskLevel
  conclusionText: string
}
