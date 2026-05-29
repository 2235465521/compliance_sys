/**
 * 合规性评价 — 旧接口形态适配层，内部调用新后端 `compliance-api`（`/api/v1/compliance`）。
 * 保持页面与向导 JSX 不变，仅替换底层请求。
 */
import type { AxiosResponse } from 'axios'
import type { ComplianceTask, CreateComplianceTaskRequest } from '@/types/compliance'
import type {
  ComplianceTaskOut,
  ReferenceLatestRow,
  Step1ConfirmIn,
  Step2ConfirmIn,
  Step3ConfirmIn,
  ComparePairIn,
  Step4IndicatorsEnsureOut,
  Step4IndicatorsOut,
  StdCodeOrchestrationStatus,
} from '@/types/compliance-api'
import {
  confirmStep1,
  confirmStep2,
  confirmStep3,
  confirmStep4,
  confirmStep5,
  createEvaluation,
  downloadArtifactFile,
  getEvaluation,
  getStep1,
  getStep2,
  getStep3ReferenceLatest,
  getStep4Indicators,
  getStep5Compare,
  postStep5Compare,
  listArtifacts,
  listEvaluations,
  getNationalIndicatorsByStd,
  putNationalIndicatorSave,
  postNationalIndicatorReview,
  postStep3Supplements,
  postStep4IndicatorsEnsure,
  uploadEvaluationFile,
  uploadNationalStandard,
} from '@/services/compliance-api'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'
import type { ComparePreviewRow } from '@/pages/compliance/comparison-types'
import { parseStep5CompareResultToRows } from '@/pages/compliance/utils/step5CompareParse'

const LS_EVAL_TASK = 'compliance_evaluation_task_id'

export function getComplianceEvaluationTaskId(): number | null {
  const raw = localStorage.getItem(LS_EVAL_TASK)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * 后端 `current_step`（1～6）→ 向导 Steps **允许进入的最大下标**（0～5）。
 * 与《前端接入流程指南》§1.1、手册 §1.5 一致：`next > maxIdx` 时禁止跳步。
 */
export function backendCurrentStepToMaxWizardIndex(currentStep: number): number {
  if (!Number.isFinite(currentStep) || currentStep < 1) return 0
  if (currentStep >= 6) return 5
  return Math.min(5, currentStep)
}

export function setComplianceEvaluationTaskId(id: number) {
  localStorage.setItem(LS_EVAL_TASK, String(id))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('compliance-evaluation-task-id-changed', { detail: { id } }))
  }
}

/** 向导「描述性合规评价」通过后调用，推进后端到审核 2（`current_step=2`） */
export async function confirmEvaluationAuditStep1(taskId: number, body: Step1ConfirmIn) {
  await confirmStep1(taskId, body)
}

/** 向导审核 3 完成时调用，推进后端到步骤 4（`current_step=4`） */
export async function confirmEvaluationAuditStep3(taskId: number, body: Step3ConfirmIn) {
  await confirmStep3(taskId, body)
}

/** 向导审核 4 完成时调用，推进后端到步骤 5 */
export async function confirmEvaluationAuditStep4(taskId: number) {
  await confirmStep4(taskId)
}

/** 向导审核 5 完成时调用，推进后端到步骤 6 */
export async function confirmEvaluationAuditStep5(taskId: number) {
  await confirmStep5(taskId)
}

/**
 * 上传后轮询 `GET .../evaluations/{id}`，直至 `parse_status` 为 `completed` / `failed`（见《前端接入流程指南》阶段 1-3）。
 * 超时返回最后一次拉取结果，不抛错。
 */
export async function pollComplianceEvaluationUntilParseSettled(
  taskId: number,
  options?: { intervalMs?: number; maxAttempts?: number },
): Promise<ComplianceTaskOut> {
  const intervalMs = options?.intervalMs ?? 2000
  const maxAttempts = options?.maxAttempts ?? 90
  let last: ComplianceTaskOut | null = null
  for (let i = 0; i < maxAttempts; i++) {
    const t = await getEvaluation(taskId)
    last = t
    if (t.parse_status === 'completed' || t.parse_status === 'failed') {
      return t
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return last ?? (await getEvaluation(taskId))
}

/** 向导在审核 2 阶段将当前表格同步到新后端 */
export async function confirmEvaluationAuditStep2(taskId: number, body: Step2ConfirmIn) {
  await confirmStep2(taskId, body)
}

export type PendingIndexItem = {
  id: string
  standardName: string
  indicatorName: string
  indicatorValue: string
  statusText: string
}

export type NationalIndexItem = {
  id: string
  standardId: string
  indexName: string
  indexValue: string
  singleResult?: string
  matchStatus?: string
}

export type StandardLatestCheckResult = {
  /** referenced_std_code */
  queryBzId: string
  /** 是否参与整文件自动合规强结论子集（2026-05 `compliance_assessable`） */
  complianceAssessable: boolean
  /**
   * 可比对时：时点完整号与主现行号是否一致；不可比对时为 `null`（勿当 false）。
   * 与接口 `citation_matches_latest` 对齐。
   */
  citationMatchesLatest: boolean | null
  /**
   * 兼容旧逻辑：`citationMatchesLatest === true`。
   * 统计「需更新」请用 `isRowCitationAutoOutdated`。
   */
  isLatest: boolean
  /** latest_std_primary（可为空串） */
  currentLatestId: string
  pedigreeChain: string
  /** latest_std_codes / current_latest_std_codes */
  currentLatestStdCodes?: string[]
  resolutionPath?: string | null
  enterpriseAsOfYear?: number | null
  inferredHistoricalStdCode?: string | null
  /** full_std_at_publication / historical_full_std_code */
  historicalFullStdCode?: string | null
  /** pedigree_lookup_std_code / pedigree_anchor_std_code */
  pedigreeAnchorStdCode?: string | null
  latestStdCodeRaw?: string | null
}

export const FILE_COMPLIANCE_OUTCOMES = ['no_references', 'non_compliant', 'compliant', 'undetermined'] as const
export type FileComplianceOutcome = (typeof FILE_COMPLIANCE_OUTCOMES)[number]

export function parseFileComplianceOutcome(raw: unknown): FileComplianceOutcome | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().toLowerCase()
  return (FILE_COMPLIANCE_OUTCOMES as readonly string[]).includes(v) ? (v as FileComplianceOutcome) : undefined
}

/** 合规 `GET .../reference-latest` 根级、或其它含 `file_compliance_outcome` 的 JSON */
export function getFileComplianceOutcomeFromPayload(data: unknown): FileComplianceOutcome | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
  const o = data as Record<string, unknown>
  return parseFileComplianceOutcome(o.file_compliance_outcome ?? o.fileComplianceOutcome)
}

