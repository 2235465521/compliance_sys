import type { NoveltyRowConclusion } from '@/types/novelty-search'
import type {
  ForwardWarningResponseApi,
  ReverseWarningResponseApi,
  WarningCompareRowApi,
  WarningRowConclusionApi,
} from '@/types/warnings-api'
import type {
  ForwardWarningResult,
  MonitorEnterpriseItem,
  MonitorSummary,
  ReverseAffectedEnterprise,
  ReverseWarningResult,
  WarningCompareRow,
  WarningTaskConclusion,
} from '@/types/warnings'
import type { MonitorEnterpriseListItemApi, MonitorSummaryApi } from '@/types/warnings-api'

const ROW_CONCLUSIONS: NoveltyRowConclusion[] = [
  'unchanged',
  'updated',
  'first_record',
  'unresolved',
  'not_assessable',
]

function asRowConclusion(v: string | undefined): NoveltyRowConclusion {
  if (v && ROW_CONCLUSIONS.includes(v as NoveltyRowConclusion)) return v as NoveltyRowConclusion
  return 'unresolved'
}

function mapCompareRow(row: WarningCompareRowApi, index: number): WarningCompareRow {
  return {
    id: String(row.id ?? index),
    referencedStdCode: row.referenced_std_code?.trim() || '—',
    fullStdAtPublication: row.full_std_at_publication?.trim() || '—',
    baselineLatestStd: row.baseline_latest_std?.trim() || '—',
    currentLatestStd: row.current_latest_std?.trim() || '—',
    rowConclusion: asRowConclusion(row.row_conclusion),
    rowConclusionLabel: row.row_conclusion_label?.trim() || row.row_conclusion,
    explanation: row.explanation?.trim() || undefined,
  }
}

export function mapForwardWarningFromApi(api: ForwardWarningResponseApi): ForwardWarningResult {
  return {
    qbCode: api.qb_code?.trim() || '—',
    enterpriseName: api.enterprise_name?.trim() || undefined,
    taskConclusion: (api.task_conclusion ?? 'partial') as WarningTaskConclusion,
    taskSummary: api.task_summary?.trim() || undefined,
    compareRows: (api.compare_rows ?? []).map(mapCompareRow),
  }
}

function inferTaskConclusionFromRows(rows: WarningCompareRow[]): WarningTaskConclusion {
  if (rows.length === 0) return 'partial'
  if (rows.some((r) => r.rowConclusion === 'updated')) return 'need_attention'
  if (rows.every((r) => r.rowConclusion === 'unchanged' || r.rowConclusion === 'first_record')) {
    return 'all_ok'
  }
  return 'partial'
}

/** 将 Dify/WebSocket 或旧解析结果弱映射为比对行（无基线时列 3 为 —） */
export function mapLegacyRefsToCompareRows(refs: unknown[]): WarningCompareRow[] {
  return refs.map((ref, index) => {
    const r =
      typeof ref === 'string'
        ? { standard_code: ref }
        : (ref as Record<string, unknown>) ?? {}
    const referenced = String(
      r.standard_code ?? r.original_ref ?? r.matched_historical_id ?? `行${index + 1}`,
    )
    const full = String(
      r.full_std_at_publication ?? r.matched_historical_id ?? r.standard_code ?? referenced,
    )
    const baseline = String(r.baseline_latest_std ?? r.matched_historical_id ?? '—')
    const current = String(
      r.current_latest_std ?? r.latest_id ?? r.latest_version ?? r.latest_standard ?? '—',
    )
    let rowConclusion: WarningRowConclusionApi = 'unresolved'
    if (baseline !== '—' && current !== '—') {
      rowConclusion = baseline.trim() === current.trim() ? 'unchanged' : 'updated'
    } else if (current !== '—') {
      rowConclusion = 'first_record'
    }
    return mapCompareRow(
      {
        id: String(index),
        referenced_std_code: referenced,
        full_std_at_publication: full,
        baseline_latest_std: baseline === '—' ? null : baseline,
        current_latest_std: current === '—' ? null : current,
        row_conclusion: rowConclusion,
        row_conclusion_label:
          rowConclusion === 'updated'
            ? '需更新'
            : rowConclusion === 'unchanged'
              ? '无变化'
              : '待评价基线',
      },
      index,
    )
  })
}

