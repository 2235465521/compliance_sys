import type ExcelJS from 'exceljs'
import type { BatchNormativeRefJobOut, BatchNormativeRefItemOut } from '@/types/batch-normative-ref'
import {
  fileComplianceOutcomeLabel,
  mapReferencesResolvedToStandardLatestResults,
  parseFileComplianceOutcome,
  type StandardLatestCheckResult,
} from '@/services/compliance'
import { buildValidityPedigreeShortLabel, extractReferenceRowStatusDisplay } from '@/pages/compliance/utils/validityPedigree'
import { formatPedigreePlainForCsv } from '@/pages/compliance/utils/pedigreeExplanationDisplay'
import { pickCompanyForItem, pickQbCode, pickQbShortName } from '@/pages/batch-normative-ref/itemMetaDisplay'

function escapeCsvCell(value: string): string {
  const s = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function normalizeCodeKey(s: string): string {
  return s.trim().replace(/\s+/g, '').replace(/／/g, '/').toUpperCase()
}

function buildLatestStandardCellFromRow(r: StandardLatestCheckResult): string {
  const primary = r.currentLatestId.trim()
  const raw = r.currentLatestStdCodes
  if (!raw?.length) return primary
  const codes = raw.map((x) => String(x).trim()).filter(Boolean)
  const pk = normalizeCodeKey(primary)
  const rest = codes.filter((c) => normalizeCodeKey(c) !== pk)
  if (!primary && rest.length === 0) return ''
  if (!primary) return rest.join('、')
  if (rest.length === 0) return primary
  return [primary, ...rest].join('、')
}

function rowCitationDisplayZh(r: StandardLatestCheckResult): string {
  if (!r.complianceAssessable) return '未自动评价'
  if (r.citationMatchesLatest === true) return '是'
  if (r.citationMatchesLatest === false) return '否'
  return '未自动评价'
}

/** 与表格「自动结论：时点号与现行主号不一致」同一判定（可参与自动比对且 citation 为 false） */
export function isCitationMainNumberMismatch(r: StandardLatestCheckResult): boolean {
  return Boolean(r.complianceAssessable && r.citationMatchesLatest === false)
}

function attentionMarkForRow(r: StandardLatestCheckResult): string {
  return isCitationMainNumberMismatch(r) ? '是 · 与现行主号不一致' : ''
}

/** 与界面「状态」列一致；不一致时在纯文本中加符号便于扫读（CSV 无单元格颜色） */
function rowStatusDisplayForExport(r: StandardLatestCheckResult): string {
  const primary = buildValidityPedigreeShortLabel(r)
  const statusText = extractReferenceRowStatusDisplay(primary)
  if (statusText === '与现行主号不一致') {
    return `【⚠ ${statusText} · 请重点核对】`
  }
  return statusText
}

function normalizeFileNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/\\/g, '/').toLowerCase()
}

function mergeKeyForItem(item: BatchNormativeRefItemOut): string {
  const fn = (item.original_filename ?? '').trim()
  if (fn) return `file:${normalizeFileNameKey(fn)}`
  return `item:${item.id}`
}

/** 已完成但无任何引用行时，导出占位行（与接口 no_references / 空数组 对齐） */
function placeholderRowNoReferences(item: BatchNormativeRefItemOut): StandardLatestCheckResult {
  const outcome = parseFileComplianceOutcome(item.file_compliance_outcome)
  const outcomeZh = outcome ? fileComplianceOutcomeLabel(outcome) : '无引用或结论未返回'
  const lines = [
    '本企标子项已完成处理，但未解析到可逐条导出的规范性引用（references_resolved 为空或 null）。',
    `整文件结论（file_compliance_outcome）：${outcomeZh}。`,
  ]
  if (item.error_message?.trim()) {
    lines.push(`子项 error_message：${item.error_message.trim()}`)
  }
  return {
    queryBzId: '—',
    complianceAssessable: false,
    citationMatchesLatest: null,
    isLatest: false,
    currentLatestId: '',
    pedigreeChain: lines.join('\n'),
    historicalFullStdCode: null,
    resolutionPath: null,
  }
}

function hasResolvedReferenceRows(item: BatchNormativeRefItemOut): boolean {
  return Array.isArray(item.references_resolved) && item.references_resolved.length > 0
}

const CSV_HEADERS_ZH = [
  '序号',
  '文件序号',
  '批次标签',
  '文件名',
  '企标号',
  '企标名',
  '公司名称',
  '企标中引用的标准号',
  '发布时引用的完整标准号',
  '最新标准号',
  '本条引用是否与现行一致',
  '状态',
  '需重点核对',
  '说明/谱系',
] as const

export type BatchNormativeRefExportRow = {
  rowIndex: number
  fileSeq: number
  mergeKey: string
  label: string
  filename: string
  qbCode: string
  qbName: string
  company: string
  r: StandardLatestCheckResult
}

