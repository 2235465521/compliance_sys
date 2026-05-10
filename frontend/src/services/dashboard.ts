import request from "./request";
import type {
  StatisticsData,
  BasicSearchResult,
  PaginatedResponse,
  StandardItem,
  AbolitionHintsPayload,
  AbolitionHintItem,
} from "@/types/dashboard";

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

/** 仅需 { code, data } 的接口 */
function parseEnvelopeData<T>(res: unknown): T {
  const body = res as { code?: number; data?: T; msg?: string };
  if (typeof body.code === "number" && body.code === 200 && body.data != null) {
    return body.data;
  }
  throw new Error(body.msg || "响应格式无效");
}

function field(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
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
  return {
    asOf: field(data, "asOf", "as_of"),
    upcoming: upcoming.map((r) => normalizeHintRow(r as Record<string, unknown>)),
    recent: recent.map((r) => normalizeHintRow(r as Record<string, unknown>)),
  };
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

/** GET v1/dashboard/abolition-hints */
export async function fetchDashboardAbolitionHints(
  params?: AbolitionHintsQuery,
): Promise<AbolitionHintsPayload> {
  const res = await request.get(`v1/dashboard/abolition-hints/`, { params });
  const payload = parseEnvelopeData<Record<string, unknown>>(res.data);
  return normalizeAbolitionHints(payload);
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

/** 工作台快捷查标准（按标准号精确查询） */
export async function searchStandards(keyword: string): Promise<BasicSearchResult[]> {
  const row = await fetchDashboardQuickLookup(keyword);
  return [row];
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