export function buildForwardFromLegacyRefs(
  qbCode: string,
  refs: unknown[],
  taskSummary?: string,
): ForwardWarningResult {
  const compareRows = mapLegacyRefsToCompareRows(refs)
  return {
    qbCode,
    taskConclusion: inferTaskConclusionFromRows(compareRows),
    taskSummary:
      taskSummary ??
      (compareRows.some((r) => r.baselineLatestStd === '—')
        ? '文件解析完成；完整「上次 vs 本次」比对需企标在系统中已有合规或批量评价记录。'
        : undefined),
    compareRows,
  }
}

export function mapReverseWarningFromApi(
  api: ReverseWarningResponseApi,
  inputBz: string,
): ReverseWarningResult {
  const gb = api.gb_novelty ?? {
    input_bz: api.input_bz ?? inputBz,
    latest_bz: api.latest_bz ?? '',
    gb_updated: Boolean(api.latest_bz && api.input_bz && api.latest_bz !== api.input_bz),
  }
  const input = gb.input_bz?.trim() || inputBz
  const latest = gb.latest_bz?.trim() || '—'
  const gbUpdated = gb.gb_updated ?? (latest !== '—' && input !== latest)

  const rawList = api.affected_enterprises ?? []
  const enterprises: ReverseAffectedEnterprise[] = rawList.map((item) => {
    if (typeof item === 'string') {
      const needModify = gbUpdated
      return {
        qbCode: item,
        needModify,
        conclusionLabel: needModify ? '需修改企标' : '暂不需修改',
        summary: gbUpdated
          ? `引用的国标 ${input} 已更新为 ${latest}`
          : `国标 ${input} 暂无更新`,
      }
    }
    return {
      qbCode: item.qb_code?.trim() || '—',
      enterpriseName: item.enterprise_name?.trim() || undefined,
      needModify: item.enterprise_need_modify ?? gbUpdated,
      conclusionLabel:
        item.enterprise_conclusion_label?.trim() ||
        (item.enterprise_need_modify ? '需修改企标' : '暂不需修改'),
      summary: item.summary?.trim() || undefined,
    }
  })

  let taskConclusion = (api.task_conclusion ?? undefined) as WarningTaskConclusion | undefined
  if (!taskConclusion) {
    if (!gbUpdated) taskConclusion = 'all_ok'
    else if (enterprises.some((e) => e.needModify)) taskConclusion = 'need_attention'
    else taskConclusion = 'all_ok'
  }

  return {
    taskConclusion,
    taskSummary:
      api.task_summary?.trim() ||
      (taskConclusion === 'need_attention'
        ? '国标已更新，存在需修改的关联企标'
        : '关联企标暂不需因该国标修改'),
    gbNovelty: {
      inputBz: input,
      latestBz: latest,
      gbUpdated,
      statusLabel: gb.status_label,
    },
    enterprises,
  }
}

export function mapMonitorSummaryFromApi(api: MonitorSummaryApi): MonitorSummary {
  return {
    lastScanAt: api.last_scan_at ?? undefined,
    totalEvaluatedQb: api.total_evaluated_qb ?? 0,
    needAttentionCount: api.need_attention_count ?? 0,
    allOkCount: api.all_ok_count ?? 0,
    pendingCount: api.pending_count ?? 0,
  }
}

export function mapMonitorEnterpriseItemFromApi(
  item: MonitorEnterpriseListItemApi,
): MonitorEnterpriseItem {
  return {
    qbCode: item.qb_code?.trim() || '—',
    enterpriseName: item.enterprise_name?.trim() || undefined,
    taskConclusion: (item.task_conclusion ?? 'partial') as WarningTaskConclusion,
    taskSummary: item.task_summary?.trim() || undefined,
    lastCheckedAt: item.last_checked_at ?? undefined,
  }
}
