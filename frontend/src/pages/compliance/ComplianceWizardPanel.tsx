import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Input,
  Radio,
  Row,
  Space,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { DownloadOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons'
import {
  backendCurrentStepToMaxWizardIndex,
  checkLatestStandardsBatch,
  confirmEvaluationAuditStep1,
  confirmEvaluationAuditStep2,
  confirmEvaluationAuditStep3,
  confirmEvaluationAuditStep4,
  exportComplianceReport,
  fileComplianceOutcomeLabel,
  getComplianceEvaluationTaskId,
  getNationalIndexes,
  getPendingIndexes,
  isRowCitationAutoLatest,
  isRowCitationAutoOutdated,
  pollComplianceEvaluationUntilParseSettled,
  postInsertIndexes,
  saveReferenceMapping,
  submitAuditBulkDecision,
  submitAuditDecision,
  type NationalIndexItem,
  type PendingIndexItem,
  type StandardLatestCheckResult,
  uploadEnterpriseStandard,
} from '@/services/compliance'
import { getEvaluation, getStep4Indicators } from '@/services/compliance-api'
import type { MissingGbFileItem } from '@/types/compliance-api'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'
import {
  downloadComplianceConclusionTextReport,
  safeFilenameSegment,
} from '@/pages/compliance/utils/stepReportExport'
import { ReferenceLatestResolvedTable } from '@/pages/compliance/components/ReferenceLatestResolvedTable'

const { Text } = Typography

export const WIZARD_STEP_TITLES = [
  '企标文件上传',
  '描述性合规评价',
  '规范性引用与企标指标提取审核',
  '引用标准有效性与更替确认',
  '指标映射与技术对比确认',
  '三项评价总结与报告生成',
]

export type ComparePreviewRow = {
  id: string
  indicatorName: string
  enterpriseValue: string
  matchedStandard: string
  nationalValue: string
  status: string
  source: 'enterprise_or_old' | 'manual'
  baselineStandard?: string
  latestStandard?: string
}

type DescriptiveReviewState = {
  bzId: string
  enterpriseName: string
  decision: 'pending' | 'approve' | 'reject'
  isCompliant: 'pending' | 'yes' | 'no'
  nonComplianceReasons: string[]
  nonComplianceDetail: string
  reviewConclusion: string
  updatedAt: string
}

const DESCRIPTIVE_NON_COMPLIANCE_OPTIONS = [
  { label: '结构完整性问题', value: 'structure' },
  { label: '格式规范性问题', value: 'format' },
  { label: '术语与定义缺失', value: 'terms' },
  { label: '规范性引用问题', value: 'references' },
  { label: '其他问题', value: 'others' },
]

export type WizardProgressSnapshot = {
  currentStep: number
  pendingCount: number
  hasExtractionData: boolean
}

export type ComplianceWizardPanelProps = {
  onProgressSnapshot?: (snapshot: WizardProgressSnapshot) => void
  afterUploadSuccess?: () => void
}

export type ComplianceWizardPanelHandle = {
  scrollIntoView: () => void
}

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #e8ecf1',
  boxShadow: '0 4px 18px rgba(15, 23, 42, 0.06)',
}

const extractPendingRowsFromUploadPayload = (input: unknown): PendingIndexItem[] => {
  const rows: PendingIndexItem[] = []
  let seq = 0

  const pushRow = (partial: {
    standardName?: unknown
    indicatorName?: unknown
    indicatorValue?: unknown
    statusText?: unknown
    id?: unknown
  }) => {
    const standardName = String(partial.standardName ?? '-').trim()
    const indicatorName = String(partial.indicatorName ?? '').trim()
    const indicatorValue = String(partial.indicatorValue ?? '').trim()
    if (!indicatorName && !indicatorValue) return
    seq += 1
    rows.push({
      id: String(partial.id ?? `upload-auto-${seq}`),
      standardName: standardName || '-',
      indicatorName: indicatorName || '引用文本',
      indicatorValue: indicatorValue || '-',
      statusText: String(partial.statusText ?? '解析结果待审核'),
    })
  }

  const walk = (node: unknown) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return

    const obj = node as Record<string, unknown>
    // 引用标准场景：standard_id/full_text
    if (obj.standard_id !== undefined || obj.full_text !== undefined || obj.original_text !== undefined) {
      pushRow({
        id: obj.id,
        standardName: obj.standard_id ?? obj.bz_id ?? obj.standard_name,
        indicatorName: obj.index_name ?? obj.indicator_name ?? obj.standard_name ?? '引用文本',
        indicatorValue: obj.full_text ?? obj.original_text ?? obj.index_context,
        statusText: obj.status_text ?? '解析结果待审核',
      })
    }

    // 指标场景：index_name/index_context
    if (obj.index_name !== undefined || obj.indicator_name !== undefined) {
      pushRow({
        id: obj.id,
        standardName: obj.bz_id ?? obj.standard_id ?? obj.standard_name ?? '-',
        indicatorName: obj.index_name ?? obj.indicator_name ?? obj.name,
        indicatorValue: obj.index_context ?? obj.indicator_value ?? obj.value ?? obj.content,
        statusText: obj.status_text ?? '解析结果待审核',
      })
    }

    const nested = [
      obj.references,
      obj.indexes,
      obj.evaluation_results,
      obj.results,
      obj.data,
      obj.payload,
      obj.content,
    ]
    nested.forEach(walk)
  }

  walk(input)
  return rows
}

const REFERENCE_CODE_REGEX = /([A-Z]{1,6}(?:\/[A-Z]{1,6})?\s*\d+(?:\.\d+)*(?:-\d{4})?)/gi

const normalizeReferenceCode = (value: string) => value.replace(/\s+/g, '').trim()
const ALLOWED_REFERENCE_CODE_PREFIX_REGEX = /^(GB\/T|GB|ISO|IEC)/i
const isAllowedReferenceCode = (code: string) => ALLOWED_REFERENCE_CODE_PREFIX_REGEX.test(code)

const normalizeComparisonText = (value: string) =>
  value.replace(/\s+/g, '').replace(/[；;，,。\.、:：\-_]/g, '').trim()

const parseFirstNumber = (text: string): number | null => {
  const match = text.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

const evaluateByRuleExpression = (enterpriseValue: string, latestValue: string): string | null => {
  const source = latestValue.replace(/\s+/g, '')
  const enterpriseNumeric = parseFirstNumber(enterpriseValue)
  if (enterpriseNumeric === null) return null

  const lessEqual = source.match(/(?:<=|≤)(-?\d+(?:\.\d+)?)/)
  if (lessEqual) {
    const threshold = Number(lessEqual[1])
    return enterpriseNumeric <= threshold ? '合规' : '不合规（高于国标）'
  }

  const greaterEqual = source.match(/(?:>=|≥)(-?\d+(?:\.\d+)?)/)
  if (greaterEqual) {
    const threshold = Number(greaterEqual[1])
    return enterpriseNumeric >= threshold ? '合规' : '不合规（低于国标）'
  }

  const range = source.match(/(-?\d+(?:\.\d+)?)\s*(?:~|～|-|—|至)\s*(-?\d+(?:\.\d+)?)/)
  if (range) {
    const left = Number(range[1])
    const right = Number(range[2])
    const min = Math.min(left, right)
    const max = Math.max(left, right)
    return enterpriseNumeric >= min && enterpriseNumeric <= max ? '合规' : '不合规（超出国标范围）'
  }
  return null
}

const normalizeBackendSingleResult = (value?: string): string => {
  const text = (value ?? '').trim()
  if (!text || text === '-') return ''
  if (text.includes('一致') || text.includes('合规') || text.toLowerCase() === 'pass') return '合规'
  if (text.includes('高') || text.includes('超') || text.includes('严于')) return '不合规（高于国标）'
  if (text.includes('低') || text.includes('弱于')) return '不合规（低于国标）'
  if (text.includes('不合规') || text.toLowerCase() === 'fail') return '不合规'
  return text
}

const buildComparisonResult = (
  indicatorName: string,
  enterpriseValue: string,
  latestRows: NationalIndexItem[],
): Pick<ComparePreviewRow, 'matchedStandard' | 'status' | 'nationalValue' | 'latestStandard'> => {
  const match = latestRows.find(
    (latest) =>
      latest.indexName.includes(indicatorName) || indicatorName.includes(latest.indexName),
  )
  if (!match) {
    return {
      matchedStandard: '-',
      status: '未在国标指标库中找到对应项',
      nationalValue: '待确认',
      latestStandard: '请补齐引用文件或手工补录',
    }
  }
  const backendSingleResult = normalizeBackendSingleResult(match.singleResult)
  const backendMatchStatus = (match.matchStatus ?? '').trim()
  const enterpriseNormalized = normalizeComparisonText(enterpriseValue)
  const latestNormalized = normalizeComparisonText(match.indexValue)

  let singleResult = backendSingleResult
  if (!singleResult) {
    const ruleResult = evaluateByRuleExpression(enterpriseValue, match.indexValue)
    if (ruleResult) {
      singleResult = ruleResult
    } else if (enterpriseNormalized && latestNormalized) {
      if (enterpriseNormalized === latestNormalized) {
        singleResult = '合规'
      } else {
        const enterpriseNumeric = parseFirstNumber(enterpriseValue)
        const latestNumeric = parseFirstNumber(match.indexValue)
        if (enterpriseNumeric !== null && latestNumeric !== null) {
          singleResult =
            enterpriseNumeric > latestNumeric ? '不合规（高于国标）' : '不合规（低于国标）'
        } else {
          singleResult = '需人工判定'
        }
      }
    } else {
      singleResult = '需人工判定'
    }
  }

  const statusText = backendMatchStatus || '已在国标指标库中找到对应项'
  return {
    matchedStandard: match.indexValue,
    status: statusText,
    nationalValue: singleResult,
    latestStandard: `${match.standardId} / ${match.indexName}`,
  }
}

const extractReferenceCodeRowsFromUploadPayload = (input: unknown): PendingIndexItem[] => {
  const rows: PendingIndexItem[] = []
  const uniqueKeys = new Set<string>()
  let seq = 0

  const pushReference = (partial: {
    referenceCode?: unknown
    referenceName?: unknown
    id?: unknown
  }) => {
    const referenceCode = normalizeReferenceCode(String(partial.referenceCode ?? '').trim())
    const referenceName = String(partial.referenceName ?? '').trim()
    if (!referenceCode) return
    if (!isAllowedReferenceCode(referenceCode)) return
    const dedupeKey = `${referenceCode}|${referenceName}`
    if (uniqueKeys.has(dedupeKey)) return
    uniqueKeys.add(dedupeKey)
    seq += 1
    rows.push({
      id: String(partial.id ?? `ref-code-auto-${seq}`),
      standardName: referenceCode || '-',
      indicatorName: referenceName || '-',
      indicatorValue: referenceName || '-',
      statusText: '解析结果待审核',
    })
  }

  const parseLinesFromText = (text: string) => {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  const parseCodeAndName = (line: string) => {
    const matches = Array.from(line.matchAll(REFERENCE_CODE_REGEX))
    if (matches.length === 0) return null
    const code = normalizeReferenceCode(matches[0]?.[1] ?? '')
    if (!code) return null
    if (!isAllowedReferenceCode(code)) return null
    const name = line.replace(matches[0]?.[1] ?? '', '').trim()
    return { code, name: name || line }
  }

  const walk = (node: unknown) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return
    const obj = node as Record<string, unknown>

    const rawReferenceText = obj.full_text ?? obj.original_text ?? obj.reference_text ?? obj.text ?? obj.content
    const referenceCodeCandidate = obj.standard_id ?? obj.reference_standard ?? obj.reference_id ?? obj.code
    const referenceNameCandidate =
      obj.reference_name ?? obj.reference_file_name ?? obj.standard_name ?? obj.file_name ?? obj.filename ?? obj.name
    const referenceText = typeof rawReferenceText === 'string' ? rawReferenceText : ''
    const codeText = typeof referenceCodeCandidate === 'string' ? referenceCodeCandidate : ''
    const nameText = typeof referenceNameCandidate === 'string' ? referenceNameCandidate : ''

    if (codeText || nameText) {
      const parsedFromCodeText = parseCodeAndName(`${codeText} ${nameText}`.trim())
      if (parsedFromCodeText) {
        pushReference({
          id: obj.id,
          referenceCode: parsedFromCodeText.code,
          referenceName: parsedFromCodeText.name,
        })
      }
    }
    if (referenceText) {
      const lines = parseLinesFromText(referenceText)
      lines.forEach((line) => {
        const parsed = parseCodeAndName(line)
        if (parsed) {
          pushReference({
            id: obj.id,
            referenceCode: parsed.code,
            referenceName: parsed.name,
          })
        }
      })
      if (lines.length === 0 && codeText) {
        pushReference({
          id: obj.id,
          referenceCode: codeText,
          referenceName: nameText || referenceText,
        })
      }
    }

    const nested = [obj.references, obj.evaluation_results, obj.results, obj.data, obj.payload, obj.content]
    nested.forEach(walk)
  }

  walk(input)
  return rows
}

const getUploadResultError = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return ''
  }
  const data = payload as Record<string, unknown>
  if (data.success === false) {
    const raw = data.error ?? data.msg ?? data.message
    return typeof raw === 'string' ? raw : '后端返回 success=false'
  }
  return ''
}

const extractBzIdsFromPayload = (input: unknown) => {
  const ids = new Set<string>()
  const walk = (node: unknown) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    const candidates = [obj.bz_id, obj.target_bz_id, obj.enterprise_bz_id, obj.qibiao_bz_id]
    candidates.forEach((value) => {
      if (typeof value === 'string' && value.trim()) {
        ids.add(value.trim())
      }
    })
    Object.values(obj).forEach(walk)
  }
  walk(input)
  return Array.from(ids)
}

