/** 标准类型分布项（用于饼图） */
export interface StandardTypeStat {
  type: string
  value: number
}

/** 标准执行状态分布项（用于环形图） */
export interface StandardStateStat {
  state: string
  value: number
}

/** 大屏统计接口原始响应 data 字段（与 GET v1/standards/statistics/、v1/dashboard/summary 一致） */
export interface StatisticsData {
  /** 主表总行数 */
  total?: number
  /** 按 std_category 分布 */
  types: Record<string, number>
  /** 现行 / 废止 / 即将实施 / 其它 等语义分组计数 */
  states: Record<string, number>
  statusGroups?: unknown
  byStatus?: Record<string, number>
  byPublishYear?: Record<string, number>
}

/** 废止提示单条（GET v1/dashboard/abolition-hints） */
export interface AbolitionHintItem {
  stdCode: string
  stdName: string
  stdStatus: string
  abolitionDate: string
  daysFromToday: number
}

export interface AbolitionHintsPayload {
  asOf: string
  upcoming: AbolitionHintItem[]
  recent: AbolitionHintItem[]
}

/** 预警条目 */
export interface WarningItem {
  id: number
  old_bz_id: string
  new_bz_id: string
  quote_bz: string
  is_read: boolean
  create_time: string
}

/** 预警列表接口响应 */
export interface WarningListResponse {
  success: boolean
  unread_count: number
  data: WarningItem[]
}

/** 仪表盘汇总状态（store 内使用） */
export interface DashboardStats {
  /** 标准总量 */
  totalCount: number
  /** 现行数 */
  activeCount: number
  /** 即将实施数 */
  pendingCount: number
  /** 废止数 */
  revokedCount: number
  /** 近期废止条数（abolition-hints recent 窗口内） */
  unreadWarnings: number
  /** 废止提示基准日 */
  abolitionHintsAsOf?: string
  abolitionUpcoming?: AbolitionHintItem[]
  abolitionRecent?: AbolitionHintItem[]
  /** 类型分布（饼图用） */
  typeData: StandardTypeStat[]
  /** 状态分布（环形图用） */
  stateData: StandardStateStat[]
  /** 预警列表 */
  warnings: WarningItem[]
}

/** 基础模糊搜索结果项 */
export interface BasicSearchResult {
  id: number | string
  bz_id: string
  bz_name: string
  ex_state: string
  release_date?: string
  implement_time?: string
}

/** 分页接口响应 */
export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/** 标准列表数据项 */
export interface StandardItem {
  id: number | string
  bz_id: string
  bz_name: string
  bz_release_date?: string
  implement_time?: string
  ex_state: string
  replace_bz_id?: string
  tree_id?: string
}
