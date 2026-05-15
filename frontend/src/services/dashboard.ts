import request from './request'
import type { StatisticsData, BasicSearchResult, PaginatedResponse, StandardItem } from '@/types/dashboard'

// ─── Mock 数据（后端未就绪时使用）─────────────────────────────────────────────
const MOCK_STATISTICS: StatisticsData = {
  types: { GB: 1500, QB: 300, HB: 50, TB: 20, DB: 80 },
  states: { 现行: 1200, 废止: 600, 即将实施: 50 },
}

// ─── API 封装 ─────────────────────────────────────────────────────────────────

/** GET /api/standards/statistics/ — 获取大屏统计数据 */
export async function fetchStatistics(): Promise<StatisticsData> {
  try {
    const res = await request.get<{ code: number; msg: string; data: StatisticsData }>(
      '/standards/statistics/',
    )
    return res.data.data
  } catch {
    // TODO: 替换为真实接口（后端就绪后移除 Mock）
    console.warn('[dashboard] 统计接口不可用，使用 Mock 数据')
    return MOCK_STATISTICS
  }
}

/** GET /api/standards/dashboard-alerts/ — 获取仪表盘的即将实施和近期废止数据 */
export async function fetchDashboardAlerts(): Promise<{ upcoming: any[]; abolished: any[] }> {
  try {
    const res = await request.get('/standards/dashboard-alerts/')
    const data = res.data?.data || (res as any).data
    return {
       upcoming: data?.upcoming || [],
       abolished: data?.abolished || []
    }
  } catch (error) {
    console.error('[dashboard] 预警聚合接口异常', error)
    return { upcoming: [], abolished: [] }
  }
}

/** POST /api/warnings/mark_read — 标记预警为已读 */
export async function markWarningRead(warning_id: number): Promise<boolean> {
  try {
    await request.post('/warnings/mark_read', { warning_id })
    return true
  } catch {
    // TODO: 替换为真实接口
    return true // Mock：始终成功
  }
}

/** GET /api/standards/basic-search/ — 工作台基础模糊搜索 */
export async function searchStandards(keyword: string): Promise<BasicSearchResult[]> {
  try {
    const res = await request.get<{ code: number; msg: string; data: BasicSearchResult[] }>(
      '/standards/basic-search/',
      { params: { q: keyword } }
    )
    return res.data.data
  } catch {
    // TODO: 替换为真实接口
    console.warn('[dashboard] 搜索接口不可用，使用 Mock 数据')
    return [
      {
        id: 1,
        bz_id: 'GB/T 1.1-2020',
        bz_name: '标准化工作导则 第1部分：标准化文件的结构和起草规则',
        ex_state: '现行',
      },
      {
        id: 2,
        bz_id: 'GB/T 1.1-2009',
        bz_name: '标准化工作导则 第1部分：标准的结构和编写',
        ex_state: '废止',
      },
      {
        id: 3,
        bz_id: 'GB/T 1.1-2000',
        bz_name: '标准化工作导则 第1部分:标准的结构和编写规则',
        ex_state: '废止',
      },
      {
        id: 4,
        bz_id: 'GB/T 1.1-1993',
        bz_name: '历史老旧标准(系统自动补全)',
        ex_state: '废止',
      }
    ].filter(item => item.bz_id.includes(keyword) || item.bz_name.includes(keyword))
  }
}

/** GET /api/standards/ — 获取标准列表（支持分页、状态过滤、搜索） */
export async function fetchStandardList(params: {
  page?: number
  page_size?: number
  ex_state?: string
  search?: string
  implement_time__lte?: string
  implement_time__gte?: string
  bz_release_date__gte?: string  // 废止日期过滤
  bz_release_date__lte?: string  // 废止日期过滤
}): Promise<PaginatedResponse<StandardItem>> {
  try {
    const res = await request.get<PaginatedResponse<StandardItem>>('/standards/', {
      params,
    })
    // 兼容后端可能的外层结构
    if ((res.data as any).code === 200 && (res.data as any).data) { // 有些接口包装了 code/msg/data
       return (res.data as any).data as PaginatedResponse<StandardItem>
    }
    return res.data
  } catch (error) {
    if (params.page && params.page > 1) {
      // 如果是在翻页过程中报错（如查过了最大页数抛出 404），则不要用 mock 覆盖
      throw error
    }
    console.warn('[dashboard] 标准列表接口不可用，使用 Mock 数据')
    const mockData: StandardItem[] = params.ex_state === '即将实施' ? [
      { id: 101, bz_id: 'GB 10631-2025', bz_name: '烟花爆竹 安全与质量', implement_time: '2026-05-01', ex_state: '即将实施' },
      { id: 102, bz_id: 'GB 12955-2024', bz_name: '防火门', implement_time: '2026-05-01', ex_state: '即将实施' },
    ] : params.ex_state === '废止' ? [] : [
      { id: 201, bz_id: 'GB/T 1.1-2020', bz_name: '标准化工作导则 第1部分', bz_release_date: '2020-03-31', ex_state: '现行' }
    ]

    return {
      count: mockData.length,
      next: null,
      previous: null,
      results: mockData,
    }
  }
}