const extractDescriptiveInfoFromPayload = (input: unknown) => {
  const bzIds = new Set<string>()
  const enterpriseNames = new Set<string>()
  const walk = (node: unknown) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    const bzIdCandidates = [obj.bz_id, obj.target_bz_id, obj.enterprise_bz_id, obj.qibiao_bz_id]
    bzIdCandidates.forEach((value) => {
      if (typeof value === 'string' && value.trim()) {
        bzIds.add(value.trim())
      }
    })
    const enterpriseCandidates = [obj.enterprise_name, obj.enterprise, obj.org_name, obj.draft_org, obj.company_name]
    enterpriseCandidates.forEach((value) => {
      if (typeof value === 'string' && value.trim()) {
        enterpriseNames.add(value.trim())
      }
    })
    Object.values(obj).forEach(walk)
  }
  walk(input)
  return {
    bzId: Array.from(bzIds)[0] ?? '',
    enterpriseName: Array.from(enterpriseNames)[0] ?? '',
  }
}

const ComplianceWizardPanel = forwardRef<ComplianceWizardPanelHandle, ComplianceWizardPanelProps>(
  function ComplianceWizardPanel({ onProgressSnapshot, afterUploadSuccess }, ref) {
    const rootRef = React.useRef<HTMLDivElement | null>(null)
    const [messageApi, contextHolder] = message.useMessage()
    const [current, setCurrent] = useState(0)
    const [uploading, setUploading] = useState(false)
    const [fileList, setFileList] = useState<UploadFile[]>([])
    const [pendingRows, setPendingRows] = useState<PendingIndexItem[]>([])
    const [referenceRows, setReferenceRows] = useState<PendingIndexItem[]>([])
    const [loadingPending, setLoadingPending] = useState(false)
    const [auditingId, setAuditingId] = useState<string | null>(null)
    const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | null>(null)
    const [referenceBulkAction, setReferenceBulkAction] = useState<'approve' | 'reject' | null>(null)
    const [editingRowId, setEditingRowId] = useState<string | null>(null)
    const [editingDraft, setEditingDraft] = useState({
      standardName: '',
      indicatorName: '',
      indicatorValue: '',
    })
    const [editSaving, setEditSaving] = useState(false)
    const [comparePreview, setComparePreview] = useState<ComparePreviewRow[]>([])
    const [comparisonEditingId, setComparisonEditingId] = useState<string | null>(null)
    const [comparisonDraft, setComparisonDraft] = useState<ComparePreviewRow | null>(null)
    const [comparisonAuditPassed, setComparisonAuditPassed] = useState(false)
    const [comparisonLoading, setComparisonLoading] = useState(false)
    const [oldReferenceIndexRows, setOldReferenceIndexRows] = useState<NationalIndexItem[]>([])
    const [latestReferenceIndexRows, setLatestReferenceIndexRows] = useState<NationalIndexItem[]>([])
    const [missingOldReferenceFiles, setMissingOldReferenceFiles] = useState<string[]>([])
    const [missingLatestReferenceFiles, setMissingLatestReferenceFiles] = useState<string[]>([])
    /** `GET .../step/4/indicators` 返回的缺失国标（与「构建对比」并行，用于进入本步后立即展示） */
    const [step4BackendMissingGb, setStep4BackendMissingGb] = useState<MissingGbFileItem[]>([])
    const [repairUploadFiles, setRepairUploadFiles] = useState<UploadFile[]>([])
    const [repairUploading, setRepairUploading] = useState(false)
    const [validityLoading, setValidityLoading] = useState(false)
    const [wizardNextLoading, setWizardNextLoading] = useState(false)
    const [backendMaxWizardIndex, setBackendMaxWizardIndex] = useState(0)
    const [latestStandardRows, setLatestStandardRows] = useState<StandardLatestCheckResult[]>([])
    const [validityEditingId, setValidityEditingId] = useState<string | null>(null)
    const [validityDraft, setValidityDraft] = useState<StandardLatestCheckResult | null>(null)
    const [validityReviewDecision, setValidityReviewDecision] = useState<'pending' | 'complete'>('pending')
    const [manualLatestStandardInput, setManualLatestStandardInput] = useState('')
    const [manualLatestStandardIds, setManualLatestStandardIds] = useState<string[]>([])
    const [descriptiveReview, setDescriptiveReview] = useState<DescriptiveReviewState>({
      bzId: '',
      enterpriseName: '',
      decision: 'pending',
      isCompliant: 'pending',
      nonComplianceReasons: [],
      nonComplianceDetail: '',
      reviewConclusion: '',
      updatedAt: '',
    })
    const [summaryDraft, setSummaryDraft] = useState({
      descriptive: '',
      validity: '',
      technical: '',
    })
    const [reportBzId, setReportBzId] = useState('')
    const [reporting, setReporting] = useState(false)
    const [latestUploadedBzId, setLatestUploadedBzId] = useState<string>('')
    const [latestUploadedBzIds, setLatestUploadedBzIds] = useState<string[]>([])
    const [savedMappingIds, setSavedMappingIds] = useState<Set<string>>(new Set())
    const pendingPollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingPollFinishedRef = React.useRef(false)
    const uploadBaselinePendingIdsRef = React.useRef<Set<string>>(new Set())
    const uploadSessionPendingIdsRef = React.useRef<Set<string>>(new Set())
    const uploadBaselineIndexIdsRef = React.useRef<Set<string>>(new Set())
    const hasWarnedUnknownBzIdRef = React.useRef(false)
    const lastAutoDescriptiveRef = React.useRef('')
    const bootstrapRequestIdRef = React.useRef(0)
    const runWizardBootstrapSyncRef = React.useRef<() => Promise<void>>(async () => {})

    useImperativeHandle(ref, () => ({
      scrollIntoView: () => {
        rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
    }))

    const pendingCount = useMemo(
      () =>
        [...referenceRows, ...pendingRows].filter(
          (row) => row.statusText.includes('待审核') || row.statusText.includes('解析'),
        ).length,
      [pendingRows, referenceRows],
    )

    const formatAuditTime = (value: Date) => {
      const pad = (num: number) => String(num).padStart(2, '0')
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(
        value.getMinutes(),
      )}`
    }

    /** 新后端：在 `current_step===2` 时将当前引用表+指标表写入 `POST .../step/2/confirm`；已越过审核 2 时视为已同步 */
    const trySyncEvaluationStep2 = async (refs: PendingIndexItem[], inds: PendingIndexItem[]) => {
      const tid = getComplianceEvaluationTaskId()
      if (tid == null) return false
      try {
        const ev = await getEvaluation(tid)
        if (ev.current_step < 2) return false
        if (ev.current_step > 2) return true
        await confirmEvaluationAuditStep2(tid, {
          references: refs.map((r) => ({
            referenced_std_code: r.standardName?.trim() || null,
            latest_std_code: null,
          })),
          indicator_set: inds.map((r) => ({
            name: r.indicatorName,
            value: r.indicatorValue,
            raw: r,
          })),
        })
        return true
      } catch {
        return false
      }
    }

    const buildDescriptiveConclusion = (state: DescriptiveReviewState) => {
      const bzId = state.bzId.trim() || latestUploadedBzId.trim() || '-'
      const enterpriseName = state.enterpriseName.trim() || '未填写企业名称'
      if (state.isCompliant === 'yes') {
        return `企业标准 ${bzId}（${enterpriseName}）描述性合规评价结论：合规。文本结构与格式基本符合要求，可进入后续技术比对环节。`
      }
      if (state.isCompliant === 'no') {
        const reasonLabels = DESCRIPTIVE_NON_COMPLIANCE_OPTIONS.filter((item) =>
          state.nonComplianceReasons.includes(item.value),
        ).map((item) => item.label)
        const reasonText = reasonLabels.length > 0 ? reasonLabels.join('、') : '未明确不合规项'
        const detailText = state.nonComplianceDetail.trim() || '未补充具体问题描述。'
        return `企业标准 ${bzId}（${enterpriseName}）描述性合规评价结论：不合规。主要问题为：${reasonText}。具体说明：${detailText}`
      }
      return `企业标准 ${bzId}（${enterpriseName}）描述性合规评价暂未完成判定，请补充审核信息。`
    }

    const syncDescriptiveToStepSix = (force: boolean) => {
      const generated = buildDescriptiveConclusion(descriptiveReview)
      const currentText = summaryDraft.descriptive.trim()
      const canAutoWrite = !currentText || currentText === lastAutoDescriptiveRef.current
      if (force || canAutoWrite) {
        setSummaryDraft((prev) => ({ ...prev, descriptive: generated }))
        lastAutoDescriptiveRef.current = generated
      }
    }

    const clearPendingPollTimer = () => {
      if (pendingPollTimerRef.current) {
        clearTimeout(pendingPollTimerRef.current)
        pendingPollTimerRef.current = null
      }
    }

    /** 刷新后保留用户已点的「审核通过/驳回」，避免被接口默认「解析提取（待审核）」覆盖 */
    const mergeAuditStatusPreserve = (
      prev: PendingIndexItem[],
      next: PendingIndexItem[],
      mode: 'reference' | 'enterprise',
    ): PendingIndexItem[] => {
      // 轮询/会话过滤可能得到空数组，不能用空结果覆盖已有数据
      if (next.length === 0) {
        return prev.length > 0 ? prev : next
      }
      if (prev.length === 0) return next
      const keyOf = (r: PendingIndexItem) =>
        mode === 'reference'
          ? r.standardName.trim()
          : `${r.standardName.trim()}\t${r.indicatorName.trim()}\t${r.indicatorValue.trim()}`
      const prevByKey = new Map<string, PendingIndexItem>()
      for (const p of prev) {
        prevByKey.set(keyOf(p), p)
      }
      return next.map((row) => {
        const old = prevByKey.get(keyOf(row))
        if (!old) return row
        if (old.statusText.includes('审核通过') || old.statusText.includes('审核驳回')) {
          return { ...row, statusText: old.statusText }
        }
        return row
      })
    }

    useEffect(() => () => clearPendingPollTimer(), [])

    /** 从后端刷新「可进入的最大向导步」，与 Steps 禁用态、刷新后落点一致 */
    const refreshBackendStepPolicy = async () => {
      const tid = getComplianceEvaluationTaskId()
      if (tid == null) {
        setBackendMaxWizardIndex(0)
        return
      }
      try {
        const ev = await getEvaluation(tid)
        setBackendMaxWizardIndex(backendCurrentStepToMaxWizardIndex(ev.current_step))
      } catch {
        setBackendMaxWizardIndex(0)
      }
    }

    /**
     * 页面刷新 / 首次进入 / `task_id` 晚于组件挂载写入 localStorage：与 `GET evaluations/{id}` 的
     * `current_step` 对齐向导位置与表格数据，避免「停在第 1 步却可点后续步骤、数据仍是旧会话」。
     */
    const runWizardBootstrapSync = async () => {
      const reqId = ++bootstrapRequestIdRef.current
      uploadSessionPendingIdsRef.current = new Set()
      const tid = getComplianceEvaluationTaskId()
      if (tid == null) {
        if (reqId !== bootstrapRequestIdRef.current) return
        setBackendMaxWizardIndex(0)
        setCurrent(0)
        return
      }
      try {
        const ev = await getEvaluation(tid)
        if (reqId !== bootstrapRequestIdRef.current) return
        const maxIdx = backendCurrentStepToMaxWizardIndex(ev.current_step)
        setBackendMaxWizardIndex(maxIdx)
        setCurrent(maxIdx)

        const qb = ev.qb_code?.trim() ?? ''
        if (qb) {
          setLatestUploadedBzId(qb)
          setLatestUploadedBzIds([qb])
          setReportBzId(qb)
          setDescriptiveReview((prev) => ({ ...prev, bzId: prev.bzId.trim() ? prev.bzId : qb }))
        }

        setComparePreview([])
        setOldReferenceIndexRows([])
        setLatestReferenceIndexRows([])
        setMissingOldReferenceFiles([])
        setMissingLatestReferenceFiles([])
        setSavedMappingIds(new Set())
        setLatestStandardRows([])
        setValidityEditingId(null)
        setValidityDraft(null)

        if (ev.current_step >= 4) {
          setValidityReviewDecision('complete')
        } else {
          setValidityReviewDecision('pending')
        }
        if (ev.current_step >= 5) {
          setComparisonAuditPassed(true)
        } else {
          setComparisonAuditPassed(false)
        }

        if (maxIdx >= 2) {
          setLoadingPending(true)
          try {
            const response = await getPendingIndexes()
            if (reqId !== bootstrapRequestIdRef.current) return
            setPendingRows(response.data)
            if ('referenceExtracts' in response) {
              setReferenceRows(response.referenceExtracts ?? [])
            } else {
              setReferenceRows([])
            }
            const refs = 'referenceExtracts' in response ? (response.referenceExtracts ?? []) : []
            const uniq = Array.from(
              new Set(refs.map((r) => r.standardName.trim()).filter((name) => name.length > 0 && name !== '-')),
            )
            if (ev.current_step >= 4 && uniq.length > 0) {
              try {
                const { results } = await checkLatestStandardsBatch(uniq)
                if (reqId !== bootstrapRequestIdRef.current) return
                setLatestStandardRows(results)
              } catch {
                if (reqId !== bootstrapRequestIdRef.current) return
                setLatestStandardRows([])
              }
            }
          } finally {
            if (reqId === bootstrapRequestIdRef.current) setLoadingPending(false)
          }
        } else {
          setPendingRows([])
          setReferenceRows([])
        }
      } catch {
        if (reqId !== bootstrapRequestIdRef.current) return
        setBackendMaxWizardIndex(0)
        setCurrent(0)
        messageApi.warning('无法与后端同步任务进度，已回到第 1 步。请确认评价任务仍有效。')
      }
    }

    runWizardBootstrapSyncRef.current = runWizardBootstrapSync

    useEffect(() => {
      void runWizardBootstrapSyncRef.current()
      const onTaskIdChanged = () => {
        void runWizardBootstrapSyncRef.current()
      }
      window.addEventListener('compliance-evaluation-task-id-changed', onTaskIdChanged)
      return () => {
        bootstrapRequestIdRef.current += 1
        window.removeEventListener('compliance-evaluation-task-id-changed', onTaskIdChanged)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 引导同步仅在挂载与 task_id 变更事件触发
    }, [])

    useEffect(() => {
      onProgressSnapshot?.({
        currentStep: current,
        pendingCount: referenceRows.length + pendingRows.length,
        hasExtractionData: referenceRows.length + pendingRows.length > 0,
      })
    }, [current, pendingRows.length, referenceRows.length, onProgressSnapshot])

    useEffect(() => {
      syncDescriptiveToStepSix(false)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      descriptiveReview.bzId,
      descriptiveReview.enterpriseName,
      descriptiveReview.isCompliant,
      descriptiveReview.nonComplianceReasons.join('|'),
      descriptiveReview.nonComplianceDetail,
      descriptiveReview.reviewConclusion,
    ])

    const refreshPending = async (options?: {
      silent?: boolean
      onlyNewAfterUpload?: boolean
      sessionOnly?: boolean
    }) => {
      try {
        setLoadingPending(true)
        const response = await getPendingIndexes()
        const allRows = response.data
        const baseRows =
          options?.onlyNewAfterUpload
            ? allRows.filter((row) => !uploadBaselinePendingIdsRef.current.has(String(row.id)))
            : allRows
        if (options?.sessionOnly) {
          if (uploadSessionPendingIdsRef.current.size === 0) {
            uploadSessionPendingIdsRef.current = new Set(baseRows.map((row) => String(row.id)))
          }
        }
        let rows =
          options?.sessionOnly && uploadSessionPendingIdsRef.current.size > 0
            ? baseRows.filter((row) => uploadSessionPendingIdsRef.current.has(String(row.id)))
            : baseRows
        // 上传会话里的 id（如 parse-*）与 GET step/2 返回的新 id（s2-ind-*）不一致时，会话过滤会把表滤空，此时展示全量后端数据
        if (rows.length === 0 && baseRows.length > 0) {
          rows = baseRows
        }
        // onlyNewAfterUpload 若误杀全部行，再回退到未过滤的接口结果
        if (rows.length === 0 && allRows.length > 0) {
          rows = allRows
        }
        setPendingRows((prev) => mergeAuditStatusPreserve(prev, rows, 'enterprise'))
        if ('referenceExtracts' in response) {
          setReferenceRows((prev) =>
            mergeAuditStatusPreserve(prev, response.referenceExtracts ?? [], 'reference'),
          )
        }
        if (!options?.silent) {
          messageApi.success(`已刷新提取结果，共 ${rows.length} 条`)
        }
        return rows
      } catch (error) {
        const text = error instanceof Error ? error.message : '刷新提取结果失败'
        messageApi.error(text)
        return []
      } finally {
        setLoadingPending(false)
      }
    }

    /** 进入「规范性引用与企标指标提取审核」步骤时，拉取 GET .../step/2 展示 suggested_references + indicators */
    useEffect(() => {
      if (current !== 2) return
      let cancelled = false
      void (async () => {
        try {
          setLoadingPending(true)
          const response = await getPendingIndexes()
          if (cancelled) return
          clearPendingPollTimer()
          pendingPollFinishedRef.current = true
          setPendingRows((prev) => mergeAuditStatusPreserve(prev, response.data, 'enterprise'))
          if ('referenceExtracts' in response) {
            setReferenceRows((prev) =>
              mergeAuditStatusPreserve(prev, response.referenceExtracts ?? [], 'reference'),
            )
          }
        } catch (e) {
          if (!cancelled) {
            messageApi.error(e instanceof Error ? e.message : '加载审核2数据失败')
          }
        } finally {
          if (!cancelled) setLoadingPending(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }, [current, messageApi])

    const parseFileName = (contentDisposition?: string) => {
      if (!contentDisposition) {
        return `compliance-report-${Date.now()}.xlsx`
      }
      const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
      if (utf8Match?.[1]) {
        return decodeURIComponent(utf8Match[1])
      }
      const asciiMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
      return asciiMatch?.[1] ?? `compliance-report-${Date.now()}.xlsx`
    }

    const onExportReport = async () => {
      const targetBzId = reportBzId.trim() || latestUploadedBzId.trim()
      if (!targetBzId) {
        messageApi.warning('请填写标准号（bz_id）后再导出报告。')
        return
      }
      try {
        setReporting(true)
        const response = await exportComplianceReport(targetBzId)
        const blob = new Blob([response.data], {
          type: response.headers['content-type'] || 'application/octet-stream',
        })
        const fileName = parseFileName(response.headers['content-disposition'])
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
        messageApi.success('报告导出成功')
      } catch (error) {
        const text = error instanceof Error ? error.message : '报告导出失败'
        messageApi.error(text)
      } finally {
        setReporting(false)
      }
    }

    const loadExtractedFromIndexesTable = async () => {
      const storedBzIdsRaw = localStorage.getItem('compliance-latest-upload-bzids') ?? ''
      const storedBzIds = storedBzIdsRaw
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)
      const scopedBzIds = latestUploadedBzIds.length > 0 ? latestUploadedBzIds : storedBzIds

      if (scopedBzIds.length > 0 && latestUploadedBzIds.length === 0) {
        setLatestUploadedBzIds(scopedBzIds)
      }
      if (!latestUploadedBzId && scopedBzIds[0]) {
        setLatestUploadedBzId(scopedBzIds[0])
      }

      let rows = [] as Awaited<ReturnType<typeof getNationalIndexes>>['data']
      if (scopedBzIds.length > 0) {
        const responses = await Promise.all(scopedBzIds.map(async (bzId) => getNationalIndexes({ bz_id: bzId })))
        const merged = responses.flatMap((response) => response.data)
        const uniqueById = new Map<string, (typeof merged)[number]>()
        merged.forEach((row) => uniqueById.set(String(row.id), row))
        rows = Array.from(uniqueById.values())
      } else {
        const response = await getNationalIndexes()
        rows = response.data.filter((row) => !uploadBaselineIndexIdsRef.current.has(String(row.id)))
      }

      if (rows.length === 0) {
        if (scopedBzIds.length === 0 && !hasWarnedUnknownBzIdRef.current) {
          messageApi.info('已自动按本次上传前后增量回填指标结果。')
          hasWarnedUnknownBzIdRef.current = true
        }
        return []
      }

      const mapped: PendingIndexItem[] = rows.map((item, idx) => ({
        id: item.id || `idx-fallback-${idx + 1}`,
        standardName: item.standardId || latestUploadedBzId || '-',
        indicatorName: item.indexName,
        indicatorValue: item.indexValue,
        statusText: '来自指标库（待人工确认）',
      }))

      setPendingRows(mapped)
      return mapped
    }

    const pollPendingAfterUpload = (attempt = 0) => {
      clearPendingPollTimer()
      if (attempt >= 24) {
        if (!pendingPollFinishedRef.current) {
          messageApi.warning('解析任务仍在进行中，请稍后点击“刷新提取结果”查看最新数据。')
        }
        return
      }

      pendingPollTimerRef.current = setTimeout(() => {
        void (async () => {
          const rows = await refreshPending({ silent: true, onlyNewAfterUpload: true, sessionOnly: true })
          if (rows.length > 0) {
            if (!pendingPollFinishedRef.current) {
              messageApi.success(`解析完成，已提取 ${rows.length} 条结果，可进行人工审核。`)
              pendingPollFinishedRef.current = true
            }
            clearPendingPollTimer()
            return
          }

          const fallbackRows = await loadExtractedFromIndexesTable()
          if (fallbackRows.length > 0) {
            if (!pendingPollFinishedRef.current) {
              messageApi.success(`解析完成，已从指标库回填 ${fallbackRows.length} 条提取结果。`)
              pendingPollFinishedRef.current = true
            }
            clearPendingPollTimer()
            return
          }
          pollPendingAfterUpload(attempt + 1)
        })()
      }, 5000)
    }

    const runUpload = async () => {
      const selectedFiles = fileList
        .map((item) => item.originFileObj)
        .filter(Boolean) as File[]
      if (selectedFiles.length === 0) {
        messageApi.warning('请先上传标准文档')
        return
      }
      try {
        setUploading(true)
        pendingPollFinishedRef.current = false
        uploadSessionPendingIdsRef.current = new Set()
        hasWarnedUnknownBzIdRef.current = false
        // 记录上传前待审核集合，上传后只展示新增结果，避免串历史数据
        try {
          const beforePending = await getPendingIndexes()
          uploadBaselinePendingIdsRef.current = new Set(beforePending.data.map((item) => String(item.id)))
        } catch {
          uploadBaselinePendingIdsRef.current = new Set()
        }
        try {
          const beforeIndexes = await getNationalIndexes()
          uploadBaselineIndexIdsRef.current = new Set(beforeIndexes.data.map((item) => String(item.id)))
        } catch {
          uploadBaselineIndexIdsRef.current = new Set()
        }

        const uploadResults = await Promise.allSettled(
          selectedFiles.map(async (targetFile) => {
            const [referencesResult, indexesResult] = await Promise.allSettled([
              uploadEnterpriseStandard(targetFile),
              postInsertIndexes(targetFile),
            ])
            if (referencesResult.status === 'rejected') {
              throw referencesResult.reason
            }
            const referencesError = getUploadResultError(referencesResult.value?.data)
            if (referencesError) {
              throw new Error(`文件「${targetFile.name}」规范性引用入库失败：${referencesError}`)
            }
            if (indexesResult.status === 'fulfilled') {
              const indexesError = getUploadResultError(indexesResult.value?.data)
              if (indexesError) {
                throw new Error(`文件「${targetFile.name}」指标入库失败：${indexesError}`)
              }
            }
            return {
              fileName: targetFile.name,
              references: referencesResult.value?.data as unknown,
              indexes:
                indexesResult.status === 'fulfilled' ? (indexesResult.value?.data as unknown) : undefined,
              indexesFailed: indexesResult.status === 'rejected',
            }
          }),
        )
        const successfulUploads = uploadResults.filter(
          (result): result is PromiseFulfilledResult<{
            fileName: string
            references: unknown
            indexes: unknown
            indexesFailed: boolean
          }> => result.status === 'fulfilled',
        )
        const failedUploads = uploadResults.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        )
        if (successfulUploads.length === 0) {
          throw failedUploads[0]?.reason ?? new Error('上传失败')
        }
        const uploadData = {
          references: successfulUploads.map((item) => item.value.references),
          indexes: successfulUploads.map((item) => item.value.indexes),
        } as Record<string, unknown>
        const descriptiveInfo = extractDescriptiveInfoFromPayload(uploadData)
        const extractedReferences = extractReferenceCodeRowsFromUploadPayload(uploadData)
        setReferenceRows(extractedReferences)
        const extractedBzIds = extractBzIdsFromPayload(uploadData)
        if (extractedBzIds.length > 0) {
          setLatestUploadedBzIds(extractedBzIds)
          setLatestUploadedBzId(extractedBzIds[0])
          setReportBzId(extractedBzIds[0])
          localStorage.setItem('compliance-latest-upload-bzid', extractedBzIds[0])
          localStorage.setItem('compliance-latest-upload-bzids', extractedBzIds.join('|'))
        } else {
          setLatestUploadedBzIds([])
          localStorage.removeItem('compliance-latest-upload-bzids')
        }
        const descriptiveBzId = descriptiveInfo.bzId || extractedBzIds[0] || ''
        setDescriptiveReview((prev) => ({
          bzId: descriptiveBzId || prev.bzId,
          enterpriseName: descriptiveInfo.enterpriseName || prev.enterpriseName,
          decision: 'pending',
          isCompliant: 'pending',
          nonComplianceReasons: [],
          nonComplianceDetail: '',
          reviewConclusion: '',
          updatedAt: '',
        }))
        if (!summaryDraft.descriptive.trim()) {
          const initialDescription = [
            descriptiveBzId ? `企标号：${descriptiveBzId}` : '',
            descriptiveInfo.enterpriseName ? `企业名称：${descriptiveInfo.enterpriseName}` : '',
          ]
            .filter(Boolean)
            .join('；')
          if (initialDescription) {
            setSummaryDraft((prev) => ({ ...prev, descriptive: initialDescription }))
          }
        }
        const indexesFailedCount = successfulUploads.filter((item) => item.value.indexesFailed).length
        if (indexesFailedCount > 0) {
          messageApi.warning(`${indexesFailedCount} 个文件的指标入库失败，请让后端检查 batch-indexes 接口日志。`)
        }

        const immediateRows = extractPendingRowsFromUploadPayload(uploadData)
        if (immediateRows.length > 0) {
          const ownSet = new Set(extractedBzIds.map((item) => item.trim()))
          if (ownSet.size > 0) {
            setPendingRows(immediateRows.filter((row) => ownSet.has(row.standardName.trim())))
          } else {
            setPendingRows(immediateRows)
          }
        }
        if (failedUploads.length > 0) {
          messageApi.warning(
            `共提交 ${selectedFiles.length} 个文件，成功 ${successfulUploads.length} 个，失败 ${failedUploads.length} 个。`,
          )
        } else {
          messageApi.success(`已提交 ${successfulUploads.length} 个文件，后端正在异步解析。`)
        }
        const tidPoll = getComplianceEvaluationTaskId()
        if (tidPoll != null) {
          const settled = await pollComplianceEvaluationUntilParseSettled(tidPoll)
          if (settled.parse_status === 'failed') {
            messageApi.warning(`企标解析失败：${settled.parse_error ?? '请检查上传文件或后端日志'}`)
          }
        }
        afterUploadSuccess?.()
        setCurrent(1)
        void refreshBackendStepPolicy()
        await refreshPending({ silent: true, onlyNewAfterUpload: true, sessionOnly: true })
        pollPendingAfterUpload()
      } catch (error) {
        const text = error instanceof Error ? error.message : '上传失败'
        messageApi.error(text)
      } finally {
        setUploading(false)
      }
    }

    /**
     * 是否允许单条审核/行内编辑。
     * 旧版 `audit/pending_indexes` 使用数字字符串主键，故曾用 `Number.isFinite(Number(id))` 判断。
     * 新后端适配数据使用稳定字符串主键（如 `parse-*`、`s2-ind-*`、`upload-auto-*`），与 `POST .../step/2/confirm` 整表同步一致，只需非空 id 即可。
     */
    const canAudit = (item: PendingIndexItem) => {
      const id = String(item.id ?? '').trim()
      return id.length > 0
    }

    const submitSingleAudit = async (item: PendingIndexItem, action: 'approve' | 'reject') => {
      if (!canAudit(item)) {
        messageApi.warning('该记录缺少可用ID，暂不可审核')
        return
      }
      try {
        setAuditingId(item.id)
        await submitAuditDecision(item.id, action)
        const synced = await trySyncEvaluationStep2(referenceRows, pendingRows)
        const nextStatusText = action === 'approve' ? '审核通过' : '审核驳回'
        setPendingRows((prev) => prev.map((row) => (row.id === item.id ? { ...row, statusText: nextStatusText } : row)))
        setReferenceRows((prev) =>
          prev.map((row) => (row.id === item.id ? { ...row, statusText: nextStatusText } : row)),
        )
        if (synced) {
          messageApi.success(action === 'approve' ? '已通过该记录' : '已驳回该记录')
          await refreshPending({ sessionOnly: true })
        } else {
          messageApi.success(action === 'approve' ? '已通过该记录（本地）' : '已驳回该记录（本地）')
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : '审核失败'
        messageApi.error(text)
      } finally {
        setAuditingId(null)
      }
    }

    const submitBulkAudit = async (action: 'approve' | 'reject') => {
      const ids = pendingRows.filter(canAudit).map((item) => item.id)
      if (ids.length === 0) {
        messageApi.warning('没有可批量审核的数据')
        return
      }
      try {
        setBulkAction(action)
        await submitAuditBulkDecision(ids, action)
        const synced = await trySyncEvaluationStep2(referenceRows, pendingRows)
        const nextStatusText = action === 'approve' ? '审核通过' : '审核驳回'
        const idSet = new Set(ids)
        setPendingRows((prev) =>
          prev.map((row) => (idSet.has(row.id) ? { ...row, statusText: nextStatusText } : row)),
        )
        if (synced) {
          messageApi.success(action === 'approve' ? `已一键通过 ${ids.length} 条` : `已一键驳回 ${ids.length} 条`)
          await refreshPending({ sessionOnly: true })
        } else {
          messageApi.success(action === 'approve' ? `已一键通过 ${ids.length} 条（本地）` : `已一键驳回 ${ids.length} 条（本地）`)
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : '批量审核失败'
        messageApi.error(text)
      } finally {
        setBulkAction(null)
      }
    }

    const submitReferenceBulkAudit = async (action: 'approve' | 'reject') => {
      const ids = referenceRows.filter(canAudit).map((item) => item.id)
      if (ids.length === 0) {
        messageApi.warning('没有可批量审核的规范性引用指标数据')
        return
      }
      try {
        setReferenceBulkAction(action)
        await submitAuditBulkDecision(ids, action)
        const synced = await trySyncEvaluationStep2(referenceRows, pendingRows)
        const nextStatusText = action === 'approve' ? '审核通过' : '审核驳回'
        const idSet = new Set(ids)
        setReferenceRows((prev) =>
          prev.map((row) => (idSet.has(row.id) ? { ...row, statusText: nextStatusText } : row)),
        )
        if (synced) {
          messageApi.success(action === 'approve' ? `已一键通过 ${ids.length} 条` : `已一键驳回 ${ids.length} 条`)
          await refreshPending({ sessionOnly: true })
        } else {
          messageApi.success(action === 'approve' ? `已一键通过 ${ids.length} 条（本地）` : `已一键驳回 ${ids.length} 条（本地）`)
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : '批量审核失败'
        messageApi.error(text)
      } finally {
        setReferenceBulkAction(null)
      }
    }

    const startInlineEdit = (item: PendingIndexItem) => {
      if (!canAudit(item)) {
        messageApi.warning('该记录缺少可用ID，暂不可编辑提交。')
        return
      }
      setEditingRowId(item.id)
      setEditingDraft({
        standardName: item.standardName,
        indicatorName: item.indicatorName,
        indicatorValue: item.indicatorValue,
      })
    }

    const cancelInlineEdit = () => {
      setEditingRowId(null)
      setEditingDraft({
        standardName: '',
        indicatorName: '',
        indicatorValue: '',
      })
    }

    const saveInlineEdit = async (item: PendingIndexItem) => {
      if (editingRowId !== item.id) return
      try {
        if (!editingDraft.indicatorName.trim() || !editingDraft.indicatorValue.trim()) {
          messageApi.warning('请完整填写指标名称和指标值后再保存。')
          return
        }
        setEditSaving(true)
        const applyEdit = (row: PendingIndexItem) =>
          row.id === item.id
            ? {
                ...row,
                standardName: editingDraft.standardName.trim() || row.standardName,
                indicatorName: editingDraft.indicatorName.trim(),
                indicatorValue: editingDraft.indicatorValue.trim(),
                statusText: '审核通过',
              }
            : row
        const nextPending = pendingRows.map(applyEdit)
        const nextRef = referenceRows.map(applyEdit)
        setPendingRows(nextPending)
        setReferenceRows(nextRef)
        cancelInlineEdit()
        const synced = await trySyncEvaluationStep2(nextRef, nextPending)
        if (synced) {
          messageApi.success('已提交人工修正并通过审核')
          await refreshPending({ sessionOnly: true })
        } else {
          messageApi.success('已提交人工修正（本地），进入审核2后将同步到后端')
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : '提交修正失败'
        messageApi.error(text)
      } finally {
        setEditSaving(false)
      }
    }

    const runReferenceValidityCheck = async () => {
      const uniqueIds = Array.from(
        new Set(
          referenceRows
            .map((item) => item.standardName)
            .map((name) => name.trim())
            .filter((name) => name.length > 0 && name !== '-'),
        ),
      )
      if (uniqueIds.length === 0) {
        messageApi.warning('暂无可校验的引用标准编号，请先完成提取。')
        return
      }
      try {
        setValidityLoading(true)
        setSavedMappingIds(new Set())
        const { results, file_compliance_outcome } = await checkLatestStandardsBatch(uniqueIds)
        setLatestStandardRows(results)
        setValidityReviewDecision('pending')
        setManualLatestStandardIds([])
        setManualLatestStandardInput('')
        const outdatedCount = results.filter((item) => isRowCitationAutoOutdated(item)).length
        const taskHint =
          file_compliance_outcome != null
            ? `（整文件：${fileComplianceOutcomeLabel(file_compliance_outcome)}）`
            : ''
        messageApi.success(
          outdatedCount > 0
            ? `校验完成，发现 ${outdatedCount} 条可自动比对且与现行主号不一致${taskHint}`
            : `校验完成，其中自动判定与现行主号一致 ${results.filter((item) => isRowCitationAutoLatest(item)).length} 条${taskHint}`,
        )
      } finally {
        setValidityLoading(false)
      }
    }

    const startEditValidityRow = (row: StandardLatestCheckResult) => {
      setValidityEditingId(row.queryBzId)
      setValidityDraft({ ...row })
    }

    const cancelEditValidityRow = () => {
      setValidityEditingId(null)
      setValidityDraft(null)
    }

    const saveValidityRow = () => {
      if (!validityEditingId || !validityDraft) return
      if (!validityDraft.queryBzId.trim() || !validityDraft.currentLatestId.trim()) {
        messageApi.warning('请至少填写“引用标准”和“最新标准”。')
        return
      }
      const nextRows = latestStandardRows.map((row) =>
        row.queryBzId === validityEditingId ? { ...validityDraft } : row,
      )
      setLatestStandardRows(nextRows)
      cancelEditValidityRow()
      setValidityReviewDecision('pending')
      setSummaryDraft((prev) => ({
        ...prev,
        validity: `共核验 ${nextRows.length} 条引用标准（人工补录后），其中自动判定需更新 ${nextRows.filter((item) => isRowCitationAutoOutdated(item)).length} 条。`,
      }))
      messageApi.success('已保存该条引用标准有效性记录。')
    }

    const removeValidityRow = (queryBzId: string) => {
      const nextRows = latestStandardRows.filter((row) => row.queryBzId !== queryBzId)
      setLatestStandardRows(nextRows)
      setSavedMappingIds((prev) => {
        const next = new Set(prev)
        next.delete(queryBzId)
        return next
      })
      setValidityReviewDecision('pending')
      messageApi.success('已删除该条记录。')
    }

    const addManualLatestStandard = async () => {
      const latestId = manualLatestStandardInput.trim()
      if (!latestId) {
        messageApi.warning('请先输入最新标准编号。')
        return
      }
      const existsInManual = manualLatestStandardIds.some((item) => item === latestId)
      const existsInAuto = latestStandardRows.some((item) => item.currentLatestId.trim() === latestId)
      if (existsInManual || existsInAuto) {
        messageApi.warning('该最新标准编号已存在，无需重复新增。')
        return
      }
      try {
        setValidityLoading(true)
        const response = await getNationalIndexes({ bz_id: latestId })
        if (response.data.length === 0) {
          messageApi.warning('数据库中未找到该最新标准编号的指标，请先确认该标准已入库。')
          return
        }
        setManualLatestStandardIds((prev) => [...prev, latestId])
        setManualLatestStandardInput('')
        setValidityReviewDecision('pending')
        setSummaryDraft((prev) => ({
          ...prev,
          validity: `已新增最新标准编号 ${latestId} 并纳入比对库，可在下一步指标对比中直接检索其指标。`,
        }))
        messageApi.success(`已新增最新标准编号：${latestId}，下一步将参与指标对比。`)
      } catch (error) {
        const text = error instanceof Error ? error.message : '新增最新标准失败'
        messageApi.error(text)
      } finally {
        setValidityLoading(false)
      }
    }

    const submitValidityManualReview = async () => {
      if (latestStandardRows.length === 0) {
        messageApi.warning('请先生成或补录引用标准有效性数据。')
        return
      }
      const invalidRow = latestStandardRows.find(
        (row) => !row.queryBzId.trim() || !row.currentLatestId.trim(),
      )
      if (invalidRow) {
        messageApi.warning(`存在未填写完整的行（${invalidRow.queryBzId || '未命名行'}），请先补全。`)
        return
      }
      try {
        setValidityLoading(true)
        const tid = getComplianceEvaluationTaskId()
        if (tid == null) {
          messageApi.error('缺少评价任务上下文，无法提交审核 3')
          return
        }
        const settled = await Promise.allSettled(
          latestStandardRows.map(async (row) =>
            saveReferenceMapping({
              enterprise_bz_id: row.queryBzId.trim(),
              national_bz_id: row.currentLatestId.trim(),
            }),
          ),
        )
        const failed = settled
          .map((result, index) => ({ result, row: latestStandardRows[index] }))
          .filter((item) => item.result.status === 'rejected')
        if (failed.length > 0) {
          messageApi.error(
            `映射入库失败 ${failed.length} 条（示例：${failed[0]?.row.queryBzId}），请检查后重试。`,
          )
          return
        }
        await confirmEvaluationAuditStep3(tid, {
          rows: latestStandardRows.map((row) => ({
            referenced_std_code: row.queryBzId.trim(),
            latest_std_code: row.currentLatestId.trim(),
            manual_review_status: row.isLatest ? 'approved' : 'needs_update',
            is_latest: row.isLatest,
            pedigree_chain: row.pedigreeChain.trim() || null,
          })),
        })
        setSavedMappingIds(new Set(latestStandardRows.map((row) => row.queryBzId)))
      } catch (error) {
        const text = error instanceof Error ? error.message : '批量映射入库失败'
        messageApi.error(text)
        return
      } finally {
        setValidityLoading(false)
      }
      setValidityReviewDecision('complete')
      const unresolvedSubmit = latestStandardRows.filter(
        (r) => r.resolutionPath === 'unresolved_no_historical_row',
      ).length
      setSummaryDraft((prev) => ({
        ...prev,
        validity: `引用标准有效性与更替已完成人工审核，共 ${latestStandardRows.length} 条，数据完整并已同步映射入库${
          unresolvedSubmit > 0 ? `（含 ${unresolvedSubmit} 条国标历史未命中项，已在表格中标注）` : ''
        }。`,
      }))
      messageApi.success('已人工审核并提交审核 3（含映射与确认），后端已推进至步骤 4。')
      void refreshBackendStepPolicy()
    }

    const submitDescriptiveReview = async (decision: 'approve' | 'reject') => {
      const bzId = descriptiveReview.bzId.trim()
      const enterpriseName = descriptiveReview.enterpriseName.trim()
      const autoGeneratedConclusion = buildDescriptiveConclusion(descriptiveReview)
      const reviewConclusion =
        descriptiveReview.reviewConclusion.trim() ||
        (descriptiveReview.isCompliant === 'yes' ? autoGeneratedConclusion : '')
      if (!bzId || !enterpriseName) {
        messageApi.warning('请先完整填写企标号和企业名称。')
        return
      }
      if (!reviewConclusion) {
        messageApi.warning('请先填写描述性评价结论。')
        return
      }
      if (decision === 'approve' && descriptiveReview.isCompliant !== 'yes') {
        messageApi.warning('点击通过前，请先将“是否合规”选择为“合规”。')
        return
      }
      if (decision === 'reject') {
        if (descriptiveReview.isCompliant !== 'no') {
          messageApi.warning('点击驳回前，请先将“是否合规”选择为“不合规”。')
          return
        }
        if (descriptiveReview.nonComplianceReasons.length === 0) {
          messageApi.warning('请至少选择一项不合规原因。')
          return
        }
        if (descriptiveReview.nonComplianceDetail.trim().length < 8) {
          messageApi.warning('请补充不少于8个字的不合规说明。')
          return
        }
      }
      if (decision === 'approve') {
        const tid = getComplianceEvaluationTaskId()
        if (tid != null) {
          try {
            const snapshot = await getEvaluation(tid)
            if (snapshot.parse_status !== 'completed') {
              messageApi.warning(
                `企标解析尚未成功完成（当前：${snapshot.parse_status}），请先等待解析结束后再提交审核 1。`,
              )
              return
            }
            await confirmEvaluationAuditStep1(tid, {
              qb_code: bzId,
              company_name: enterpriseName || null,
              qb_name: null,
            })
          } catch (error) {
            messageApi.error(getComplianceApiErrorMessage(error))
            return
          }
        }
      }
      const auditTime = formatAuditTime(new Date())
      setDescriptiveReview((prev) => ({
        ...prev,
        decision,
        updatedAt: auditTime,
        reviewConclusion: reviewConclusion || prev.reviewConclusion,
      }))
      syncDescriptiveToStepSix(true)
      void refreshBackendStepPolicy()
      messageApi.success(decision === 'approve' ? '描述性评价已通过第一次人工审核' : '描述性评价已驳回，请修改后再审核')
    }

    /** 离开审核 2 前强制同步 `POST .../step/2/confirm`，避免后端仍停留在步骤 2 却已进入审核 3 界面 */
    const goToNextWizardStep = async () => {
      if (current >= WIZARD_STEP_TITLES.length - 1) return
      setWizardNextLoading(true)
      try {
        if (current === 2) {
          const tid = getComplianceEvaluationTaskId()
          if (tid != null) {
            try {
              const ev = await getEvaluation(tid)
              if (ev.current_step < 2) {
                messageApi.warning('请先在「描述性合规评价」完成审核 1 并通过，将任务推进到审核 2。')
                return
              }
              if (ev.current_step === 2) {
                const synced = await trySyncEvaluationStep2(referenceRows, pendingRows)
                if (!synced) {
                  messageApi.error(
                    '提交审核 2 失败：请确认后端为 MySQL、网络正常，且引用与指标数据有效后重试。',
                  )
                  return
                }
              }
            } catch (error) {
              messageApi.error(getComplianceApiErrorMessage(error))
              return
            }
          }
        }
        if (current === 3) {
          const tid = getComplianceEvaluationTaskId()
          if (tid != null) {
            try {
              const ev = await getEvaluation(tid)
              if (ev.current_step < 4) {
                messageApi.warning(
                  '请先在本页点击「人工审核数据完整并导入映射」，成功提交审核 3 后再进入技术指标对比。',
                )
                return
              }
            } catch (error) {
              messageApi.error(getComplianceApiErrorMessage(error))
              return
            }
          }
        }
        if (current === 4) {
          const tid = getComplianceEvaluationTaskId()
          if (tid != null) {
            try {
              const ev = await getEvaluation(tid)
              if (ev.current_step === 4) {
                if (!comparisonAuditPassed) {
                  messageApi.warning('请先完成「技术指标对比」的人工审核确认，再进入总结步骤。')
                  return
                }
                await confirmEvaluationAuditStep4(tid)
              }
            } catch (error) {
              messageApi.error(getComplianceApiErrorMessage(error))
              return
            }
          }
        }
        setCurrent((prev) => Math.min(WIZARD_STEP_TITLES.length - 1, prev + 1))
        void refreshBackendStepPolicy()
      } finally {
        setWizardNextLoading(false)
      }
    }

    /** 顶部 Steps 与后端 `current_step` 对齐，禁止未 confirm 即跳步（接入流程指南 §1.1） */
    const onWizardStepsChange = async (next: number): Promise<boolean> => {
      const tid = getComplianceEvaluationTaskId()
      if (tid == null) {
        if (next > 0) {
          messageApi.warning('请先完成上传以创建并绑定评价任务。')
          return false
        }
        setBackendMaxWizardIndex(0)
        setCurrent(0)
        return true
      }
      try {
        const ev = await getEvaluation(tid)
        const maxIdx = backendCurrentStepToMaxWizardIndex(ev.current_step)
        setBackendMaxWizardIndex(maxIdx)
        if (next > maxIdx) {
          messageApi.warning(
            `后端当前为步骤 ${ev.current_step}，无法跳转到第 ${next + 1} 步。请先完成前置确认（以服务端 current_step 为准）。`,
          )
          return false
        }
        setCurrent(next)
        return true
      } catch (error) {
        messageApi.error(getComplianceApiErrorMessage(error))
        return false
      }
    }

    const startEditComparisonRow = (row: ComparePreviewRow) => {
      setComparisonEditingId(row.id)
      setComparisonDraft({ ...row })
    }

    const cancelEditComparisonRow = () => {
      setComparisonEditingId(null)
      setComparisonDraft(null)
    }

    const saveComparisonRow = () => {
      if (!comparisonDraft || !comparisonEditingId) return
      if (!comparisonDraft.indicatorName.trim()) {
        messageApi.warning('指标名称不能为空')
        return
      }
      const mergedDraft = {
        ...comparisonDraft,
        ...buildComparisonResult(
          comparisonDraft.indicatorName.trim(),
          comparisonDraft.enterpriseValue.trim(),
          latestReferenceIndexRows,
        ),
      }
      setComparePreview((prev) => prev.map((row) => (row.id === comparisonEditingId ? mergedDraft : row)))
      cancelEditComparisonRow()
      messageApi.success('已保存技术对比行')
    }

    const removeComparisonRow = (id: string) => {
      setComparePreview((prev) => prev.filter((row) => row.id !== id))
    }

    const addComparisonRow = () => {
      const id = `manual-${Date.now()}`
      const row: ComparePreviewRow = {
        id,
        indicatorName: '',
        enterpriseValue: '',
        matchedStandard: '-',
        nationalValue: '待确认',
        status: '待匹配（请填写后保存）',
        source: 'manual',
        baselineStandard: '-',
        latestStandard: '请填写后保存',
      }
      setComparePreview((prev) => [row, ...prev])
      startEditComparisonRow(row)
    }

    const approveComparisonResult = () => {
      setComparisonAuditPassed(true)
      const pendingRows = comparePreview.filter(
        (row) =>
          row.status.includes('待') ||
          row.status.includes('未在国标指标库中找到') ||
          row.status.includes('未找到'),
      )
      if (pendingRows.length > 0) {
        messageApi.warning('仍有未匹配/待补充项，请确认后再作为最终结果。')
        return
      }
      setSummaryDraft((prev) => ({
        ...prev,
        technical:
          prev.technical.trim() ||
          `技术指标对比完成，共 ${comparePreview.length} 条，人工审核通过。`,
      }))
      messageApi.success('技术指标对比已人工审核通过')
    }

    const buildComparePreview = async (options?: { diagnosticsOnly?: boolean }) => {
      const diagnosticsOnly = options?.diagnosticsOnly === true
      const referenceCodes = Array.from(
        new Set(referenceRows.map((item) => item.standardName.trim()).filter((item) => item && item !== '-')),
      )
      if (referenceCodes.length === 0) {
        if (!diagnosticsOnly) {
          messageApi.warning('缺少规范性引用文件编号，无法构建技术对比。')
        }
        return
      }

      try {
        setComparisonLoading(true)
        if (!diagnosticsOnly) {
          setComparisonAuditPassed(false)
        }

        const [oldResponses, latestBatch] = await Promise.all([
          Promise.all(
            referenceCodes.map(async (code) => {
              try {
                return await getNationalIndexes({ bz_id: code })
              } catch {
                return { data: [] as NationalIndexItem[] }
              }
            }),
          ),
          checkLatestStandardsBatch(referenceCodes),
        ])
        const latestChecks = latestBatch.results

        const oldRows = oldResponses.flatMap((response) => response.data)
        setOldReferenceIndexRows(oldRows)
        const missingOldFiles = referenceCodes.filter((_code, index) => (oldResponses[index]?.data?.length ?? 0) === 0)
        setMissingOldReferenceFiles(missingOldFiles)

        const latestIds = Array.from(
          new Set([
            ...latestChecks.map((item) => item.currentLatestId.trim()).filter((item) => item && item !== '-'),
            ...manualLatestStandardIds,
          ]),
        )
        const latestResponses = await Promise.all(
          latestIds.map(async (id) => {
            try {
              return await getNationalIndexes({ bz_id: id })
            } catch {
              return { data: [] as NationalIndexItem[] }
            }
          }),
        )
        const latestRows = latestResponses.flatMap((response) => response.data)
        setLatestReferenceIndexRows(latestRows)
        const missingLatestFiles = latestIds.filter((_code, index) => (latestResponses[index]?.data?.length ?? 0) === 0)
        setMissingLatestReferenceFiles(missingLatestFiles)

        if (diagnosticsOnly) {
          return
        }

        const enterpriseRows = pendingRows.map((item, idx) => ({
          id: item.id || `enterprise-${idx}`,
          standardId: item.standardName || latestUploadedBzId || '-',
          indexName: item.indicatorName,
          indexValue: item.indicatorValue,
        }))
        const oldBaselineRows = [...oldRows, ...enterpriseRows]

        const previewRows: ComparePreviewRow[] = oldBaselineRows.map((item, idx) => {
          const comparison = buildComparisonResult(item.indexName, item.indexValue, latestRows)
          return {
            id: item.id || `compare-${idx + 1}`,
            indicatorName: item.indexName,
            enterpriseValue: item.indexValue,
            matchedStandard: comparison.matchedStandard,
            nationalValue: comparison.nationalValue,
            status: comparison.status,
            source: 'enterprise_or_old',
            baselineStandard: item.standardId,
            latestStandard: comparison.latestStandard,
          }
        })

        setComparePreview(previewRows)
        setSummaryDraft((prev) => ({
          ...prev,
          technical:
            prev.technical.trim() ||
            `旧基线 ${oldBaselineRows.length} 条（旧引用 ${oldRows.length} + 企标 ${enterpriseRows.length}），最新基线 ${latestRows.length} 条。`,
        }))
        messageApi.success(
          `对比构建完成：旧基线 ${oldBaselineRows.length} 条，最新基线 ${latestRows.length} 条，缺失文件 ${
            missingLatestFiles.length + missingOldFiles.length
          } 个。`,
        )
      } finally {
        setComparisonLoading(false)
      }
    }

    /** 进入「指标映射与技术对比」步后：立即拉取编排缺件 + 引用侧诊断，避免左上角卡牌长时间为 0 */
    useEffect(() => {
      if (current !== 4) {
        setStep4BackendMissingGb([])
        return
      }
      let cancelled = false
      void (async () => {
        const tid = getComplianceEvaluationTaskId()
        if (tid == null) return
        try {
          const ev = await getEvaluation(tid)
          if (cancelled || ev.current_step < 4) return
          const s4 = await getStep4Indicators(tid)
          if (cancelled) return
          setStep4BackendMissingGb(s4.missing_gb_files ?? [])
        } catch {
          if (!cancelled) setStep4BackendMissingGb([])
        }
      })()
      return () => {
        cancelled = true
      }
    }, [current])

    useEffect(() => {
      if (current !== 4) return
      if (referenceRows.length === 0) return
      void buildComparePreview({ diagnosticsOnly: true })
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在进入本步或引用行数量变化时刷新诊断数字，避免依赖整个 buildComparePreview
    }, [current, referenceRows.length])

    const uploadRepairReferenceFiles = async () => {
      const files = repairUploadFiles
        .map((item) => item.originFileObj)
        .filter(Boolean) as File[]
      if (files.length === 0) {
        messageApi.warning('请先选择需要补齐的引用标准文件')
        return
      }
      try {
        setRepairUploading(true)
        const settled = await Promise.allSettled(
          files.map(async (file) => {
            const [referenceResult, indexResult] = await Promise.allSettled([
              uploadEnterpriseStandard(file),
              postInsertIndexes(file),
            ])
            if (referenceResult.status === 'rejected') {
              throw referenceResult.reason
            }
            const referenceError = getUploadResultError(referenceResult.value?.data)
            if (referenceError) {
              throw new Error(referenceError)
            }
            if (indexResult.status === 'fulfilled') {
              const indexError = getUploadResultError(indexResult.value?.data)
              if (indexError) {
                throw new Error(indexError)
              }
            }
            return file.name
          }),
        )
        const successCount = settled.filter((item) => item.status === 'fulfilled').length
        const failedCount = settled.length - successCount
        if (failedCount > 0) {
          messageApi.warning(`补齐上传完成：成功 ${successCount} 个，失败 ${failedCount} 个。`)
        } else {
          messageApi.success(`补齐上传成功，共 ${successCount} 个文件。`)
        }
        setRepairUploadFiles([])
        await buildComparePreview()
      } catch (error) {
        const text = error instanceof Error ? error.message : '补齐上传失败'
        messageApi.error(text)
      } finally {
        setRepairUploading(false)
      }
    }

    const saveDraft = () => {
      const draft = {
        bzId: latestUploadedBzId,
        summaryDraft,
        current,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem('compliance-wizard-draft', JSON.stringify(draft))
      messageApi.success('已保存向导草稿')
    }

    const referenceColumns: ColumnsType<PendingIndexItem> = [
      {
        title: '指标名称',
        dataIndex: 'indicatorName',
        key: 'indicatorName',
        width: 220,
        render: (value: string, record) =>
          editingRowId === record.id ? (
            <Input
              size="small"
              value={editingDraft.indicatorName}
              onChange={(event) =>
                setEditingDraft((prev) => ({ ...prev, indicatorName: event.target.value }))
              }
            />
          ) : (
            value
          ),
      },
      {
        title: '指标值',
        dataIndex: 'indicatorValue',
        key: 'indicatorValue',
        render: (value: string, record) =>
          editingRowId === record.id ? (
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 4 }}
              value={editingDraft.indicatorValue}
              onChange={(event) =>
                setEditingDraft((prev) => ({ ...prev, indicatorValue: event.target.value }))
              }
            />
          ) : (
            value
          ),
      },
      {
        title: '状态',
        dataIndex: 'statusText',
        key: 'statusText',
        width: 110,
        render: (text: string) => <Tag color={text.includes('通过') ? 'success' : 'processing'}>{text}</Tag>,
      },
      {
        title: '审核',
        key: 'action',
        width: 300,
        render: (_value, record) => (
          <Space size={6} wrap>
            {editingRowId === record.id ? (
              <>
                <Button
                  type="primary"
                  size="small"
                  loading={editSaving}
                  onClick={() => saveInlineEdit(record)}
                >
                  保存并通过
                </Button>
                <Button size="small" onClick={cancelInlineEdit}>
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="primary"
                  size="small"
                  loading={auditingId === record.id}
                  onClick={() => submitSingleAudit(record, 'approve')}
                >
                  通过
                </Button>
                <Button
                  danger
                  size="small"
                  loading={auditingId === record.id}
                  onClick={() => submitSingleAudit(record, 'reject')}
                >
                  驳回
                </Button>
                <Button size="small" onClick={() => startInlineEdit(record)}>
                  行内编辑
                </Button>
              </>
            )}
          </Space>
        ),
      },
    ]

    const extractedReferenceColumns: ColumnsType<PendingIndexItem> = [
      {
        title: '引用文件编号',
        dataIndex: 'standardName',
        key: 'standardName',
        width: 220,
        render: (value: string, record) =>
          editingRowId === record.id ? (
            <Input
              size="small"
              value={editingDraft.standardName}
              onChange={(event) =>
                setEditingDraft((prev) => ({ ...prev, standardName: event.target.value }))
              }
            />
          ) : (
            value
          ),
      },
      {
        title: '引用文件名称',
        dataIndex: 'indicatorName',
        key: 'indicatorName',
        width: 220,
        render: (value: string, record) =>
          editingRowId === record.id ? (
            <Input
              size="small"
              value={editingDraft.indicatorName}
              onChange={(event) =>
                setEditingDraft((prev) => ({ ...prev, indicatorName: event.target.value }))
              }
            />
          ) : (
            value
          ),
      },
      {
        title: '状态',
        dataIndex: 'statusText',
        key: 'statusText',
        width: 110,
        render: (text: string) => <Tag color={text.includes('通过') ? 'success' : 'processing'}>{text}</Tag>,
      },
      {
        title: '审核',
        key: 'action',
        width: 300,
        render: (_value, record) => (
          <Space size={6} wrap>
            {editingRowId === record.id ? (
              <>
                <Button
                  type="primary"
                  size="small"
                  loading={editSaving}
                  onClick={() => saveInlineEdit(record)}
                >
                  保存并通过
                </Button>
                <Button size="small" onClick={cancelInlineEdit}>
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="primary"
                  size="small"
                  loading={auditingId === record.id}
                  onClick={() => submitSingleAudit(record, 'approve')}
                >
                  通过
                </Button>
                <Button
                  danger
                  size="small"
                  loading={auditingId === record.id}
                  onClick={() => submitSingleAudit(record, 'reject')}
                >
                  驳回
                </Button>
                <Button size="small" onClick={() => startInlineEdit(record)}>
                  行内编辑
                </Button>
              </>
            )}
          </Space>
        ),
      },
    ]

    const compareColumns: ColumnsType<ComparePreviewRow> = [
      {
        title: '指标名称',
        dataIndex: 'indicatorName',
        key: 'indicatorName',
        width: 180,
        render: (value: string, row) =>
          comparisonEditingId === row.id ? (
            <Input
              size="small"
              value={comparisonDraft?.indicatorName ?? value}
              onChange={(event) =>
                setComparisonDraft((prev) => (prev ? { ...prev, indicatorName: event.target.value } : prev))
              }
            />
          ) : (
            value
          ),
      },
      {
        title: '本标准指标值',
        dataIndex: 'enterpriseValue',
        key: 'enterpriseValue',
        width: 220,
        render: (value: string, row) =>
          comparisonEditingId === row.id ? (
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 3 }}
              value={comparisonDraft?.enterpriseValue ?? value}
              onChange={(event) =>
                setComparisonDraft((prev) => (prev ? { ...prev, enterpriseValue: event.target.value } : prev))
              }
            />
          ) : (
            value
          ),
      },
      { title: '相关比对标准指标值', dataIndex: 'matchedStandard', key: 'matchedStandard', width: 240 },
      {
        title: '匹配情况',
        dataIndex: 'status',
        key: 'status',
        width: 190,
        render: (status: string) => (
          <Tag
            color={
              status.includes('通过') || status.includes('命中')
                ? 'success'
                : status.includes('已在国标指标库中找到') || status.includes('已找到')
                  ? 'processing'
                  : status.includes('未在国标指标库中找到') || status.includes('未找到')
                    ? 'warning'
                    : 'default'
            }
          >
            {status}
          </Tag>
        ),
      },
      { title: '单项结果', dataIndex: 'nationalValue', key: 'nationalValue', width: 120 },
      {
        title: '备注',
        key: 'note',
        width: 220,
        render: (_value, row) => row.latestStandard ?? '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 170,
        render: (_value, row) =>
          comparisonEditingId === row.id ? (
            <Space size={6}>
              <Button size="small" type="primary" onClick={saveComparisonRow}>
                保存
              </Button>
              <Button size="small" onClick={cancelEditComparisonRow}>
                取消
              </Button>
            </Space>
          ) : (
            <Space size={6}>
              <Button size="small" onClick={() => startEditComparisonRow(row)}>
                编辑
              </Button>
              <Button size="small" danger onClick={() => removeComparisonRow(row.id)}>
                删除
              </Button>
            </Space>
          ),
      },
    ]

    const stepGuideItems = [
      '第1步：上传企标文件并触发规范性引用、指标解析链路。',
      '第2步：描述性合规评价与第一次人工审核。',
      '第3-5步：完成提取审核、有效性确认与技术对比。',
      '第6步：汇总三项评价信息并生成报告。',
    ]

    const descriptiveDecisionText =
      descriptiveReview.decision === 'approve'
        ? '已通过'
        : descriptiveReview.decision === 'reject'
          ? '已驳回'
          : '待审核'

    const validitySummary = useMemo(() => {
      const total = latestStandardRows.length
      const outdated = latestStandardRows.filter((item) => isRowCitationAutoOutdated(item)).length
      const latest = latestStandardRows.filter((item) => isRowCitationAutoLatest(item)).length
      const undeterminedAuto = latestStandardRows.filter(
        (item) => !item.complianceAssessable || item.citationMatchesLatest === null,
      ).length
      const mapped = latestStandardRows.filter((item) => savedMappingIds.has(item.queryBzId)).length
      const unmapped = Math.max(total - mapped, 0)
      const unresolvedLibrary = latestStandardRows.filter(
        (item) => item.resolutionPath === 'unresolved_no_historical_row',
      ).length
      return { total, latest, outdated, undeterminedAuto, mapped, unmapped, unresolvedLibrary }
    }, [latestStandardRows, savedMappingIds])

    const technicalSummary = useMemo(() => {
      const total = comparePreview.length
      const matched = comparePreview.filter(
        (row) =>
          row.status.includes('已在国标指标库中找到') ||
          row.status.includes('已找到') ||
          row.status.includes('命中'),
      ).length
      const unmatched = total - matched
      const compliant = comparePreview.filter((row) => row.nationalValue.trim() === '合规').length
      const nonCompliant = comparePreview.filter((row) => row.nationalValue.includes('不合规')).length
      const manual = Math.max(total - compliant - nonCompliant, 0)
      return { total, matched, unmatched, compliant, nonCompliant, manual }
    }, [comparePreview])

    const step3ManualAuditSummary = useMemo(() => {
      const allRows = [...referenceRows, ...pendingRows]
      const total = allRows.length
      const pending = allRows.filter((row) => {
        const text = row.statusText || ''
        return text.includes('待') || text.includes('解析') || text.includes('确认')
      }).length
      return {
        total,
        pending,
        completed: total > 0 && pending === 0,
      }
    }, [pendingRows, referenceRows])

    const reportChecklist = useMemo(
      () => [
        {
          key: 'step2Audit',
          label: '第2步人工审核已完成（描述性合规评价）',
          ok: descriptiveReview.decision !== 'pending',
          targetStep: 1,
          actionText: '去第2步处理',
        },
        {
          key: 'step3Audit',
          label: '第3步人工审核已完成（提取审核）',
          ok: step3ManualAuditSummary.completed,
          targetStep: 2,
          actionText: '去第3步处理',
        },
        {
          key: 'step4Audit',
          label: '第4步人工审核已完成（引用标准有效性与更替）',
          ok: validitySummary.total > 0 && validityReviewDecision === 'complete',
          targetStep: 3,
          actionText: '去第4步处理',
        },
        {
          key: 'step5Audit',
          label: '第5步人工审核已完成（指标映射与技术对比）',
          ok: comparisonAuditPassed,
          targetStep: 4,
          actionText: '去第5步处理',
        },
      ],
      [
        comparisonAuditPassed,
        descriptiveReview.decision,
        step3ManualAuditSummary.completed,
        validitySummary.total,
        validityReviewDecision,
      ],
    )

    const reportReady = reportChecklist.every((item) => item.ok)
    const stepCompletion = useMemo(
      () => [
        referenceRows.length + pendingRows.length > 0 || latestUploadedBzIds.length > 0 || !!latestUploadedBzId,
        descriptiveReview.decision !== 'pending',
        step3ManualAuditSummary.completed,
        validitySummary.total > 0 && validityReviewDecision === 'complete',
        comparisonAuditPassed,
        reportReady,
      ],
      [
        comparisonAuditPassed,
        descriptiveReview.decision,
        latestUploadedBzId,
        latestUploadedBzIds.length,
        pendingRows.length,
        referenceRows.length,
        reportReady,
        step3ManualAuditSummary.completed,
        validityReviewDecision,
        validitySummary.total,
      ],
    )
    const firstPendingChecklistKey = useMemo(
      () => reportChecklist.find((item) => !item.ok)?.key ?? '',
      [reportChecklist],
    )
    const [focusChecklistKey, setFocusChecklistKey] = useState('')
    const previousChecklistStateRef = React.useRef<Record<string, boolean> | null>(null)
    const previousPendingChecklistKeyRef = React.useRef<string | null>(null)

    useEffect(() => {
      if (current !== 5) return
      const prevState = previousChecklistStateRef.current
      if (prevState) {
        const completedItem = reportChecklist.find((item) => item.ok && prevState[item.key] === false)
        if (completedItem) {
          messageApi.success(`已完成：${completedItem.label}`)
        }
      }
      previousChecklistStateRef.current = Object.fromEntries(reportChecklist.map((item) => [item.key, item.ok]))
    }, [current, messageApi, reportChecklist])

    useEffect(() => {
      if (current !== 5) return
      const prevPendingKey = previousPendingChecklistKeyRef.current
      if (prevPendingKey !== null && prevPendingKey !== firstPendingChecklistKey) {
        if (firstPendingChecklistKey) {
          const nextItem = reportChecklist.find((item) => item.key === firstPendingChecklistKey)
          if (nextItem) {
            messageApi.info(`下一项优先处理：${nextItem.label}`)
          }
          setFocusChecklistKey(firstPendingChecklistKey)
          const timer = setTimeout(() => setFocusChecklistKey(''), 1200)
          previousPendingChecklistKeyRef.current = firstPendingChecklistKey
          return () => clearTimeout(timer)
        }
        messageApi.success('检查清单已全部完成，可以生成正式报告。')
      }
      previousPendingChecklistKeyRef.current = firstPendingChecklistKey
    }, [current, firstPendingChecklistKey, messageApi, reportChecklist])

    const suggestedStarLevel = useMemo(() => {
      if (descriptiveReview.decision === 'reject' || technicalSummary.nonCompliant > 0) {
        return { label: '不合规', color: 'error', reason: '存在驳回项或不合规指标。' }
      }
      if (technicalSummary.total === 0 || validitySummary.total === 0 || descriptiveReview.decision !== 'approve') {
        return { label: '待判定', color: 'default', reason: '关键步骤尚未完成，暂不建议出具星级。' }
      }
      if (
        validitySummary.outdated > 0 ||
        validitySummary.undeterminedAuto > 0 ||
        technicalSummary.unmatched > 0 ||
        technicalSummary.manual > 0
      ) {
        return { label: '★★★', color: 'warning', reason: '存在待更新引用或需人工判定项。' }
      }
      if (technicalSummary.nonCompliant === 0 && technicalSummary.compliant === technicalSummary.total) {
        return { label: '★★★★★', color: 'success', reason: '全部技术指标合规且匹配完整。' }
      }
      return { label: '★★★★', color: 'processing', reason: '整体合规，仍有少量人工复核项。' }
    }, [
      descriptiveReview.decision,
      technicalSummary.nonCompliant,
      technicalSummary.total,
      technicalSummary.unmatched,
      technicalSummary.manual,
      technicalSummary.compliant,
      validitySummary.total,
      validitySummary.outdated,
      validitySummary.undeterminedAuto,
    ])

    const generateSummaryDraftFromWorkflow = () => {
      const descriptiveText = descriptiveReview.reviewConclusion.trim() || buildDescriptiveConclusion(descriptiveReview)
      setSummaryDraft({
        descriptive: descriptiveText,
        validity: `共核验 ${validitySummary.total} 条引用标准，其中自动判定与现行主号一致 ${validitySummary.latest} 条、自动判定需更新 ${validitySummary.outdated} 条、未自动评价 ${validitySummary.undeterminedAuto} 条；已保存映射 ${validitySummary.mapped} 条，待保存 ${validitySummary.unmapped} 条${
          validitySummary.unresolvedLibrary > 0
            ? `；其中 ${validitySummary.unresolvedLibrary} 条未能从国标历史推断到企标制定时点对应的版本（请结合「发布时引用的完整的企标号」与「说明 / 谱系」列核对）`
            : ''
        }。`,
        technical: `技术指标对比共 ${technicalSummary.total} 项：已命中 ${technicalSummary.matched} 项、未命中 ${technicalSummary.unmatched} 项；单项结果为合规 ${technicalSummary.compliant} 项、不合规 ${technicalSummary.nonCompliant} 项、需人工判定 ${technicalSummary.manual} 项。`,
      })
      lastAutoDescriptiveRef.current = descriptiveText
      messageApi.success('已按模板生成三项评价总结草稿。')
    }

    const exportReportWithGuard = () => {
      if (!reportReady) {
        messageApi.warning('当前仍有未完成检查项，建议先补齐后再生成正式报告。')
        return
      }
      void onExportReport()
    }

    const resolveComplianceExportBzId = () =>
      descriptiveReview.bzId.trim() || reportBzId.trim() || latestUploadedBzId.trim()

    const exportStepSixDescriptiveReport = () => {
      const bz = resolveComplianceExportBzId()
      if (!bz || bz === '-') {
        messageApi.warning('建议先填写「企标号」或完成上传，以便报告标题与内容对应。')
      }
      downloadComplianceConclusionTextReport(
        `合规评价-描述性评价报告-${safeFilenameSegment(bz || '未填企标号')}-${Date.now()}.txt`,
        { section: '描述性评价信息', bzId: bz || '-' },
        summaryDraft.descriptive,
      )
      messageApi.success('已导出描述性评价报告')
    }

    const exportStepSixValidityReport = () => {
      const bz = resolveComplianceExportBzId()
      if (!bz || bz === '-') {
        messageApi.warning('建议先填写「企标号」或完成上传，以便报告标题与内容对应。')
      }
      downloadComplianceConclusionTextReport(
        `合规评价-引用标准有效性报告-${safeFilenameSegment(bz || '未填企标号')}-${Date.now()}.txt`,
        { section: '引用标准文件有效性及更替信息', bzId: bz || '-' },
        summaryDraft.validity,
      )
      messageApi.success('已导出引用标准有效性报告')
    }

    const exportStepSixTechnicalReport = () => {
      const bz = resolveComplianceExportBzId()
      if (!bz || bz === '-') {
        messageApi.warning('建议先填写「企标号」或完成上传，以便报告标题与内容对应。')
      }
      downloadComplianceConclusionTextReport(
        `合规评价-技术指标对比报告-${safeFilenameSegment(bz || '未填企标号')}-${Date.now()}.txt`,
        { section: '技术指标对比详细信息', bzId: bz || '-' },
        summaryDraft.technical,
      )
      messageApi.success('已导出技术指标对比报告')
    }

    const jumpToChecklistStep = async (step: number) => {
      const ok = await onWizardStepsChange(step)
      if (ok) {
        messageApi.info(`已跳转到第 ${step + 1} 步，请先完成该检查项。`)
      }
    }

    return (
      <div ref={rootRef}>
        {contextHolder}
        <Row gutter={[20, 20]} align="stretch">
          <Col xs={24} lg={17}>
            <Card style={{ ...cardStyle, marginBottom: 16 }}>
              <Steps
                size="small"
                current={current}
                onChange={(next) => void onWizardStepsChange(next)}
                items={WIZARD_STEP_TITLES.map((title, index) => ({
                  title,
                  disabled: index > backendMaxWizardIndex,
                  status: stepCompletion[index] ? 'finish' : index === current ? 'process' : 'wait',
                }))}
              />
            </Card>

            <Card
              title={WIZARD_STEP_TITLES[current]}
              style={cardStyle}
              styles={{ body: { minHeight: 500, display: 'flex', flexDirection: 'column' } }}
            >
              {current === 0 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Alert
                    type="info"
                    showIcon
                    message="支持批量上传（最多10个文件），提交后将分别执行规范性引用入库与指标入库。"
                  />
                  <Upload
                    multiple
                    maxCount={10}
                    beforeUpload={() => false}
                    fileList={fileList}
                    onChange={({ fileList: next }) => setFileList(next)}
                  >
                    <Button icon={<UploadOutlined />}>选择标准文档</Button>
                  </Upload>
                  <Button type="primary" loading={uploading} onClick={runUpload}>
                    上传标准文档开始解析
                  </Button>
                </Space>
              ) : null}

              {current === 1 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Alert
                    type="info"
                    showIcon
                    message="描述性合规评价"
                    description="请维护企标号与企业名称，选择是否合规；若不合规，请明确问题位置并形成结论，系统会自动同步到第六部分。"
                  />
                  <Row gutter={[12, 12]}>
                    <Col xs={24} xl={11}>
                      <Card size="small" title="基础信息与判定" style={{ borderRadius: 10, border: '1px solid #eaf0f6' }}>
                        <Space direction="vertical" style={{ width: '100%' }} size={10}>
                          <Input
                            placeholder="企标号（例如 Q/ABC 001-2026）"
                            value={descriptiveReview.bzId}
                            onChange={(event) =>
                              setDescriptiveReview((prev) => ({ ...prev, bzId: event.target.value }))
                            }
                          />
                          <Input
                            placeholder="企业名称"
                            value={descriptiveReview.enterpriseName}
                            onChange={(event) =>
                              setDescriptiveReview((prev) => ({ ...prev, enterpriseName: event.target.value }))
                            }
                          />
                          <div>
                            <Text type="secondary">是否合规</Text>
                            <div style={{ marginTop: 6 }}>
                              <Radio.Group
                                value={descriptiveReview.isCompliant}
                                onChange={(event) => {
                                  const next = event.target.value as DescriptiveReviewState['isCompliant']
                                  setDescriptiveReview((prev) => ({
                                    ...prev,
                                    isCompliant: next,
                                    nonComplianceReasons: next === 'no' ? prev.nonComplianceReasons : [],
                                    nonComplianceDetail: next === 'no' ? prev.nonComplianceDetail : '',
                                  }))
                                }}
                              >
                                <Radio.Button value="yes">合规</Radio.Button>
                                <Radio.Button value="no">不合规</Radio.Button>
                                <Radio.Button value="pending">待判定</Radio.Button>
                              </Radio.Group>
                            </div>
                          </div>
                          <Descriptions size="small" bordered column={1}>
                            <Descriptions.Item label="审核状态">
                              <Tag
                                color={
                                  descriptiveReview.decision === 'approve'
                                    ? 'success'
                                    : descriptiveReview.decision === 'reject'
                                      ? 'error'
                                      : 'processing'
                                }
                              >
                                {descriptiveDecisionText}
                              </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="最后更新时间">
                              {descriptiveReview.updatedAt || '尚未提交审核'}
                            </Descriptions.Item>
                          </Descriptions>
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} xl={13}>
                      <Card size="small" title="问题定位与结论" style={{ borderRadius: 10, border: '1px solid #eaf0f6' }}>
                        <Space direction="vertical" style={{ width: '100%' }} size={10}>
                          {descriptiveReview.isCompliant === 'yes' ? (
                            <Alert
                              type="success"
                              showIcon
                              message="已选择合规"
                              description="合规场景无需手填结论，系统将直接使用下方自动生成结论并同步到第六部分。"
                            />
                          ) : null}
                          {descriptiveReview.isCompliant === 'no' ? (
                            <>
                              <div>
                                <Text type="secondary">不合规位置（可多选）</Text>
                                <div style={{ marginTop: 6 }}>
                                  <Checkbox.Group
                                    options={DESCRIPTIVE_NON_COMPLIANCE_OPTIONS}
                                    value={descriptiveReview.nonComplianceReasons}
                                    onChange={(checked) =>
                                      setDescriptiveReview((prev) => ({
                                        ...prev,
                                        nonComplianceReasons: checked as string[],
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                              <Input.TextArea
                                rows={3}
                                placeholder="请说明不合规的具体条款/位置（不少于8个字）"
                                value={descriptiveReview.nonComplianceDetail}
                                onChange={(event) =>
                                  setDescriptiveReview((prev) => ({
                                    ...prev,
                                    nonComplianceDetail: event.target.value,
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {descriptiveReview.isCompliant !== 'yes' ? (
                            <Input.TextArea
                              rows={5}
                              placeholder="请填写最终描述性评价结论（将自动同步到第六部分）"
                              value={descriptiveReview.reviewConclusion}
                              onChange={(event) =>
                                setDescriptiveReview((prev) => ({ ...prev, reviewConclusion: event.target.value }))
                              }
                            />
                          ) : null}
                          <Space wrap>
                            <Button
                              onClick={() => {
                                const generated = buildDescriptiveConclusion(descriptiveReview)
                                setDescriptiveReview((prev) => ({ ...prev, reviewConclusion: generated }))
                                syncDescriptiveToStepSix(true)
                                messageApi.success('已生成并同步描述性结论到第六部分。')
                              }}
                            >
                              自动生成结论
                            </Button>
                            <Tag color="blue">已同步至第六部分：{lastAutoDescriptiveRef.current ? '是' : '待同步'}</Tag>
                          </Space>
                          <Card size="small" styles={{ body: { padding: '10px 12px', background: '#fafcff' } }}>
                            <Text type="secondary">当前结论预览</Text>
                            <div style={{ marginTop: 6 }}>
                              <Text>
                                {descriptiveReview.reviewConclusion.trim() || buildDescriptiveConclusion(descriptiveReview)}
                              </Text>
                            </div>
                          </Card>
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                  <Space wrap>
                    <Button type="primary" onClick={() => void submitDescriptiveReview('approve')}>
                      通过（第一次人工审核）
                    </Button>
                    <Button danger onClick={() => void submitDescriptiveReview('reject')}>
                      驳回（第一次人工审核）
                    </Button>
                  </Space>
                </Space>
              ) : null}

              {current === 2 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }}>
                    <Descriptions.Item label="引用文件条数">{referenceRows.length}</Descriptions.Item>
                    <Descriptions.Item label="待审核总数">{pendingCount}</Descriptions.Item>
                  </Descriptions>
                  <Card size="small" title="规范性引用文件编号提取结果（人工审核）">
                    <Space wrap style={{ marginBottom: 12 }}>
                      <Button
                        type="primary"
                        loading={referenceBulkAction === 'approve'}
                        onClick={() => submitReferenceBulkAudit('approve')}
                      >
                        一键通过
                      </Button>
                      <Button
                        danger
                        loading={referenceBulkAction === 'reject'}
                        onClick={() => submitReferenceBulkAudit('reject')}
                      >
                        一键驳回
                      </Button>
                      <Button
                        onClick={async () => {
                          await refreshPending({ onlyNewAfterUpload: true, sessionOnly: true })
                        }}
                        loading={loadingPending}
                      >
                        刷新提取结果
                      </Button>
                    </Space>
                    <Table
                      rowKey="id"
                      dataSource={referenceRows}
                      columns={extractedReferenceColumns}
                      pagination={{ pageSize: 5, showSizeChanger: false }}
                      locale={{
                        emptyText: '暂无规范性引用文件编号提取结果，请先完成解析或稍后刷新',
                      }}
                      scroll={{ x: 900 }}
                    />
                  </Card>
                  <Card size="small" title="企标指标提取结果（人工审核）">
                  <Space wrap>
                    <Button
                      type="primary"
                      loading={bulkAction === 'approve'}
                      onClick={() => submitBulkAudit('approve')}
                    >
                      一键通过
                    </Button>
                    <Button danger loading={bulkAction === 'reject'} onClick={() => submitBulkAudit('reject')}>
                      一键驳回
                    </Button>
                    <Button
                      onClick={async () => {
                        const rows = await refreshPending({ onlyNewAfterUpload: true, sessionOnly: true })
                        if (rows.length === 0) {
                          await loadExtractedFromIndexesTable()
                        }
                      }}
                      loading={loadingPending}
                    >
                      刷新提取结果
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    dataSource={pendingRows}
                    columns={referenceColumns}
                    loading={loadingPending}
                    pagination={{ pageSize: 8, showSizeChanger: false }}
                    locale={{ emptyText: '暂无指标提取结果，请先完成解析或稍后刷新' }}
                    scroll={{ x: 960 }}
                  />
                  </Card>
                </Space>
              ) : null}

              {current === 3 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Alert
                    type="warning"
                    showIcon
                    message="引用标准有效性与更替"
                    description="先判断引用标准是否过期，再由人工审核数据是否完整；可新增最新标准编号并纳入下一步指标对比。"
                  />
                  {validitySummary.unresolvedLibrary > 0 ? (
                    <Alert
                      type="info"
                      showIcon
                      message={`当前有 ${validitySummary.unresolvedLibrary} 条在国标历史库中未能推断到企标制定时点对应的版本，请结合「发布时引用的完整的企标号」与「说明 / 谱系」列核对后再确认。`}
                    />
                  ) : null}
                  <Space wrap>
                    <Button type="primary" loading={validityLoading} onClick={runReferenceValidityCheck}>
                      生成引用标准有效性与更替信息
                    </Button>
                    <Input
                      placeholder="输入新增最新标准编号（如 GB/T601-2020）"
                      value={manualLatestStandardInput}
                      style={{ width: 260 }}
                      onChange={(event) => setManualLatestStandardInput(event.target.value)}
                    />
                    <Button onClick={addManualLatestStandard}>新增最新标准</Button>
                    <Button
                      type="primary"
                      ghost
                      onClick={submitValidityManualReview}
                    >
                      人工审核数据完整并存入映射
                    </Button>
                    <Tag
                      color={validityReviewDecision === 'complete' ? 'success' : 'default'}
                    >
                      {validityReviewDecision === 'complete'
                        ? '人工审核：数据完整并已映射入库'
                        : '人工判定：待确认'}
                    </Tag>
                  </Space>
                  {manualLatestStandardIds.length > 0 ? (
                    <div>
                      <Text type="secondary">已新增最新标准编号（将参与下一步指标对比）：</Text>
                      <div style={{ marginTop: 6 }}>
                        <Space size={[6, 6]} wrap>
                          {manualLatestStandardIds.map((item) => (
                            <Tag key={item} color="processing">
                              {item}
                            </Tag>
                          ))}
                        </Space>
                      </div>
                    </div>
                  ) : null}
                  <ReferenceLatestResolvedTable
                    dataSource={latestStandardRows}
                    editingId={validityEditingId}
                    draft={validityDraft}
                    setDraft={setValidityDraft}
                    onSaveRow={saveValidityRow}
                    onCancelEdit={cancelEditValidityRow}
                    onStartEdit={startEditValidityRow}
                    onDeleteRow={removeValidityRow}
                    emptyText="点击上方按钮后生成有效性与更替输出"
                  />
                </Space>
              ) : null}

              {current === 4 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Row gutter={[12, 12]}>
                    <Col xs={24} xl={13}>
                      <Card
                        size="small"
                        title="查找诊断与缺失信息"
                        style={{ borderRadius: 10, border: '1px solid #eaf0f6' }}
                      >
                        <Row gutter={[8, 8]}>
                          <Col span={8}>
                            <Card size="small" styles={{ body: { padding: 10 } }}>
                              <Text type="secondary">旧引用指标</Text>
                              <div style={{ fontSize: 20, fontWeight: 700 }}>{oldReferenceIndexRows.length}</div>
                            </Card>
                          </Col>
                          <Col span={8}>
                            <Card size="small" styles={{ body: { padding: 10 } }}>
                              <Text type="secondary">最新引用指标</Text>
                              <div style={{ fontSize: 20, fontWeight: 700 }}>{latestReferenceIndexRows.length}</div>
                            </Card>
                          </Col>
                          <Col span={8}>
                            <Card size="small" styles={{ body: { padding: 10 } }}>
                              <Text type="secondary">技术对比条数</Text>
                              <div style={{ fontSize: 20, fontWeight: 700 }}>{comparePreview.length}</div>
                            </Card>
                          </Col>
                        </Row>
                        <div style={{ marginTop: 10 }}>
                          <Text strong>数据库未命中的旧引用标准编号：</Text>
                          <div style={{ marginTop: 6 }}>
                            {missingOldReferenceFiles.length > 0 ? (
                              <Space size={[6, 6]} wrap>
                                {missingOldReferenceFiles.map((item) => (
                                  <Tag key={item} color="warning">
                                    {item}
                                  </Tag>
                                ))}
                              </Space>
                            ) : (
                              <Text type="secondary">无（旧引用标准都已在库中找到）</Text>
                            )}
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <Text strong>数据库未命中的最新标准编号（更替后）：</Text>
                          <div style={{ marginTop: 6 }}>
                            {missingLatestReferenceFiles.length > 0 ? (
                              <Space size={[6, 6]} wrap>
                                {missingLatestReferenceFiles.map((item) => (
                                  <Tag key={item} color="error">
                                    {item}
                                  </Tag>
                                ))}
                              </Space>
                            ) : (
                              <Text type="secondary">无（最新标准都已在库中找到）</Text>
                            )}
                          </div>
                        </div>
                        {step4BackendMissingGb.length > 0 ? (
                          <div style={{ marginTop: 12 }}>
                            <Text strong>编排侧缺件（接口 step/4，未配置国标文件路径）：</Text>
                            <div style={{ marginTop: 6 }}>
                              <Space size={[6, 6]} wrap>
                                {step4BackendMissingGb.map((item) => (
                                  <Tag key={item.std_code} color="volcano">
                                    {item.std_code}
                                    {item.std_name ? ` ${item.std_name}` : ''}
                                  </Tag>
                                ))}
                              </Space>
                            </div>
                            <Text type="secondary" style={{ display: 'block', marginTop: 6 }}>
                              上述项会导致「下一步」审核 4 确认失败，请先在本页上传补齐或联系管理员配置服务器路径。
                            </Text>
                          </div>
                        ) : null}
                      </Card>
                    </Col>
                    <Col xs={24} xl={11}>
                      <Card
                        size="small"
                        title="引用标准补齐工具"
                        style={{ borderRadius: 10, border: '1px solid #eaf0f6' }}
                      >
                        <Alert
                          type="info"
                          showIcon
                          message="批量上传缺失引用标准文件"
                          description="上传后将调用解析链路并回填指标，再重新构建技术对比。"
                          style={{ marginBottom: 10 }}
                        />
                        <Upload
                          multiple
                          maxCount={10}
                          beforeUpload={() => false}
                          fileList={repairUploadFiles}
                          onChange={({ fileList: next }) => setRepairUploadFiles(next)}
                        >
                          <Button icon={<UploadOutlined />}>选择引用标准文件</Button>
                        </Upload>
                        <Button
                          type="primary"
                          style={{ marginTop: 10, width: '100%' }}
                          loading={repairUploading}
                          onClick={uploadRepairReferenceFiles}
                        >
                          上传并解析补齐
                        </Button>
                        <div style={{ marginTop: 12 }}>
                          <Text type="secondary">
                            补齐后可再次点击“构建对比预览”刷新结果。
                          </Text>
                        </div>
                      </Card>
                    </Col>
                  </Row>

                  <Card
                    size="small"
                    title="技术指标对比表"
                    style={{ borderRadius: 10, border: '1px solid #eaf0f6' }}
                  >
                    <Space wrap style={{ marginBottom: 12 }}>
                      <Button type="primary" loading={comparisonLoading} onClick={buildComparePreview}>
                        构建对比预览
                      </Button>
                      <Button onClick={addComparisonRow}>新增行</Button>
                      <Button type="primary" ghost onClick={approveComparisonResult}>
                        人工审核通过
                      </Button>
                      {comparisonAuditPassed ? <Tag color="success">已通过人工审核</Tag> : null}
                    </Space>
                    <Text type="secondary">
                      “新增行”用于手动补录指标。填写“指标名称 + 本标准指标值”并保存后，系统会自动尝试匹配后端国标指标库。
                    </Text>
                    <Table
                      rowKey="id"
                      dataSource={comparePreview}
                      columns={compareColumns}
                      pagination={{ pageSize: 8, showSizeChanger: false }}
                      loading={comparisonLoading}
                      locale={{ emptyText: '请先点击「构建对比预览」' }}
                      scroll={{ x: 1120 }}
                    />
                  </Card>
                </Space>
              ) : null}

              {current === 5 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Alert
                    type="success"
                    showIcon
                    message="三项评价总结与报告生成"
                    description="本步骤按报告模板固化生成结论：先看自动统计与检查清单，再一键生成三项总结草稿，最后导出正式报告。"
                  />
                  <Row gutter={[12, 12]}>
                    <Col xs={24} xl={11}>
                      <Card
                        size="small"
                        title="自动统计与检查清单"
                        style={{ borderRadius: 10, border: '1px solid #eaf0f6' }}
                      >
                        <Space direction="vertical" style={{ width: '100%' }} size={10}>
                          <Card size="small" styles={{ body: { padding: '10px 12px' } }}>
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Text type="secondary">推荐星级</Text>
                              <Space>
                                <Tag color={suggestedStarLevel.color}>{suggestedStarLevel.label}</Tag>
                                <Text type="secondary">{suggestedStarLevel.reason}</Text>
                              </Space>
                            </Space>
                          </Card>
                          <Row gutter={[8, 8]}>
                            <Col span={12}>
                              <Card size="small" styles={{ body: { padding: '10px 12px' } }}>
                                <Text type="secondary">描述性审核</Text>
                                <div style={{ marginTop: 4 }}>
                                  <Tag
                                    color={
                                      descriptiveReview.decision === 'approve'
                                        ? 'success'
                                        : descriptiveReview.decision === 'reject'
                                          ? 'error'
                                          : 'processing'
                                    }
                                  >
                                    {descriptiveDecisionText}
                                  </Tag>
                                </div>
                              </Card>
                            </Col>
                            <Col span={12}>
                              <Card size="small" styles={{ body: { padding: '10px 12px' } }}>
                                <Text type="secondary">映射入库</Text>
                                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>
                                  {validitySummary.mapped}/{validitySummary.total}
                                </div>
                              </Card>
                            </Col>
                            <Col span={12}>
                              <Card size="small" styles={{ body: { padding: '10px 12px' } }}>
                                <Text type="secondary">合规项</Text>
                                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>
                                  {technicalSummary.compliant}
                                </div>
                              </Card>
                            </Col>
                            <Col span={12}>
                              <Card size="small" styles={{ body: { padding: '10px 12px' } }}>
                                <Text type="secondary">不合规项</Text>
                                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: '#cf1322' }}>
                                  {technicalSummary.nonCompliant}
                                </div>
                              </Card>
                            </Col>
                          </Row>
                          <Card size="small" styles={{ body: { padding: '10px 12px' } }}>
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                              {reportChecklist.map((item) => (
                                (() => {
                                  const isPrimaryPending = !item.ok && item.key === firstPendingChecklistKey
                                  const isFocus = item.key === focusChecklistKey
                                  return (
                                <Row
                                  key={item.key}
                                  justify="space-between"
                                  align="middle"
                                  style={{
                                    padding: '4px 6px',
                                    borderRadius: 6,
                                    background: isPrimaryPending ? '#fff7e6' : 'transparent',
                                    border:
                                      isPrimaryPending
                                        ? '1px solid #ffd591'
                                        : '1px solid transparent',
                                    transform: isFocus ? 'scale(1.01)' : 'scale(1)',
                                    boxShadow: isFocus ? '0 0 0 2px rgba(250, 173, 20, 0.18)' : 'none',
                                    transition: 'all 240ms ease',
                                  }}
                                >
                                  <Col>
                                    <Text>{item.label}</Text>
                                  </Col>
                                  <Col>
                                    <Space size={8}>
                                      {!item.ok && isPrimaryPending ? (
                                        <Tag color="warning">优先处理</Tag>
                                      ) : null}
                                      <Tag
                                        color={
                                          item.ok
                                            ? 'success'
                                            : isPrimaryPending
                                              ? 'warning'
                                              : 'default'
                                        }
                                      >
                                        {item.ok ? '已完成' : '未完成'}
                                      </Tag>
                                      {!item.ok ? (
                                        <Button
                                          size="small"
                                          type={isPrimaryPending ? 'primary' : 'link'}
                                          style={isPrimaryPending ? undefined : { paddingInline: 0 }}
                                          onClick={() => void jumpToChecklistStep(item.targetStep)}
                                        >
                                          {item.actionText}
                                        </Button>
                                      ) : null}
                                    </Space>
                                  </Col>
                                </Row>
                                  )
                                })()
                              ))}
                            </Space>
                          </Card>
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} xl={13}>
                      <Card
                        size="small"
                        title="模板化结论编辑区"
                        style={{ borderRadius: 10, border: '1px solid #eaf0f6' }}
                      >
                        <Space direction="vertical" style={{ width: '100%' }} size={10}>
                          <Button onClick={generateSummaryDraftFromWorkflow}>一键生成三项总结草稿</Button>
                          <div>
                            <Input.TextArea
                              rows={4}
                              placeholder="描述性评价信息"
                              value={summaryDraft.descriptive}
                              onChange={(e) => setSummaryDraft((prev) => ({ ...prev, descriptive: e.target.value }))}
                            />
                            <div style={{ marginTop: 8, textAlign: 'right' }}>
                              <Button icon={<DownloadOutlined />} onClick={exportStepSixDescriptiveReport}>
                                导出报告
                              </Button>
                            </div>
                          </div>
                          <div>
                            <Input.TextArea
                              rows={4}
                              placeholder="引用标准文件有效性及更替信息"
                              value={summaryDraft.validity}
                              onChange={(e) => setSummaryDraft((prev) => ({ ...prev, validity: e.target.value }))}
                            />
                            <div style={{ marginTop: 8, textAlign: 'right' }}>
                              <Button icon={<DownloadOutlined />} onClick={exportStepSixValidityReport}>
                                导出报告
                              </Button>
                            </div>
                          </div>
                          <div>
                            <Input.TextArea
                              rows={4}
                              placeholder="技术指标对比详细信息"
                              value={summaryDraft.technical}
                              onChange={(e) => setSummaryDraft((prev) => ({ ...prev, technical: e.target.value }))}
                            />
                            <div style={{ marginTop: 8, textAlign: 'right' }}>
                              <Button icon={<DownloadOutlined />} onClick={exportStepSixTechnicalReport}>
                                导出报告
                              </Button>
                            </div>
                          </div>
                          <Input
                            placeholder="请输入标准号（bz_id），例如 Q/ABC 001-2026"
                            value={reportBzId}
                            onChange={(event) => setReportBzId(event.target.value)}
                          />
                          <Space wrap>
                            <Button type="primary" loading={reporting} onClick={exportReportWithGuard}>
                              生成并导出正式报告（推荐）
                            </Button>
                            <Button loading={reporting} onClick={() => void onExportReport()}>
                              直接导出（不校验）
                            </Button>
                          </Space>
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                </Space>
              ) : null}
            </Card>
          </Col>

          <Col xs={24} lg={7}>
            <Card title="步骤说明" style={{ ...cardStyle, position: 'sticky', top: 88 }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div
                  style={{
                    border: '1px solid #e6f4ff',
                    background: '#f7fbff',
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}
                >
                  <Text strong>当前第 {current + 1} 步</Text>
                  <Text type="secondary"> / 共 {WIZARD_STEP_TITLES.length} 步</Text>
                  <div style={{ marginTop: 6 }}>
                    <Text type="secondary">支持点击顶部步骤跳转，也可用底部导航顺序推进。</Text>
                  </div>
                </div>

                {stepGuideItems.map((item, idx) => (
                  <div
                    key={item}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: '8px 0',
                      borderBottom: idx === stepGuideItems.length - 1 ? 'none' : '1px dashed #f0f0f0',
                    }}
                  >
                    <div
                      style={{
                        minWidth: 32,
                        height: 22,
                        borderRadius: 6,
                        border: '1px solid #d3adf7',
                        background: '#f9f0ff',
                        color: '#722ed1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      G{idx + 1}
                    </div>
                    <Text>{item}</Text>
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>

        <Card
          style={{
            ...cardStyle,
            marginTop: 20,
            position: 'sticky',
            bottom: 16,
            zIndex: 5,
            background: '#fafbff',
          }}
        >
          <Row justify="space-between" align="middle" gutter={[12, 12]}>
            <Col>
              <Space wrap>
                <Button disabled={current === 0} onClick={() => setCurrent((prev) => Math.max(0, prev - 1))}>
                  上一步
                </Button>
                <Button
                  type="primary"
                  disabled={current === WIZARD_STEP_TITLES.length - 1}
                  loading={wizardNextLoading}
                  onClick={() => void goToNextWizardStep()}
                >
                  下一步
                </Button>
              </Space>
            </Col>
            <Col>
              <Space wrap>
                <Button icon={<SaveOutlined />} onClick={saveDraft}>
                  保存草稿
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

      </div>
    )
  },
)

export default ComplianceWizardPanel
