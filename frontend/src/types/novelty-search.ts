/** 查新任务生命周期（与 docs/member-five/02-novelty-search.md 对齐） */
export type NoveltyTaskStatus =
  | 'queued'
  | 'parsing'
  | 'pending_confirm'
  | 'comparing'
  | 'completed'
  | 'failed'

export type NoveltyTaskSource = 'upload' | 'form' | 'national'

/** 比对三态 + 兜底 */
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
  stdNo: string
  stdName: string
  existsInDb: boolean
  conclusion: CompareConclusion
  replacementNo?: string
  replacementName?: string
  pedigreeSummary?: string
  rowError?: string
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
  /** 比对进度 0～total */
  compareDone: number
  reportState: ReportState
  reportGeneratedAt?: string
}

export interface CreateTaskFromUploadInput {
  /** 企标号，必填 */
  enterpriseStdNo: string
  /** 仅演示：文件名，真实环境应上传至对象存储并由后端返回 fileId */
  fileName: string
}

export interface CreateTaskFromFormInput {
  /** 企标号，必填 */
  enterpriseStdNo: string
  /** 每行一个标准号或逗号分隔 */
  stdNosText: string
}

/** 上传国标：多个国标用顿号「、」分隔，演示环境本地解析「最新版」 */
export interface CreateTaskFromNationalInput {
  /** 国标列表原文，如 GB/T 601-2016、GB/T 602-2016 */
  nationalStdNosText: string
}