export function fileComplianceOutcomeLabel(o: FileComplianceOutcome): string {
  switch (o) {
    case 'no_references':
      return '无引用'
    case 'compliant':
      return '引用合规'
    case 'non_compliant':
      return '引用不合格'
    case 'undetermined':
      return '待人工确认'
    default:
      return o
  }
}

export function fileComplianceOutcomeAlertType(
  o: FileComplianceOutcome,
): 'success' | 'warning' | 'error' | 'info' {
  switch (o) {
    case 'compliant':
      return 'success'
    case 'non_compliant':
      return 'error'
    case 'undetermined':
      return 'warning'
    case 'no_references':
      return 'info'
    default:
      return 'info'
  }
}

/** 可自动比对且结论为「时点号与现行主号不一致」 */
export function isRowCitationAutoOutdated(row: StandardLatestCheckResult): boolean {
  return row.complianceAssessable === true && row.citationMatchesLatest === false
}

/** 可自动比对且结论为一致 */
export function isRowCitationAutoLatest(row: StandardLatestCheckResult): boolean {
  return row.complianceAssessable === true && row.citationMatchesLatest === true
}

/** 用于将「引用标准号」与接口返回的 query_bz_id / std_code 对齐（忽略空格、全角斜杠等差异） */
function normalizeStandardCodeForMatch(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .replace(/\u3000/g, '')
    .replace(/\s+/g, '')
    .replace(/／/g, '/')
    .toUpperCase()
}

function pickFirstNonEmptyString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (v == null || v === '') continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

function pickStringArray(obj: Record<string, unknown>, keys: string[]): string[] {
  for (const k of keys) {
    const v = obj[k]
    if (!Array.isArray(v)) continue
    const arr = v.map((x) => String(x).trim()).filter(Boolean)
    if (arr.length > 0) return arr
  }
  return []
}

function pickNumberOrNull(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k]
    if (v == null) continue
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.trim())
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function pickOptionalString(obj: Record<string, unknown>, keys: string[]): string | null {
  const s = pickFirstNonEmptyString(obj, keys)
  return s ? s : null
}

/** `latest_std_primary` 允许空串（精简接口）；键不存在时才回退 */
function pickLatestStdPrimaryAllowEmpty(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue
    const v = obj[k]
    if (v === undefined || v === null) continue
    return String(v).trim()
  }
  return ''
}

/**
 * 将 `GET .../reference-latest` 或批量子项 `references_resolved` 规范为 `ReferenceLatestRow[]`。
 * 以 docs/frontend-规范性引用与批量查新-接口变更对接说明-2026.md §3 精简字段为主，并兼容旧版冗余键。
 */
function parseReferenceLatestRows(data: unknown): ReferenceLatestRow[] {
  let list: unknown[] = []
  if (Array.isArray(data)) {
    list = data
  } else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    const nested =
      o.references ??
      o.rows ??
      o.data ??
      o.items ??
      o.results ??
      o.reference_latest ??
      o.referenceLatest ??
      o.list
    if (Array.isArray(nested)) list = nested
  }
  const out: ReferenceLatestRow[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const query_bz_id = pickFirstNonEmptyString(r, [
      'referenced_std_code',
      'referencedStdCode',
      'query_bz_id',
      'queryBzId',
      'bz_id',
      'bzId',
      'code',
    ])
    const hasExplicitLatestPrimary =
      Object.prototype.hasOwnProperty.call(r, 'latest_std_primary') ||
      Object.prototype.hasOwnProperty.call(r, 'latestStdPrimary')
    const current_latest_id = hasExplicitLatestPrimary
      ? pickLatestStdPrimaryAllowEmpty(r, ['latest_std_primary', 'latestStdPrimary'])
      : pickFirstNonEmptyString(r, [
          'current_latest_id',
          'currentLatestId',
          'latest_std_primary',
          'latestStdPrimary',
          'latest_std_code',
          'latestStdCode',
          'std_code',
          'stdCode',
        ])
    const pedigree_chain = pickFirstNonEmptyString(r, [
      'explanation',
      'pedigree_chain',
      'pedigreeChain',
      'pedigree',
      'message',
      'detail',
      'description',
    ])
    const hasAssessableKey =
      Object.prototype.hasOwnProperty.call(r, 'compliance_assessable') ||
      Object.prototype.hasOwnProperty.call(r, 'complianceAssessable')
    const compliance_assessable = hasAssessableKey
      ? typeof r.compliance_assessable === 'boolean'
        ? r.compliance_assessable
        : typeof r.complianceAssessable === 'boolean'
          ? r.complianceAssessable
          : false
      : true

    let citation_matches_latest: boolean | null = null
    if (compliance_assessable === false) {
      citation_matches_latest = null
    } else if (r.citation_matches_latest === null || r.citationMatchesLatest === null) {
      citation_matches_latest = null
    } else if (typeof r.citation_matches_latest === 'boolean') {
      citation_matches_latest = r.citation_matches_latest
    } else if (typeof r.citationMatchesLatest === 'boolean') {
      citation_matches_latest = r.citationMatchesLatest
    } else if (typeof r.is_latest === 'boolean') {
      citation_matches_latest = r.is_latest
    } else if (typeof r.isLatest === 'boolean') {
      citation_matches_latest = r.isLatest
    } else if (r.resolved === true) {
      citation_matches_latest = true
    } else if (r.resolved === false) {
      citation_matches_latest = false
    } else {
      citation_matches_latest = null
    }

    const is_latest = citation_matches_latest === true

    const current_latest_std_codes = pickStringArray(r, [
      'latest_std_codes',
      'latestStdCodes',
      'current_latest_std_codes',
      'currentLatestStdCodes',
    ])
    const resolution_path = pickOptionalString(r, ['resolution_path', 'resolutionPath'])
    const enterprise_as_of_year = pickNumberOrNull(r, ['enterprise_as_of_year', 'enterpriseAsOfYear'])
    const inferred_historical_std_code = pickOptionalString(r, [
      'inferred_historical_std_code',
      'inferredHistoricalStdCode',
    ])
    const historical_full_std_code = pickOptionalString(r, [
      'full_std_at_publication',
      'fullStdAtPublication',
      'historical_full_std_code',
      'historicalFullStdCode',
    ])
    const pedigree_anchor_std_code = pickOptionalString(r, [
      'pedigree_lookup_std_code',
      'pedigreeLookupStdCode',
      'pedigree_anchor_std_code',
      'pedigreeAnchorStdCode',
    ])
    const latest_std_code_raw = pickOptionalString(r, ['latest_std_code_raw', 'latestStdCodeRaw'])

    const row: ReferenceLatestRow = {
      query_bz_id,
      current_latest_id,
      is_latest,
      compliance_assessable,
      citation_matches_latest,
      pedigree_chain,
    }
    if (current_latest_std_codes.length > 0) row.current_latest_std_codes = current_latest_std_codes
    if (resolution_path != null) row.resolution_path = resolution_path
    if (enterprise_as_of_year != null) row.enterprise_as_of_year = enterprise_as_of_year
    if (inferred_historical_std_code != null) row.inferred_historical_std_code = inferred_historical_std_code
    if (historical_full_std_code != null) row.historical_full_std_code = historical_full_std_code
    if (pedigree_anchor_std_code != null) row.pedigree_anchor_std_code = pedigree_anchor_std_code
    if (latest_std_code_raw != null) row.latest_std_code_raw = latest_std_code_raw
    out.push(row)
  }
  return out
}

