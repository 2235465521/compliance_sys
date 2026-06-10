/** 与 docs/backend-batch-normative-reference-API-前端对接手册.md §3、§6 及 STSC L3 字段迁移对齐 */

export type BatchNormativeRefJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type BatchNormativeRefItemStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface BatchNormativeRefItemOut {
  id: number
  sort_order: number
  original_filename: string
  status: BatchNormativeRefItemStatus
  error_message: string | null
  references_resolved: unknown[] | null
  /** 后端可选：解析得到的企标/企业元数据（STSC L3；与 OpenAPI 对齐） */
  subject_code?: string | null
  subject_name?: string | null
  company_name?: string | null
  catalog_std_type_no?: string | null
  /** @deprecated 旧 v1 字段，后端 STSC 切换后不再返回；读取时请优先 `subject_code` */
  qb_name?: string | null
  enterprise_standard_name?: string | null
  /** @deprecated 旧 v1 字段，请优先 `subject_code` */
  qb_code?: string | null
  /** 企标标准全名 / 备案名称（后端字段名以 OpenAPI 为准） */
  qb_title?: string | null
  standard_name?: string | null
  /** 实施日期（常见：ISO 日期字符串；键名以后端为准） */
  implementation_date?: string | null
  effective_date?: string | null
  publish_date?: string | null
  /**
   * 整文件自动合规四态（仅 `completed` 时有值，否则 `null`）。
   * 见 docs/frontend-规范性引用与批量查新-接口变更对接说明-2026.md §2。
   */
  file_compliance_outcome?: 'no_references' | 'non_compliant' | 'compliant' | 'undetermined' | null
}

export interface BatchNormativeRefJobOut {
  id: number
  status: BatchNormativeRefJobStatus
  label: string | null
  /** 整批维度公司名（可选；亦可仅用 items[].company_name） */
  company_name?: string | null
  total_items: number
  completed_items: number
  failed_items: number
  error_summary: string | null
  created_at: string
  updated_at: string
  items: BatchNormativeRefItemOut[]
}

/** 列表接口返回的单条摘要（字段名以后端 OpenAPI 为准，前端做宽松解析） */
export type BatchNormativeRefJobSummary = Pick<
  BatchNormativeRefJobOut,
  | 'id'
  | 'status'
  | 'label'
  | 'company_name'
  | 'total_items'
  | 'completed_items'
  | 'failed_items'
  | 'created_at'
  | 'updated_at'
> & {
  error_summary?: string | null
}

export interface BatchNormativeRefJobListPage {
  results: BatchNormativeRefJobSummary[]
  total: number
  page: number
  page_size: number
}

export interface BatchNormativeRefModuleMetaOut {
  module: string
  requirement_section?: string
  scope?: string
}
