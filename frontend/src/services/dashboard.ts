import request from './request'
import { basicSearch } from '@/services/standard-library'
import { fuzzyMatchText } from '@/utils/fuzzyTextMatch'
import {
  DEFAULT_DASHBOARD_HINT_DAYS,
  type AbolitionHintItem,
  type AbolitionHintsPayload,
  type BasicSearchResult,
  type EffectiveHintItem,
  type EffectiveHintsPayload,
  type PaginatedResponse,
  type StandardItem,
  type StatisticsData,
} from '@/types/dashboard'

/** 辅助：从对象中取第一个有值的 key，返回字符串（空则返回 ''） */
function field(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

/** 辅助：解包 { code:200, data:T } 信封响应；若不是信封格式则原样返回 */
function parseEnvelopeData<T>(data: unknown): T {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (typeof o.code === 'number' && o.code === 200 && o.data != null) {
      return o.data as T
    }
  }
  return data as T
}

const MOCK_STATISTICS: StatisticsData = {
  total: 0,
  types: {},
  states: { 现行: 0, 废止: 0, 即将实施: 0 },
}

/** 统计数据：支持 { code, data } 或裸 data（与 standards 统计一致） */
function parseStatisticsResponse(res: unknown): StatisticsData {
  const body = res as {
    code?: number;
    data?: StatisticsData;
    msg?: string;
  } & Partial<StatisticsData>;
  if (typeof body.code === "number" && body.code === 200 && body.data != null) {
    return body.data;
  }
  if (body.types != null && body.states != null) {
    return body as StatisticsData;
  }
  throw new Error(body.msg || "统计响应格式无效");
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

function normalizeHintRow(raw: Record<string, unknown>): AbolitionHintItem {
  return {
    stdCode: field(raw, "stdCode", "std_code"),
    stdName: field(raw, "stdName", "std_name"),
    stdStatus: field(raw, "stdStatus", "std_status"),
    abolitionDate: field(raw, "abolitionDate", "abolition_date"),
    daysFromToday: Number(raw.daysFromToday ?? raw.days_from_today ?? 0),
  };
}

function normalizeAbolitionHints(data: Record<string, unknown>): AbolitionHintsPayload {
  const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
  const recent = Array.isArray(data.recent) ? data.recent : [];
  const windowDays = Number(data.windowDays ?? data.window_days ?? NaN);
  const recentDays = Number(data.recentDays ?? data.recent_days ?? NaN);
  return {
    asOf: field(data, "asOf", "as_of"),
    windowDays: Number.isFinite(windowDays) ? windowDays : undefined,
    recentDays: Number.isFinite(recentDays) ? recentDays : undefined,
    upcoming: upcoming.map((r) => normalizeHintRow(r as Record<string, unknown>)),
    recent: recent.map((r) => normalizeHintRow(r as Record<string, unknown>)),
  };
}

function normalizeEffectiveHintRow(raw: Record<string, unknown>): EffectiveHintItem {
  return {
    stdCode: field(raw, 'stdCode', 'std_code'),
    stdName: field(raw, 'stdName', 'std_name'),
    stdStatus: field(raw, 'stdStatus', 'std_status'),
    effectiveDate: field(raw, 'effectiveDate', 'effective_date'),
    daysFromToday: Number(raw.daysFromToday ?? raw.days_from_today ?? 0),
  }
}

function normalizeEffectiveHints(data: Record<string, unknown>): EffectiveHintsPayload {
  const upcoming = Array.isArray(data.upcoming) ? data.upcoming : []
  const windowDays = Number(data.windowDays ?? data.window_days ?? NaN)
  return {
    asOf: field(data, 'asOf', 'as_of'),
    windowDays: Number.isFinite(windowDays) ? windowDays : undefined,
    upcoming: upcoming.map((r) =>
      normalizeEffectiveHintRow(r as Record<string, unknown>),
    ),
  }
}

/** 将 StandardDetailOut（camelCase/snake_case）映射为快捷查询表格行 */
export function mapStandardDetailToBasicRow(
  data: Record<string, unknown>,
): BasicSearchResult {
  const code =
    field(data, "std_code", "stdCode") || field(data, "bz_id", "bz_id");
  const name =
    field(data, "std_name", "stdName") || field(data, "bz_name", "bz_name");
  const status =
    field(data, "std_status", "stdStatus") ||
    field(data, "ex_state", "exState");
  return {
    id: code,
    bz_id: code || "—",
    bz_name: name || "—",
    ex_state: status || "—",
    release_date:
      field(data, "publish_date", "publishDate") ||
      field(data, "release_date", "releaseDate") ||
      undefined,
    implement_time:
      field(data, "effective_date", "effectiveDate") ||
      field(data, "implement_time", "implementTime") ||
      undefined,
  };
}

/** GET v1/dashboard/summary — 国标主表聚合统计（仅此一处；勿调用已删除占位接口或 v1/standards/export） */
export async function fetchDashboardSummary(): Promise<StatisticsData> {
  const res = await request.get(`v1/dashboard/summary/`);
  return parseStatisticsResponse(res.data);
}

export type AbolitionHintsQuery = {
  upcoming_days?: number;
  recent_days?: number;
  limit?: number;
};

const DEFAULT_HINTS_LIMIT = 200

function defaultAbolitionQuery(
  params?: AbolitionHintsQuery,
): Required<Pick<AbolitionHintsQuery, 'upcoming_days' | 'recent_days'>> &
  AbolitionHintsQuery {
  const days = params?.upcoming_days ?? params?.recent_days ?? DEFAULT_DASHBOARD_HINT_DAYS
  return {
    upcoming_days: params?.upcoming_days ?? days,
    recent_days: params?.recent_days ?? days,
    limit: params?.limit ?? DEFAULT_HINTS_LIMIT,
  }
}

/** GET v1/dashboard/abolition-hints（失败时回退旧路径） */
export async function fetchDashboardAbolitionHints(
  params?: AbolitionHintsQuery,
): Promise<AbolitionHintsPayload> {
  const query = defaultAbolitionQuery(params)
  try {
    const res = await request.get(`v1/dashboard/abolition-hints/`, { params: query })
    const payload = parseEnvelopeData<Record<string, unknown>>(res.data)
    return normalizeAbolitionHints(payload)
  } catch (primaryError) {
    try {
      const res = await request.get('/standards/dashboard-alerts/', {
        params: {
          upcoming_days: query.upcoming_days,
          recent_days: query.recent_days,
          limit: query.limit,
        },
      })
      const payload = parseEnvelopeData<Record<string, unknown>>(res.data)
      const normalized = normalizeAbolitionHints(payload)
      return {
        ...normalized,
        windowDays: query.upcoming_days,
        recentDays: query.recent_days,
      }
    } catch {
      throw primaryError
    }
  }
}

export type EffectiveHintsQuery = {
  window_days?: number
  limit?: number
}

/** GET v1/dashboard/effective-hints（失败时回退旧路径） */
export async function fetchDashboardEffectiveHints(
  params?: EffectiveHintsQuery,
): Promise<EffectiveHintsPayload> {
  const window_days = params?.window_days ?? DEFAULT_DASHBOARD_HINT_DAYS
  const limit = params?.limit ?? DEFAULT_HINTS_LIMIT
  try {
    const res = await request.get(`v1/dashboard/effective-hints/`, {
      params: { window_days, limit },
    })
    const payload = parseEnvelopeData<Record<string, unknown>>(res.data)
    return normalizeEffectiveHints(payload)
  } catch (primaryError) {
    try {
      const res = await request.get('/standards/dashboard-effective-alerts/', {
        params: { window_days, limit },
      })
      const payload = parseEnvelopeData<Record<string, unknown>>(res.data)
      const normalized = normalizeEffectiveHints(payload)
      return { ...normalized, windowDays: window_days }
    } catch {
      throw primaryError
    }
  }
}

/**
 * GET `/api/v1/dashboard/quick-lookup/`（axios baseURL 为 `/api`，此处路径 `v1/dashboard/quick-lookup/`）
 * Query：`std_code`（必填）。返回单条详情 `StandardDetailOut`；勿与 `/api/standards/basic-search/` 列表检索混用。
 * 422：空参数；404：无记录。
 */
export async function fetchDashboardQuickLookup(
  stdCode: string,
): Promise<BasicSearchResult> {
  const q = stdCode.trim();
  if (!q) {
    const err = new Error("请输入标准号");
    (err as Error & { status?: number }).status = 422;
    throw err;
  }
  const res = await request.get<{
    code?: number;
    data?: Record<string, unknown>;
    msg?: string;
  }>(`v1/dashboard/quick-lookup/`, {
    params: { std_code: q },
    validateStatus: () => true,
  });
  if (res.status === 422) {
    const err = new Error("标准号不能为空");
    (err as Error & { status?: number }).status = 422;
    throw err;
  }
  if (res.status === 404) {
    const err = new Error("未找到该标准");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const body = res.data;
  if (body?.code === 200 && body.data && typeof body.data === "object") {
    return mapStandardDetailToBasicRow(body.data as Record<string, unknown>);
  }
  throw new Error(body?.msg || "查询失败");
}

function mapStandardItemToBasicRow(item: StandardItem): BasicSearchResult {
  return {
    id: item.id,
    bz_id: item.bz_id,
    bz_name: item.bz_name,
    ex_state: item.ex_state,
    release_date: item.bz_release_date,
    implement_time: item.implement_time,
  }
}

/**
 * 工作台快捷查标准：先尝试 quick-lookup；否则走列表/基础搜索，并做前端模糊过滤。
 */
export async function searchStandards(keyword: string): Promise<BasicSearchResult[]> {
  const q = keyword.trim()
  if (!q) {
    const err = new Error('请输入标准号或关键词')
    ;(err as Error & { status?: number }).status = 422
    throw err
  }

  try {
    const exact = await fetchDashboardQuickLookup(q)
    return [exact]
  } catch (e) {
    const status = (e as Error & { status?: number }).status
    if (status === 422) throw e
  }

  try {
    const list = await fetchStandardList({ search: q, page_size: 50, page: 1 })
    const rows = list.results
      .map(mapStandardItemToBasicRow)
      .filter((row) => fuzzyMatchText(q, row.bz_id, row.bz_name))
    if (rows.length > 0) return rows
  } catch {
    // 继续尝试 basic-search
  }

  try {
    const items = await basicSearch(q)
    const rows = items
      .filter((item) => fuzzyMatchText(q, item.bz_id, item.bz_name))
      .map((item) => ({
        id: item.id,
        bz_id: item.bz_id,
        bz_name: item.bz_name,
        ex_state: item.ex_state,
        release_date: item.release_date ?? undefined,
        implement_time: item.implement_time ?? undefined,
      }))
    if (rows.length > 0) return rows
  } catch {
    // fall through
  }

  const err = new Error('未找到匹配的标准，可尝试标准号片段或名称关键词')
  ;(err as Error & { status?: number }).status = 404
  throw err
}

/** POST /api/warnings/mark_read — 标记预警为已读（旧能力，暂无仪表盘入口） */
export async function markWarningRead(warning_id: number): Promise<boolean> {
  try {
    await request.post("/warnings/mark_read", { warning_id });
    return true;
  } catch {
    return true;
  }
}

/** GET /api/v1/standards/ — 获取标准列表（支持分页、状态过滤、搜索） */
export async function fetchStandardList(params: {
  page?: number;
  page_size?: number;
  ex_state?: string;
  search?: string;
  implement_time__lte?: string;
  implement_time__gte?: string;
  bz_release_date__gte?: string;
  bz_release_date__lte?: string;
}): Promise<PaginatedResponse<StandardItem>> {
  try {
    const res = await request.get<PaginatedResponse<StandardItem>>("v1/standards/", {
      params,
    });
    const raw = res.data as unknown;
    const wrapped = raw as { code?: number; data?: PaginatedResponse<StandardItem> };
    if (
      typeof wrapped?.code === "number" &&
      wrapped.code === 200 &&
      wrapped.data != null
    ) {
      return wrapped.data;
    }
    return res.data;
  } catch (error) {
    if (params.page && params.page > 1) {
      throw error;
    }
    console.warn("[dashboard] 标准列表接口不可用，使用 Mock 数据");
    const mockData: StandardItem[] =
      params.ex_state === "即将实施"
        ? [
            {
              id: 101,
              bz_id: "GB 10631-2025",
              bz_name: "烟花爆竹 安全与质量",
              implement_time: "2026-05-01",
              ex_state: "即将实施",
            },
            {
              id: 102,
              bz_id: "GB 12955-2024",
              bz_name: "防火门",
              implement_time: "2026-05-01",
              ex_state: "即将实施",
            },
          ]
        : params.ex_state === "废止"
          ? []
          : [
              {
                id: 201,
                bz_id: "GB/T 1.1-2020",
                bz_name: "标准化工作导则 第1部分",
                bz_release_date: "2020-03-31",
                ex_state: "现行",
              },
            ];

    return {
      count: mockData.length,
      next: null,
      previous: null,
      results: mockData,
    };
  }
}