function findReferenceLatestRow(rows: ReferenceLatestRow[], bzId: string): ReferenceLatestRow | undefined {
  const key = normalizeStandardCodeForMatch(bzId)
  if (!key) return undefined
  return rows.find((r) => {
    const q = normalizeStandardCodeForMatch(r.query_bz_id)
    if (q === key) return true
    const c = normalizeStandardCodeForMatch(r.current_latest_id)
    return c === key
  })
}

function referenceLatestRowToResult(hit: ReferenceLatestRow, displayQueryBzId: string): StandardLatestCheckResult {
  const disp = displayQueryBzId.trim()
  const q = String(hit.query_bz_id ?? '').trim()
  const assessable = hit.compliance_assessable !== false
  const citationTri: boolean | null =
    hit.compliance_assessable === false
      ? null
      : typeof hit.citation_matches_latest === 'boolean'
        ? hit.citation_matches_latest
        : hit.citation_matches_latest === null
          ? null
          : typeof hit.is_latest === 'boolean'
            ? hit.is_latest
            : null
  const base: StandardLatestCheckResult = {
    queryBzId: disp || q,
    complianceAssessable: assessable,
    citationMatchesLatest: citationTri,
    isLatest: citationTri === true,
    currentLatestId: String(hit.current_latest_id ?? '').trim(),
    pedigreeChain: String(hit.pedigree_chain ?? '').trim(),
  }
  if (hit.current_latest_std_codes?.length) {
    base.currentLatestStdCodes = [...hit.current_latest_std_codes]
  }
  if (hit.resolution_path != null && hit.resolution_path !== '') {
    base.resolutionPath = hit.resolution_path
  }
  if (hit.enterprise_as_of_year != null) {
    base.enterpriseAsOfYear = hit.enterprise_as_of_year
  }
  if (hit.inferred_historical_std_code != null) {
    base.inferredHistoricalStdCode = hit.inferred_historical_std_code
  }
  if (hit.historical_full_std_code != null) {
    base.historicalFullStdCode = hit.historical_full_std_code
  }
  if (hit.pedigree_anchor_std_code != null) {
    base.pedigreeAnchorStdCode = hit.pedigree_anchor_std_code
  }
  if (hit.latest_std_code_raw != null) {
    base.latestStdCodeRaw = hit.latest_std_code_raw
  }
  return base
}

/** 批量模块 `references_resolved` 与合规 `reference-latest` 单条同构，映射为向导第四步表格行 */
export function mapReferencesResolvedToStandardLatestResults(
  resolved: unknown[] | null | undefined,
): StandardLatestCheckResult[] {
  if (!resolved || !Array.isArray(resolved)) return []
  const rows = parseReferenceLatestRows(resolved)
  return rows.map((hit) => {
    const display = String(hit.query_bz_id ?? '').trim()
    return referenceLatestRowToResult(hit, display)
  })
}

/** 将表格行写回 PATCH `references_resolved`（2026-05 精简结构，见对接说明 §5） */
export function standardLatestCheckResultToReferenceResolvedApiRow(
  r: StandardLatestCheckResult,
): Record<string, unknown> {
  const assessable = r.complianceAssessable
  let citation: boolean | null = null
  if (assessable) {
    if (r.citationMatchesLatest === null) citation = null
    else if (typeof r.citationMatchesLatest === 'boolean') citation = r.citationMatchesLatest
    else citation = r.isLatest
  }
  return {
    referenced_std_code: r.queryBzId.trim(),
    resolution_path: (r.resolutionPath && String(r.resolutionPath).trim()) || '',
    compliance_assessable: assessable,
    citation_matches_latest: citation,
    full_std_at_publication: r.historicalFullStdCode ?? null,
    latest_std_primary: r.currentLatestId.trim(),
    explanation: r.pedigreeChain ?? '',
  }
}

