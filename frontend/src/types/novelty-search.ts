/** 查新任务生命周期（与 docs/member-five/02-novelty-search.md 对齐） */
export type NoveltyTaskStatus =
  | 'queued'
  | 'loading_history'
  | 'parsing'
  | 'pending_confirm'
  | 'comparing'
  | 'completed'
  | 'failed'

export type NoveltyTaskSource = 'upload' | 'form' | 'national'

/** 行级比对结论（三列查新） */
export type NoveltyRowConclusion =
  | 'unchanged'
  | 'updated'
  | 'first_record'
  | 'unresolved'
  | 'not_assessable'

/** 任务级结论 */
export type NoveltyTaskConclusion =
  | 'has_updates'
  | 'all_unchanged'
  | 'partial'
  | 'pending'
  | 'empty_history'

/** @deprecated 旧演示三态，仅报告等兼容字段 */
export type CompareConclusion = 'active' | 'obsolete' | 'incoming' | 'unknown' | 'pending'

export type ReportState = 'none' | 'generating' | 'ready' | 'failed'

export interface ReferenceSheetRow {
  id: string
  stdNo: string
  stdName: string
  techFragment?: string
  remark?: string
}

export interface CompareRow {
  id: string
  sheetRowId: string
  /** 企标原文引用标准号 */
  referencedStdCode: string
  /** 列1：补全年代号的标准号 */
  fullStdAtPublication: string
  /** 列2：首次查新时最新标准号 */
  baselineLatestStd: string
  /** 列3：本次查新最新标准号 */
  currentLatestStd: string
  rowConclusion: NoveltyRowConclusion
  rowConclusionLabel: string
  complianceAssessable?: boolean
  explanation?: string
  baselineSource?: 'compliance' | 'batch'
  baselineRecordedAt?: string
  /** @deprecated 兼容旧 UI */
  stdNo: string
  /** @deprecated */
  stdName: string
  /** @deprecated */
  existsInDb: boolean
  /** @deprecated */
  conclusion: CompareConclusion
  replacementNo?: string
  replacementName?: string
  pedigreeSummary?: string
  rowError?: string
}

export interface SourceEvaluationSummary {
  sourceType: 'compliance' | 'batch'
  sourceId: number
  evaluatedAt: string
  title: string
}

export interface NoveltyEnterpriseIndicator {
  id: string
  name: string
  value: string
  source?: string
  sourceId?: number
}

export interface NoveltyIndicatorsBundle {
  enterpriseIndicators: NoveltyEnterpriseIndicator[]
  nationalByStdCode: Record<string, unknown[]>
  sourceEvaluations: SourceEvaluationSummary[]
}

export interface NoveltyTask {
  id: string
  title: string
  enterpriseName: string
  /** 企标号（创建任务时必填，用于归档与检索） */
  enterpriseStdNo: string
  status: NoveltyTaskStatus
  source: NoveltyTaskSource
  /** 上传通道时的展示名 */
  fileName?: string
  /** 表单通道：用户填写的标准号（逗号分隔或数组） */
  formStdNos?: string[]
  createdAt: string
  updatedAt: string
  errorSummary?: string
  sheetConfirmed: boolean
  referenceSheet: ReferenceSheetRow[]
  compareRows: CompareRow[]
  /** 比对进度：已完成条数 */
  compareDone: number
  /** 比对总条数 */
  compareTotal: number
  reportState: ReportState
  reportGeneratedAt?: string
  taskConclusion?: NoveltyTaskConclusion
  taskSummary?: string
  sourceEvaluations?: SourceEvaluationSummary[]
  indicatorsAvailable?: boolean
}

export interface CreateTaskFromUploadInput {
  /** 企标号，必填 */
  enterpriseStdNo: string
  /** 可选上传企标 PDF/DOCX（后端仅保存文件，不触发解析） */
  file?: File
}
