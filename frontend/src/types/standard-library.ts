/** DRF 分页列表 */
export type DrfPaginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/** StdBase 列表行（后端 fields='__all__'，此处仅声明界面常用列） */
export type StdBaseRow = {
  id?: number
  bz_id?: string
  bz_name?: string
  ex_state?: string
  release_date?: string
  implement_time?: string
  /** ProTable 查询表单字段，仅提交给后端 `search` */
  search?: string
  [key: string]: unknown
}

export type ApiEnvelope<T> = {
  code: number
  msg?: string
  data: T
}

export type BasicSearchItem = {
  id: number
  bz_id: string
  bz_name: string
  ex_state: string
  release_date: string | null
  implement_time: string | null
}

export type StatisticsPayload = {
  types: Record<string, number>
  states: Record<string, number>
}

/** GET standards/check-latest/ 成功时无 code 包装 */
export type CheckLatestOk = {
  query_bz_id: string
  is_latest: boolean
  current_latest_id: string
  pedigree_chain: string
}

export type TreeNode = {
  id: string
  name: string
  ex_state: string
}

export type TreeLink = {
  source: string
  target: string
  relation_type: string
}

export type TreeDataPayload = {
  nodes: TreeNode[]
  links: TreeLink[]
}

/** 谱系关系写操作（与 `POST .../relation-mutation/` 约定对齐，待后端落地） */
export type PedigreeRelationOp = 'create' | 'update' | 'delete'

export type PedigreeRelationMutationPayload = {
  op: PedigreeRelationOp
  source: string
  target: string
  relation_type?: string
}

export type PrefaceDiffResponse =
  | { code: 400; msg: string }
  | { code: 500; msg: string }
  | { code: 200; status: 'not_found'; msg: string }
  | { code: 200; status: 'ready'; data: unknown }
  | { code: 200; status: 'extracting'; msg: string }
  | { code: 200; status: 'file_missing'; msg: string; bz_id?: string }

export type IndexTableRow = {
  id?: number
  bz_id?: string
  index_name?: string
  index_type?: string
  index_context?: unknown
  [key: string]: unknown
}

/** 行业 → ICS/CCS 分类查询结果（接口契约待后端确认） */
export type IndustryTaxonomyHit = {
  scheme: 'ICS' | 'CCS'
  code: string
  name: string
  /** 自根到叶的路径描述，可选 */
  path?: string
}