export function standardLatestCheckResultsToReferencesResolvedPayload(
  results: StandardLatestCheckResult[],
): Record<string, unknown>[] {
  return results.map((r) => standardLatestCheckResultToReferenceResolvedApiRow(r))
}

export type SaveMappingPayload = {
  enterprise_bz_id: string
  national_bz_id: string
}

export type ReferenceCheckItem = {
  original_text: string
  status: string
  message: string
}

function okAxios<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  }
}

function mapTaskOutToLegacy(item: import('@/types/compliance-api').ComplianceTaskOut, _index: number): ComplianceTask {
  const parseFailed = item.parse_status === 'failed'
  const done = item.current_step >= 6
  const status: ComplianceTask['status'] = parseFailed ? 'failed' : done ? 'completed' : 'processing'
  const progress = Math.min(100, Math.round((item.current_step / 6) * 100))
  return {
    id: String(item.id),
    name: item.qb_code?.trim() || item.uploaded_file_name || `合规评价 #${item.id}`,
    enterprise: item.uploaded_file_name || '-',
    status,
    progress,
    createTime: '',
    deadline: '',
    evaluator: '-',
    steps: [],
  }
}

function parseResultToPending(
  parse: Record<string, unknown> | null,
  qbLabel: string,
): PendingIndexItem[] {
  const inds = extractIndicatorObjectsFromParse(parse)
  const qb = String(parse?.qb_code ?? qbLabel ?? '企标')
  return mapIndicatorsArrayToPending(inds, qb, 'parse')
}

/** 兼容多种解析字段名（手册以 indicators 为主，实际落库可能有别名） */
function extractIndicatorObjectsFromParse(
  parse: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  if (!parse) return []
  const keys = [
    'indicators',
    'enterprise_indicators',
    'qb_indicators',
    'technical_indicators',
    'indicator_list',
  ] as const
  for (const k of keys) {
    const v = parse[k]
    if (Array.isArray(v) && v.length > 0) {
      return v as Array<Record<string, unknown>>
    }
  }
  return []
}

function normalizeIndicatorSource(raw: unknown, idx: number): Record<string, unknown> {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    return { name: `条目${idx + 1}`, value: raw }
  }
  return { name: `条目${idx + 1}`, value: String(raw ?? '-') }
}

function formatIndicatorCell(row: Record<string, unknown>): string {
  const v = row.value ?? row.index_context
  if (v != null && typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  const fallback = v ?? row.raw
  if (fallback != null && typeof fallback === 'object') {
    try {
      return JSON.stringify(fallback)
    } catch {
      return String(fallback)
    }
  }
  return String(fallback ?? '-')
}

function mapIndicatorsArrayToPending(
  indicators: Array<Record<string, unknown>>,
  qbLabel: string,
  idPrefix: string,
): PendingIndexItem[] {
  return indicators.map((raw, idx) => {
    const row = normalizeIndicatorSource(raw, idx)
    const rawObj = row.raw
    const fromRaw =
      rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj)
        ? (rawObj as Record<string, unknown>)
        : null
    const name =
      String(
        row.name ??
          row.indicator_name ??
          ((fromRaw
            ? [String(fromRaw.index_name ?? ''), String(fromRaw.key ?? '')].filter(Boolean).join(' / ')
            : '') ||
            `指标${idx + 1}`),
      )
    return {
      id: `${idPrefix}-${idx}-${name.slice(0, 40)}`,
      standardName: qbLabel,
      indicatorName: name,
      indicatorValue: formatIndicatorCell(row),
      statusText: '解析提取（待审核）',
    }
  })
}

/** 将 `GET .../step/2` 的 suggested_references 映射为向导「规范性引用」表行 */
function mapSuggestedReferencesToPendingExtracts(
  items: Array<{
    referenced_std_code?: string | null
    has_year?: boolean | null
    full_text?: string | null
  }>,
): PendingIndexItem[] {
  return items.map((it, idx) => {
    const code = it.referenced_std_code ?? null
    const yearTag =
      it.has_year === true ? '含年' : it.has_year === false ? '未标注含年' : ''
    return {
      id: `s2-ref-${idx}-${String(code ?? idx)}`,
      standardName: String(code ?? '-'),
      indicatorName: String(it.full_text ?? ''),
      indicatorValue: yearTag,
      statusText: '解析提取（待审核）',
    }
  })
}

/** 从 `parse_result.references_detail` 或 `referenced_std_codes` 生成引用表（审核1同源，步骤未到时也可展示） */
function mapReferencesDetailFromParse(pr: Record<string, unknown> | null): PendingIndexItem[] {
  if (!pr) return []
  const detail = pr.references_detail
  if (Array.isArray(detail)) {
    return detail.map((raw: unknown, idx: number) => {
      const o = raw as Record<string, unknown>
      const sid = String(o.standard_id ?? o.referenced_std_code ?? idx)
      const hy = o.has_year
      const yearTag = hy === true ? '含年' : hy === false ? '未标注含年' : ''
      return {
        id: `parse-refd-${idx}-${sid.slice(0, 48)}`,
        standardName: sid,
        indicatorName: String(o.full_text ?? ''),
        indicatorValue: yearTag,
        statusText: '解析提取（待审核）',
      }
    })
  }
  const codes = pr.referenced_std_codes
  if (!Array.isArray(codes)) return []
  return codes.map((c: unknown, idx: number) => ({
    id: `parse-ref-${idx}-${String(c)}`,
    standardName: String(c),
    indicatorName: '',
    indicatorValue: '',
    statusText: '解析提取（待审核）',
  }))
}

export type GetPendingIndexesResponse = {
  data: PendingIndexItem[]
  /** 来自 GET .../step/2.suggested_references（或 parse_result 引用展开）；出现时同步到向导 referenceRows */
  referenceExtracts?: PendingIndexItem[]
}

