import type {
  NoveltyCompareRowApi,
  NoveltyTaskOutApi,
  NoveltyTaskSummaryOutApi,
  ReferenceSheetRowApi,
} from '@/types/novelty-search-api'
import type {
  CompareRow,
  NoveltyRowConclusion,
  NoveltyTask,
  NoveltyTaskConclusion,
  NoveltyTaskStatus,
  ReferenceSheetRow,
  SourceEvaluationSummary,
} from '@/types/novelty-search'

/**
 * 当前后端为同步实现：创建即 pending_confirm，确认即 completed，一般无需轮询。
 * 见 docs/frontend-novelty-search-API-对接说明-2026.md §3
 */
export function noveltyTaskNeedsPolling(_status: NoveltyTaskStatus): boolean {
  return false
}

function mapStatus(api: string): NoveltyTaskStatus {
  const allowed: NoveltyTaskStatus[] = [
    'queued',
    'loading_history',
    'parsing',
    'pending_confirm',
    'comparing',
    'completed',
    'failed',
  ]
  if (allowed.includes(api as NoveltyTaskStatus)) return api as NoveltyTaskStatus
  return 'failed'
}

export function mapReferenceSheetRowFromApi(row: ReferenceSheetRowApi): ReferenceSheetRow {
  return {
    id: String(row.id),
    stdNo: row.std_no?.trim() || '—',
    stdName: row.std_name?.trim() || '—',
    techFragment: row.tech_fragment?.trim() || undefined,
    remark: row.remark?.trim() || undefined,
  }
}

export function mapReferenceSheetRowToApi(row: ReferenceSheetRow): ReferenceSheetRowApi {
  return {
    id: row.id,
    std_no: row.stdNo,
    std_name: row.stdName,
    tech_fragment: row.techFragment ?? null,
    remark: row.remark ?? null,
  }
}

export function mapCompareRowFromApi(row: NoveltyCompareRowApi): CompareRow {
  return {
    id: String(row.id),
    sheetRowId: String(row.sheet_row_id),
    referencedStdCode: row.referenced_std_code?.trim() || '—',
    fullStdAtPublication: row.full_std_at_publication?.trim() || '—',
    baselineLatestStd: row.baseline_latest_std_primary?.trim() || '—',
    currentLatestStd: row.current_latest_std_primary?.trim() || '—',
    rowConclusion: row.row_conclusion as NoveltyRowConclusion,
    rowConclusionLabel: row.row_conclusion_label?.trim() || row.row_conclusion,
    complianceAssessable: row.compliance_assessable,
    explanation: row.explanation?.trim() || undefined,
    baselineSource: row.baseline_source ?? undefined,
    baselineRecordedAt: row.baseline_recorded_at ?? undefined,
    stdNo: row.referenced_std_code?.trim() || '—',
    stdName: row.full_std_at_publication?.trim() || row.referenced_std_code?.trim() || '—',
    existsInDb: Boolean(row.current_latest_std_primary?.trim()),
    conclusion: mapRowConclusionToLegacyCompare(row.row_conclusion),
  }
}

/** 兼容旧 CompareConclusion 字段（报告 Tab 等） */
function mapRowConclusionToLegacyCompare(
  row: NoveltyCompareRowApi['row_conclusion'],
): CompareRow['conclusion'] {
  switch (row) {
    case 'unchanged':
      return 'active'
    case 'updated':
      return 'obsolete'
    case 'first_record':
      return 'incoming'
    case 'not_assessable':
      return 'unknown'
    case 'unresolved':
    default:
      return 'pending'
  }
}

export function mapNoveltyTaskFromApi(api: NoveltyTaskOutApi): NoveltyTask {
  const id = String(api.id)
  return {
    id,
    title: api.title,
    enterpriseName: api.enterprise_name?.trim() || '',
    enterpriseStdNo: api.qb_code?.trim() || '—',
    status: mapStatus(api.status),
    source: api.source,
    fileName: api.file_name?.trim() || undefined,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    errorSummary: api.error_summary?.trim() || undefined,
    sheetConfirmed: Boolean(api.sheet_confirmed),
    referenceSheet: (api.reference_sheet ?? []).map(mapReferenceSheetRowFromApi),
    compareRows: (api.compare_rows ?? []).map(mapCompareRowFromApi),
    compareDone: api.compare_done ?? 0,
    compareTotal: api.compare_total ?? api.compare_rows?.length ?? 0,
    reportState: api.report_state ?? 'none',
    reportGeneratedAt: api.report_generated_at ?? undefined,
    taskConclusion: (api.task_conclusion as NoveltyTaskConclusion | null) ?? undefined,
    taskSummary: api.task_summary?.trim() || undefined,
    sourceEvaluations: (api.source_evaluations ?? []).map(
      (s): SourceEvaluationSummary => ({
        sourceType: s.source_type,
        sourceId: s.source_id,
        evaluatedAt: s.evaluated_at,
        title: s.title,
      }),
    ),
    indicatorsAvailable: Boolean(api.indicators_available),
  }
}

export function mapNoveltyTaskSummaryFromApi(api: NoveltyTaskSummaryOutApi): NoveltyTask {
  return {
    id: String(api.id),
    title: api.title,
    enterpriseName: '',
    enterpriseStdNo: api.qb_code?.trim() || '—',
    status: mapStatus(api.status),
    source: api.source,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    errorSummary: api.error_summary?.trim() || undefined,
    sheetConfirmed: false,
    referenceSheet: [],
    compareRows: [],
    compareDone: 0,
    compareTotal: 0,
    reportState: 'none',
    taskConclusion: (api.task_conclusion as NoveltyTaskConclusion | null) ?? undefined,
    taskSummary: api.task_summary?.trim() || undefined,
  }
}