function flattenExportRows(job: BatchNormativeRefJobOut): BatchNormativeRefExportRow[] {
  const label = (job.label ?? '').trim()
  const mergeKeyToFileSeq = new Map<string, number>()
  let nextFileSeq = 1
  const out: BatchNormativeRefExportRow[] = []
  let rowIndex = 0

  for (const item of job.items) {
    if (item.status !== 'completed') continue

    const qbCode = pickQbCode(item)
    const qbName = pickQbShortName(item)
    const company = pickCompanyForItem(item, job)
    const mergeKey = mergeKeyForItem(item)
    if (!mergeKeyToFileSeq.has(mergeKey)) {
      mergeKeyToFileSeq.set(mergeKey, nextFileSeq++)
    }
    const fileSeq = mergeKeyToFileSeq.get(mergeKey) ?? nextFileSeq

    const resolvedRows = hasResolvedReferenceRows(item)
      ? mapReferencesResolvedToStandardLatestResults(item.references_resolved)
      : []

    if (resolvedRows.length === 0) {
      rowIndex += 1
      out.push({
        rowIndex,
        fileSeq,
        mergeKey,
        label,
        filename: item.original_filename,
        qbCode,
        qbName,
        company,
        r: placeholderRowNoReferences(item),
      })
      continue
    }

    for (const r of resolvedRows) {
      rowIndex += 1
      out.push({
        rowIndex,
        fileSeq,
        mergeKey,
        label,
        filename: item.original_filename,
        qbCode,
        qbName,
        company,
        r,
      })
    }
  }
  return out
}

/** 逗号分隔 CSV（UTF-8 BOM），扩展名与内容一致，可用 Excel 直接打开 */
export function buildBatchNormativeRefJobReferencesCsv(job: BatchNormativeRefJobOut): string {
  const headerLine = CSV_HEADERS_ZH.map((h) => escapeCsvCell(h)).join(',')
  const lines: string[] = [headerLine]
  const flat = flattenExportRows(job)

  for (const row of flat) {
    const latestCell = buildLatestStandardCellFromRow(row.r)
    const explanationPlain = formatPedigreePlainForCsv(row.r.pedigreeChain ?? '')
    const attention = attentionMarkForRow(row.r)

    lines.push(
      [
        String(row.rowIndex),
        String(row.fileSeq),
        escapeCsvCell(row.label),
        escapeCsvCell(row.filename),
        escapeCsvCell(row.qbCode),
        escapeCsvCell(row.qbName),
        escapeCsvCell(row.company),
        escapeCsvCell(row.r.queryBzId),
        escapeCsvCell(String(row.r.historicalFullStdCode ?? '')),
        escapeCsvCell(latestCell),
        rowCitationDisplayZh(row.r),
        escapeCsvCell(rowStatusDisplayForExport(row.r)),
        escapeCsvCell(attention),
        escapeCsvCell(explanationPlain),
      ].join(','),
    )
  }

  const body = lines.join('\r\n')
  return `\ufeff${body}`
}

const MISMATCH_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFF0000' },
  bold: true,
}

/** 生成真实 .xlsx：「与现行主号不一致」行在「本条引用是否与现行一致 / 状态 / 需重点核对」列标红加粗，便于肉眼筛查 */
export async function downloadBatchNormativeRefJobReferencesXlsx(job: BatchNormativeRefJobOut) {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet('规范性引用', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  sheet.addRow([...CSV_HEADERS_ZH])
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    }
  })

  const flat = flattenExportRows(job)
  for (const row of flat) {
    const latestCell = buildLatestStandardCellFromRow(row.r)
    const explanationPlain = formatPedigreePlainForCsv(row.r.pedigreeChain ?? '')
    const mismatch = isCitationMainNumberMismatch(row.r)
    const excelRow = sheet.addRow([
      row.rowIndex,
      row.fileSeq,
      row.label,
      row.filename,
      row.qbCode,
      row.qbName,
      row.company,
      row.r.queryBzId,
      String(row.r.historicalFullStdCode ?? ''),
      latestCell,
      rowCitationDisplayZh(row.r),
      rowStatusDisplayForExport(row.r),
      attentionMarkForRow(row.r),
      explanationPlain,
    ])
    if (mismatch) {
      ;[11, 12, 13].forEach((col) => {
        excelRow.getCell(col).font = { ...MISMATCH_FONT }
      })
    }
  }

  sheet.columns = [
    { width: 6 },
    { width: 8 },
    { width: 14 },
    { width: 28 },
    { width: 18 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 28 },
    { width: 28 },
    { width: 22 },
    { width: 28 },
    { width: 26 },
    { width: 56 },
  ]

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = (job.label ?? `job-${job.id}`).replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 80)
  a.href = url
  a.download = `batch-normative-ref-${job.id}-${safe}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/** @deprecated 请使用 {@link downloadBatchNormativeRefJobReferencesXlsx}；保留供脚本或需纯文本 CSV 时调用 */
export function downloadBatchNormativeRefJobReferencesCsv(job: BatchNormativeRefJobOut) {
  const csv = buildBatchNormativeRefJobReferencesCsv(job)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = (job.label ?? `job-${job.id}`).replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 80)
  a.href = url
  a.download = `batch-normative-ref-${job.id}-${safe}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