export function step4IndicatorsToNationalItems(
  s4: Step4IndicatorsOut,
  filterStd?: string,
): NationalIndexItem[] {
  return step4ToNationalItems(s4, filterStd)
}

function step4ToNationalItems(s4: Step4IndicatorsOut, filterStd?: string): NationalIndexItem[] {
  const out: NationalIndexItem[] = []
  let seq = 0
  const want = filterStd?.trim()
  const ent = Array.isArray(s4.enterprise_indicators) ? s4.enterprise_indicators : []
  for (const raw of ent) {
    const r = raw as Record<string, unknown>
    seq += 1
    out.push({
      id: String(r.id ?? `ent-${seq}`),
      standardId: s4.qb_code || 'enterprise',
      indexName: String(r.name ?? r.indicator_name ?? '-'),
      indexValue: String(r.value ?? r.indicator_value ?? r.specific_indicator_value ?? '-'),
    })
  }
  for (const [std, rows] of Object.entries(s4.national_by_std_code ?? {})) {
    if (want && std !== want) continue
    if (!Array.isArray(rows)) continue
    for (const raw of rows) {
      const r = raw as Record<string, unknown>
      seq += 1
      out.push({
        id: String(r.id ?? `nat-${std}-${seq}`),
        standardId: std,
        indexName: String(r.specific_indicator_value ?? r.index_name ?? '-'),
        indexValue: String(r.specific_indicator_value ?? r.index_context ?? '-'),
      })
    }
  }
  return out
}

async function ensureEvaluationTaskId(): Promise<number> {
  let id = getComplianceEvaluationTaskId()
  if (id != null) return id
  const created = await createEvaluation()
  id = created.id
  setComplianceEvaluationTaskId(id)
  return id
}

export const getComplianceTasks = async (): Promise<{ data: ComplianceTask[] }> => {
  try {
    const list = await listEvaluations()
    const data = list.map(mapTaskOutToLegacy)
    if (getComplianceEvaluationTaskId() == null && list.length > 0) {
      setComplianceEvaluationTaskId(list[0].id)
    }
    return { data }
  } catch (e) {
    throw new Error(getComplianceApiErrorMessage(e))
  }
}

export const getComplianceTask = async (id: string): Promise<AxiosResponse<ComplianceTask>> => {
  const n = Number(id)
  if (!Number.isFinite(n)) {
    throw new Error('无效的任务 id')
  }
  const raw = await getEvaluation(n)
  return okAxios(mapTaskOutToLegacy(raw, 0))
}

export const createComplianceTask = async (
  _payload: CreateComplianceTaskRequest,
): Promise<AxiosResponse<ComplianceTask>> => {
  const raw = await createEvaluation()
  setComplianceEvaluationTaskId(raw.id)
  return okAxios(mapTaskOutToLegacy(raw, 0))
}

export const updateComplianceTask = async (
  _id: string,
  _payload: Partial<ComplianceTask>,
): Promise<AxiosResponse<ComplianceTask>> => {
  return Promise.reject(new Error('新后端暂未提供任务更新接口'))
}

export const deleteComplianceTask = async (_id: string): Promise<void> => {
  return Promise.reject(new Error('新后端暂未提供任务删除接口'))
}

export const uploadEnterpriseStandard = async (file: File | File[], bzId?: string) => {
  const files = Array.isArray(file) ? file : [file]
  let taskId = await ensureEvaluationTaskId()
  try {
    const ev = await getEvaluation(taskId)
    if (ev.current_step !== 1) {
      const fresh = await createEvaluation()
      taskId = fresh.id
      setComplianceEvaluationTaskId(taskId)
    }
  } catch {
    const fresh = await createEvaluation()
    taskId = fresh.id
    setComplianceEvaluationTaskId(taskId)
  }
  const task = await uploadEvaluationFile(taskId, files[0])
  const step1 = await getStep1(taskId)
  const pr = step1.parse_result as Record<string, unknown> | null
  const synthetic = {
    ...pr,
    bz_id: pr?.qb_code ?? (bzId?.trim() || null),
    qb_code: pr?.qb_code ?? (bzId?.trim() || null),
    task,
  }
  return okAxios(synthetic)
}

/** 新后端无独立 batch-indexes；保留函数签名，避免向导并行调用报错 */
export const postInsertIndexes = async (_file: File | File[], _bzId?: string) => {
  return okAxios({ skipped: true })
}

export const getPendingIndexes = async (): Promise<GetPendingIndexesResponse> => {
  const id = getComplianceEvaluationTaskId()
  if (id == null) {
    return { data: [] }
  }
  try {
    const task = await getEvaluation(id)
    const s1 = await getStep1(id)
    const pr = s1.parse_result as Record<string, unknown> | null
    const qb = String(pr?.qb_code ?? s1.task.qb_code ?? '企标')
    const fromParseIndicators = parseResultToPending(pr, qb)
    const refFromParse = mapReferencesDetailFromParse(pr)

    if (task.current_step >= 2) {
      try {
        const s2 = await getStep2(id)
        const qb2 = String(s2.task.qb_code ?? task.qb_code ?? qb)
        const refItems = mapSuggestedReferencesToPendingExtracts(s2.suggested_references ?? [])
        let indItems = mapIndicatorsArrayToPending(
          (s2.indicators ?? []) as Array<Record<string, unknown>>,
          qb2,
          's2-ind',
        )
        if (indItems.length === 0) {
          indItems = fromParseIndicators
        }
        const refsCombined = refItems.length > 0 ? refItems : refFromParse
        return {
          data: indItems,
          ...(refsCombined.length > 0 ? { referenceExtracts: refsCombined } : {}),
        }
      } catch {
        return {
          data: fromParseIndicators,
          ...(refFromParse.length > 0 ? { referenceExtracts: refFromParse } : {}),
        }
      }
    }
    return {
      data: fromParseIndicators,
      ...(refFromParse.length > 0 ? { referenceExtracts: refFromParse } : {}),
    }
  } catch {
    return { data: [] }
  }
}

