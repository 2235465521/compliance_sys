/** DRF 分页列表 */
export type DrfPaginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/** StdBase 列表行（`/api/v1/standards/` 列表以 camelCase 为主，仍兼容旧 snake_case） */
export type StdBaseRow = {
  id?: number
  /** camelCase：标准号 */
  stdCode?: string
  bzId?: string
  /** camelCase：标准名称 */
  bzName?: string
  stdName?: string
  /** camelCase：标准类别（原 std_category） */
  stdCategory?: string
  /** camelCase：发布日期（原 publish_date / bz_release_date 等） */
  bzReleaseDate?: string | null
  publishDate?: string | null
  stdStatus?: string
  implementTime?: string | null
  effectiveDate?: string | null
  /** 兼容旧序列化 */
  bz_id?: string
  bz_name?: string
  ex_state?: string
  release_date?: string
  implement_time?: string
  std_category?: string
  bz_release_date?: string
  publish_date?: string
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

/** GET standards/check-latest/ 成功时无 code 包装（pedigree_chain 为代际/替代链序号列） */
export type CheckLatestOk = {
  query_bz_id: string
  is_latest: boolean
  current_latest_id: string
  pedigree_chain: string[]
}

/** POST standards/pedigree/relations/batch/ 成功体（后端可附 errors） */
export type PedigreeRelationsBatchResponse = {
  code: number
  created?: number
  skipped?: number
  errors?: unknown[]
  msg?: string
}

export type TreeNode = {
  id: string
  /** 标准号（图谱主标签）；后端保证与标准号语义一致，勿当作标准全称 */
  name: string
  ex_state: string
  /** 标准全称；仅用于悬停、副标题等，可为 null */
  std_name?: string | null
  /** 检索命中的节点；仅此类节点使用强调色 */
  highlighted?: boolean
  /** 层级布局建议（rank/col）；无 layout_pos 时再参与推算像素位置 */
  layout?: {
    rank?: number | null
    col?: number | null
  }
  /** 可选：独立于 `layout_pos` 的同义坐标字段（后端直出 x/y） */
  x?: number | null
  y?: number | null
  /** 图谱上与 `name` 二选一显示标准号文案；为空则用 `name` */
  label?: string | null
  /** GET get_tree_data/ 节点扩展元数据（可选） */
  publish_date?: string | null
  effective_date?: string | null
  responsible_unit?: string | null
}

export type TreeLink = {
  source: string
  target: string
  relation_type: string
}

export type TreeDataPayload = {
  nodes: TreeNode[]
  links: TreeLink[]
  /** 现行最新标准号（与族谱树根/现网语义一致） */
  pedigree_root_std_code?: string | null
  /** GET get_tree_data/ 附带侧栏等行为开关（如 `show_topology_overview`，false 则不展示拓扑概览） */
  node_panel?: {
    show_topology_overview?: boolean
  }
}

/** 谱系关系写操作（`POST .../relation-mutation/`，服务端已移除 delete） */
export type PedigreeRelationOp = 'create' | 'update'

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

/** GET industry-taxonomy/tree/ 返回的嵌套节点（与后端库表结构对齐） */
export type IndustryTaxonomyTreeApiNode = {
  id?: string | number | null
  code?: string | null
  name?: string | null
  /** ICS 专用（与通用 code/name 二选一出现时以后端为准） */
  ics_code?: string | null
  ics_name?: string | null
  ics_level?: number | string | null
  ics_note?: string | null
  /** CCS 专用 */
  ccs_code?: string | null
  ccs_name?: string | null
  parent_code?: string | null
  ccs_note?: string | null
  level?: number | string | null
  effective?: boolean | null
  children?: IndustryTaxonomyTreeApiNode[] | null
}

/** 行业 → ICS/CCS 分类查询结果（接口契约待后端确认） */
export type IndustryTaxonomyHit = {
  scheme: 'ICS' | 'CCS'
  code: string
  name: string
  /** 自根到叶的路径描述，可选 */
  path?: string
}
