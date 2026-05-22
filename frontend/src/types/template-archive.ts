/** 模板文件类型 */
export type TemplateFileType = 'docx' | 'xlsx' | 'pdf' | 'other'

/** 关联业务模块（模板配置管理） */
export type TemplateRelatedModule =
  | 'duplicate-check'
  | 'novelty-search'
  | 'evaluation'
  | 'alert'
  | 'other'

/** 模板库条目 */
export type TemplateConfigItem = {
  id: string
  name: string
  type: TemplateFileType
  version: string
  updatedAt: string
  status: 'active' | 'disabled'
  desc?: string
  /** 占位符字段名列表 */
  placeholders?: string[]
  /** 关联业务模块 */
  relatedModules?: TemplateRelatedModule[]
}

/** 历史档案 / 任务记录 */
export type ArchiveHistoryRecord = {
  id: string
  name: string
  module: TemplateRelatedModule | string
  enterprise?: string
  operatorName?: string
  taskType?: string
  createdAt: string
  status: 'success' | 'failed' | 'running'
  reportId?: string
}

/** 下载中心条目 */
export type DownloadCenterItem = {
  id: string
  fileName: string
  fileType: 'template' | 'report' | 'other'
  sizeText: string
  createdAt: string
  status: 'ready' | 'processing' | 'failed'
  url?: string
  mimeType?: string
}

export type TemplateListQuery = {
  keyword?: string
}

export type ArchiveHistoryQuery = {
  keyword?: string
  status?: string
  enterprise?: string
  operator?: string
  taskType?: string
  timeFrom?: string
  timeTo?: string
}

export type DownloadListQuery = {
  keyword?: string
  status?: string
  enterprise?: string
  operator?: string
  taskType?: string
  timeFrom?: string
  timeTo?: string
}

/** 筛选：任务侧 / 文件侧（成对行可同时满足两者） */
export type ArchiveUnifiedKind = 'record' | 'download'

/** 合并列表中的统一状态（便于筛选与展示） */
export type ArchiveUnifiedDisplayStatus = 'ok' | 'in_progress' | 'failed'

/**
 * 存档合并行：尽量将「任务记录」与对应「下载文件」配成同一行（按 reportId / 文件名等启发式）。
 * 至少包含 record 或 download 之一。
 */
export type ArchiveUnifiedRow = {
  key: string
  record?: ArchiveHistoryRecord
  download?: DownloadCenterItem
}