export const getNationalIndexes = async (params?: Record<string, unknown>) => {
  const id = getComplianceEvaluationTaskId()
  if (id == null) {
    return okAxios<NationalIndexItem[]>([])
  }
  try {
    const task = await getEvaluation(id)
    if (task.current_step < 4) {
      return okAxios<NationalIndexItem[]>([])
    }
    const s4 = await getStep4Indicators(id)
    const filter = typeof params?.bz_id === 'string' ? params.bz_id : undefined
    const data = step4ToNationalItems(s4, filter)
    return okAxios(data)
  } catch {
    return okAxios<NationalIndexItem[]>([])
  }
}

export type CheckLatestStandardsBatchResult = {
  results: StandardLatestCheckResult[]
  /** 合规 `GET .../reference-latest` 根级四态（2026-05） */
  file_compliance_outcome?: FileComplianceOutcome
}

/**
 * 一次拉取 `reference-latest` 并按顺序映射到每条引用标准号（避免 N 次重复请求与严格字符串匹配失败）。
 */
export const checkLatestStandardsBatch = async (
  bzIds: string[],
): Promise<CheckLatestStandardsBatchResult> => {
  const id = getComplianceEvaluationTaskId()
  const noTask = (bzId: string): StandardLatestCheckResult => ({
    queryBzId: bzId.trim(),
    complianceAssessable: false,
    citationMatchesLatest: null,
    isLatest: false,
    currentLatestId: '',
    pedigreeChain: '无任务上下文，无法查询现行最新',
  })

  if (id == null) {
    return { results: bzIds.map((bzId) => noTask(bzId)) }
  }

  try {
    const rowsRaw = await getStep3ReferenceLatest(id)
    const fileOutcome = getFileComplianceOutcomeFromPayload(rowsRaw)
    const rows = parseReferenceLatestRows(rowsRaw as unknown)
    const results = bzIds.map((bzId, index) => {
      const trimmed = bzId.trim()
      let hit = findReferenceLatestRow(rows, trimmed)
      if (!hit && rows.length === bzIds.length && rows[index] != null) {
        const cand = rows[index]
        const k = normalizeStandardCodeForMatch(trimmed)
        const qn = normalizeStandardCodeForMatch(cand.query_bz_id)
        const emptyQuery = !String(cand.query_bz_id ?? '').trim()
        if (emptyQuery || qn === k) {
          hit = cand
        }
      }
      if (!hit) {
        return {
          queryBzId: trimmed,
          complianceAssessable: false,
          citationMatchesLatest: null,
          isLatest: false,
          currentLatestId: '',
          pedigreeChain:
            '未在「现行最新」结果中匹配到该标准号（可核对空格、斜杠写法是否与库内 std_code 一致）',
        }
      }
      return referenceLatestRowToResult(hit, trimmed)
    })
    return { results, file_compliance_outcome: fileOutcome }
  } catch (error) {
    const msg = getComplianceApiErrorMessage(error)
    return {
      results: bzIds.map((bzId) => ({
        queryBzId: bzId.trim(),
        complianceAssessable: false,
        citationMatchesLatest: null,
        isLatest: false,
        currentLatestId: '',
        pedigreeChain: msg,
      })),
    }
  }
}

export const checkLatestStandard = async (bzId: string): Promise<StandardLatestCheckResult> => {
  const { results } = await checkLatestStandardsBatch([bzId])
  const row = results[0]
  return (
    row ?? {
      queryBzId: bzId.trim(),
      complianceAssessable: false,
      citationMatchesLatest: null,
      isLatest: false,
      currentLatestId: '',
      pedigreeChain: '无法解析校验结果',
    }
  )
}

const SS_MANUAL_SUPPLEMENTS = 'compliance_manual_supplements_'
const SS_POSTED_SUPPLEMENTS = 'compliance_posted_supplements_'

function readStringArrayFromSession(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function writeStringArrayToSession(key: string, codes: string[]) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(key, JSON.stringify([...new Set(codes.map((c) => c.trim()).filter(Boolean))]))
}

/** 弹窗「新增最新标准」列表（仅 UI 展示，与 task 绑定） */
export function loadManualSupplementStdCodes(taskId: number): string[] {
  return readStringArrayFromSession(`${SS_MANUAL_SUPPLEMENTS}${taskId}`)
}

export function saveManualSupplementStdCodes(taskId: number, codes: string[]) {
  writeStringArrayToSession(`${SS_MANUAL_SUPPLEMENTS}${taskId}`, codes)
}

/** 已成功 POST supplements 的标准号（含提交审核 3 时同步的 GB 最新号） */
export function loadPostedSupplementStdCodes(taskId: number): string[] {
  return readStringArrayFromSession(`${SS_POSTED_SUPPLEMENTS}${taskId}`)
}

export function mergePostedSupplementStdCodes(taskId: number, codes: string[]) {
  const merged = [...loadPostedSupplementStdCodes(taskId), ...codes]
  writeStringArrayToSession(`${SS_POSTED_SUPPLEMENTS}${taskId}`, merged)
}

/**
 * 审核 3 阶段写入 n+m 补充行：`POST .../step/3/supplements`。
 * @param alreadyPosted 传入可变 Set 时跳过已提交的标准号，并在成功后写入该 Set。
 */
export async function syncEvaluationStep3Supplements(
  taskId: number,
  latestStdCodes: string[],
  alreadyPosted?: Set<string>,
): Promise<{ posted: string[]; skipped: string[] }> {
  const posted: string[] = []
  const skipped: string[] = []
  const toPost: string[] = []
  for (const raw of latestStdCodes) {
    const code = raw.trim()
    if (!code) continue
    if (alreadyPosted?.has(code)) {
      skipped.push(code)
      continue
    }
    toPost.push(code)
  }
  const unique = [...new Set(toPost)]
  if (unique.length === 0) {
    return { posted, skipped }
  }
  await postStep3Supplements(taskId, {
    rows: unique.map((latest_std_code) => ({ latest_std_code })),
  })
  for (const code of unique) {
    posted.push(code)
    alreadyPosted?.add(code)
  }
  mergePostedSupplementStdCodes(taskId, posted)
  return { posted, skipped }
}

