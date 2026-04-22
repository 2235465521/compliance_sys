import request from './request'
import type { StatisticsData, WarningListResponse, BasicSearchResult, PaginatedResponse, StandardItem } from '@/types/dashboard'

// ─── Mock 数据（后端未就绪时使用）─────────────────────────────────────────────
const MOCK_STATISTICS: StatisticsData = {
  types: { GB: 1500, QB: 300, HB: 50, TB: 20, DB: 80 },
  states: { 现行: 1200, 废止: 600, 即将实施: 50 },
}

const MOCK_WARNINGS: WarningListResponse = {
  success: true,
  unread_count: 3,
  data: [
    {
      id: 1,
      old_bz_id: 'GB/T 1.1-2009',
      new_bz_id: 'GB/T 1.1-2020',
      quote_bz: 'Q/XYZ 001-2023',
      is_read: false,
      create_time: '2024-03-20T10:00:00Z',
    },
    {
      id: 2,
      old_bz_id: 'GB/T 20000.1-2014',
      new_bz_id: 'GB/T 20000.1-2023',
      quote_bz: 'Q/ABC 002-2022',
      is_read: false,
      create_time: '2024-03-19T08:30:00Z',
    },
    {
      id: 3,
      old_bz_id: 'GB 9706.1-2007',
      new_bz_id: 'GB 9706.1-2020',
      quote_bz: 'Q/DEF 003-2021',
      is_read: true,
      create_time: '2024-03-18T14:00:00Z',
    },
  ],
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

/** GET /api/warnings/list — 获取预警列表 */
export async function fetchWarnings(): Promise<WarningListResponse> {
  try {
    const res = await request.get<WarningListResponse>('/warnings/list')
    if ((res.data as any).code === 200 && (res.data as any).data) {
       return (res.data as any).data
    }
    return res.data
  } catch (error) {
    console.error('[dashboard] 预警接口异常', error)
    return { success: true, unread_count: 0, data: [] }
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