/** 步骤 4 编排：拉取 N+M 侧国标指标（须 `current_step >= 4`） */
export async function fetchStep4NationalIndexItems(taskId: number): Promise<{
  stdCodes: string[]
  items: NationalIndexItem[]
  missingGbFiles: Step4IndicatorsOut['missing_gb_files']
}> {
  const task = await getEvaluation(taskId)
  if (task.current_step < 4) {
    return { stdCodes: [], items: [], missingGbFiles: [] }
  }
  const s4 = await getStep4Indicators(taskId)
  return {
    stdCodes: Object.keys(s4.national_by_std_code ?? {}),
    items: step4ToNationalItems(s4),
    missingGbFiles: s4.missing_gb_files ?? [],
  }
}

export type Step4IndicatorBundleView = {
  s4: Step4IndicatorsOut
  oldRows: NationalIndexItem[]
  latestRows: NationalIndexItem[]
  missingOldStdCodes: string[]
  missingLatestStdCodes: string[]
}

export type Step4IndicatorEnsureView = Step4IndicatorBundleView & {
  allReady: boolean
  stdStatuses: StdCodeOrchestrationStatus[]
}

function buildIndicatorBundleFromS4(
  s4: Step4IndicatorsOut,
  comparePairs: ComparePairIn[],
): Step4IndicatorBundleView {
  const national = s4.national_by_std_code ?? {}

  const publicationCodes = [
    ...new Set(
      comparePairs
        .map((p) => (p.publication_std_code ?? '').trim())
        .filter((code) => code.length > 0),
    ),
  ]
  const latestCodes = [
    ...new Set(comparePairs.map((p) => p.latest_std_code.trim()).filter((code) => code.length > 0)),
  ]

  const oldRows: NationalIndexItem[] = []
  for (const code of publicationCodes) {
    oldRows.push(...nationalRowsToIndexItems(code, national[code]))
  }
  oldRows.push(...enterpriseRowsToIndexItems(s4))

  const latestRows: NationalIndexItem[] = []
  for (const code of latestCodes) {
    latestRows.push(...nationalRowsToIndexItems(code, national[code]))
  }

  const hasRows = (code: string) => {
    const rows = national[code]
    return Array.isArray(rows) && rows.length > 0
  }

  return {
    s4,
    oldRows,
    latestRows,
    missingOldStdCodes: publicationCodes.filter((code) => !hasRows(code)),
    missingLatestStdCodes: latestCodes.filter((code) => !hasRows(code)),
  }
}

function nationalRowsToIndexItems(stdCode: string, rows: unknown): NationalIndexItem[] {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const out: NationalIndexItem[] = []
  let seq = 0
  for (const raw of rows) {
    const r = raw as Record<string, unknown>
    seq += 1
    out.push({
      id: String(r.id ?? `nat-${stdCode}-${seq}`),
      standardId: stdCode,
      indexName: String(r.specific_indicator_value ?? r.index_name ?? r.name ?? '-'),
      indexValue: String(r.specific_indicator_value ?? r.index_context ?? r.value ?? '-'),
      singleResult: r.single_result != null ? String(r.single_result) : undefined,
      matchStatus: r.match_status != null ? String(r.match_status) : undefined,
    })
  }
  return out
}

function enterpriseRowsToIndexItems(s4: Step4IndicatorsOut): NationalIndexItem[] {
  const out: NationalIndexItem[] = []
  let seq = 0
  const ent = Array.isArray(s4.enterprise_indicators) ? s4.enterprise_indicators : []
  for (const raw of ent) {
    const r = raw as Record<string, unknown>
    seq += 1
    out.push({
      id: String(r.id ?? `ent-${seq}`),
      standardId: s4.qb_code || 'enterprise',
      indexName: String(r.name ?? r.indicator_name ?? '-'),
      indexValue: String(r.value ?? r.indicator_value ?? r.specific_indicator_value ?? '-'),
    })
  }
  return out
}

/**
 * 仅从 `GET .../step/4/indicators` 组装旧/现行指标基线（不写前端模拟指标）。
 * 第五步编排请使用 `ensureStep4IndicatorsForCompare`。
 */
export async function loadStep4IndicatorBundleView(
  taskId: number,
  referenceStdCodes: string[],
): Promise<Step4IndicatorBundleView> {
  const task = await getEvaluation(taskId)
  if (task.current_step < 4) {
    throw new Error('请先完成「引用标准有效性与更替确认」并提交审核 3，再进入技术指标对比。')
  }
  const s4 = await getStep4Indicators(taskId)
  const pairs: ComparePairIn[] = referenceStdCodes
    .filter((code) => code.trim())
    .map((code) => ({ publication_std_code: code.trim(), latest_std_code: code.trim() }))
  return buildIndicatorBundleFromS4(s4, pairs)
}

/**
 * 第五步：`POST .../step/4/indicators/ensure`，按 ③ 可对比标准两列标准号编排指标。
 */
export async function ensureStep4IndicatorsForCompare(
  taskId: number,
  comparePairs: ComparePairIn[],
): Promise<Step4IndicatorEnsureView> {
  const task = await getEvaluation(taskId)
  if (task.current_step < 4) {
    throw new Error('请先完成「引用标准有效性与更替确认」并提交审核 3，再进入技术指标对比。')
  }
  if (comparePairs.length === 0) {
    throw new Error('暂无可进行指标对比的标准，请先在第四步补全 GB 引用或补充标准。')
  }
  const out: Step4IndicatorsEnsureOut = await postStep4IndicatorsEnsure(taskId, {
    compare_pairs: comparePairs,
  })
  const bundle = buildIndicatorBundleFromS4(out, comparePairs)
  return {
    ...bundle,
    allReady: Boolean(out.all_ready),
    stdStatuses: Array.isArray(out.std_statuses) ? out.std_statuses : [],
  }
}

export { uploadNationalStandard }

export async function fetchNationalIndicatorDetail(
  taskId: number,
  stdCode: string,
  cachedRows?: unknown[],
) {
  try {
    return await getNationalIndicatorsByStd(taskId, stdCode)
  } catch {
    if (cachedRows) {
      return {
        std_code: stdCode,
        std_name: null,
        rows: cachedRows.map((raw, i) => {
          const r = raw as Record<string, unknown>
          return {
            id: Number(r.id ?? i + 1),
            std_code: stdCode,
            specific_indicator_value: String(r.specific_indicator_value ?? ''),
            manual_review_status:
              (r.manual_review_status as 'pending' | 'approved' | 'rejected' | null) ?? null,
          }
        }),
      }
    }
    throw new Error('无法加载国标指标明细，请确认后端已实现 GET national-indicators 接口')
  }
}

export async function reviewNationalIndicatorForStd(
  taskId: number,
  stdCode: string,
  status: 'approved' | 'rejected',
) {
  return postNationalIndicatorReview(taskId, stdCode, { manual_review_status: status })
}

export async function saveNationalIndicatorIndexes(
  taskId: number,
  stdCode: string,
  specificIndicatorValue: string,
) {
  return putNationalIndicatorSave(taskId, {
    std_code: stdCode.trim(),
    specific_indicator_value: specificIndicatorValue,
  })
}

export type BackendStep5ComparisonResult = {
  compareResult: Record<string, unknown>
  rows: ComparePreviewRow[]
  task: ComplianceTaskOut
}

/**
 * 审核 4 确认（若仍在步骤 4）→ `POST/GET .../step/5/compare`（Dify③）→ 解析为表格行。
 * @param comparePairs 与 ③ 表格一致；POST 时传给后端先刷新 bundle 再对比，失败则回退 GET。
 */
export async function runBackendStep5Comparison(
  taskId: number,
  comparePairs?: ComparePairIn[],
): Promise<BackendStep5ComparisonResult> {
  let task = await getEvaluation(taskId)
  if (task.current_step < 4) {
    throw new Error('请先完成审核 3 后再构建技术指标对比。')
  }
  if (task.current_step === 4) {
    task = await confirmStep4(taskId)
  }
  if (task.current_step < 5) {
    throw new Error(`服务端未进入步骤 5（当前 current_step=${task.current_step}），无法拉取对比结果。`)
  }
  let out: Awaited<ReturnType<typeof getStep5Compare>>
  if (comparePairs && comparePairs.length > 0) {
    try {
      out = await postStep5Compare(taskId, { compare_pairs: comparePairs })
    } catch {
      out = await getStep5Compare(taskId)
    }
  } else {
    out = await getStep5Compare(taskId)
  }
  const compareResult = (out.compare_result ?? {}) as Record<string, unknown>
  const rows = parseStep5CompareResultToRows(compareResult)
  return { compareResult, rows, task }
}

/** @deprecated 请使用 `syncEvaluationStep3Supplements`；保留兼容旧调用 */
export const saveReferenceMapping = async (payload: SaveMappingPayload) => {
  const id = getComplianceEvaluationTaskId()
  if (id == null) {
    throw new Error('请先创建/选择评价任务')
  }
  const code = payload.national_bz_id.trim()
  if (!code) {
    throw new Error('最新标准号不能为空')
  }
  await syncEvaluationStep3Supplements(id, [code])
  return okAxios({ ok: true })
}

export const submitAuditDecision = async (
  _id: string,
  _action: 'approve' | 'reject',
  _details?: Record<string, unknown>,
) => {
  return okAxios({ ok: true })
}

export const submitAuditBulkDecision = async (_ids: string[], _action: 'approve' | 'reject') => {
  return okAxios({ ok: true })
}

export const exportComplianceReport = async (_bzId: string) => {
  const id = getComplianceEvaluationTaskId()
  if (id == null) {
    throw new Error('请先创建评价任务并完成流程以生成制品')
  }
  const { artifacts } = await listArtifacts(id)
  const first = artifacts[0]
  if (!first?.path) {
    throw new Error('暂无可下载制品，请先完成向导后续步骤')
  }
  const blob = await downloadArtifactFile(id, first.path)
  return {
    data: blob,
    status: 200,
    statusText: 'OK',
    headers: {
      'content-disposition': `attachment; filename="${encodeURIComponent(first.label)}"`,
      'content-type': 'application/octet-stream',
    },
    config: {} as never,
  } as AxiosResponse<Blob>
}

export const exportComplianceReportBatch = async (bzIds: string[]) => {
  const ids = bzIds.map((item) => item.trim()).filter(Boolean)
  if (ids.length === 0) {
    throw new Error('请至少提供一个标准编号。')
  }
  return exportComplianceReport(ids[0])
}

export const getStandardsBasicSearch = async (_keyword: string) => {
  throw new Error('新合规模块未提供该接口')
}

export const getStandardsWarningTrace = async (_bzId: string) => {
  throw new Error('新合规模块未提供该接口')
}

export const getStandardsDashboardAlerts = async () => {
  throw new Error('新合规模块未提供该接口')
}

export const getStandardsStatistics = async () => {
  throw new Error('新合规模块未提供该接口')
}

export const downloadStandardDoc = async (_bzId: string) => {
  throw new Error('新合规模块未提供该接口')
}

export const analyzeQbReferencesAuto = async (_file: File) => {
  throw new Error('新合规模块未提供该接口')
}

export const getDifyPrefaceDiff = async (_bzId: string) => {
  throw new Error('新合规模块未提供该接口')
}

export const getTreeData = async (_bzId: string) => {
  throw new Error('新合规模块未提供该接口')
}

export const checkReferencesComparison = async (_payload: {
  qibiao_release_date: string
  references: Array<{ standard_id: string; has_year: boolean; full_text: string }>
}) => {
  throw new Error('新合规模块未提供该接口')
}

export const postInsertAntiWarn = async (_payload: Record<string, unknown>) => {
  throw new Error('新合规模块未提供该接口')
}
