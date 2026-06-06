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
import {
  pickCompanyForItem,
  pickLocationForItem,
  pickQbCode,
  pickQbShortName,
  pickQbStandardTitle,
} from '@/pages/batch-normative-ref/itemMetaDisplay'

type ExportColumnKey =
  | 'rowIndex'
  | 'fileSeq'
  | 'label'
  | 'filename'
  | 'qbCode'
  | 'qbName'
  | 'company'
  | 'referencedStd'
  | 'historicalFull'
  | 'latestStd'
  | 'citationZh'
  | 'status'
  | 'attention'
  | 'explanation'

type ExportColumnDef = {
  key: ExportColumnKey
  header: string
  width: number
  highlightOnMismatch?: boolean
}

const FULL_COLUMNS: ExportColumnDef[] = [
  { key: 'rowIndex', header: '序号', width: 6 },
  { key: 'fileSeq', header: '文件序号', width: 8 },
  { key: 'label', header: '任务名称', width: 14 },
  { key: 'filename', header: '文件名', width: 28 },
  { key: 'qbCode', header: '企标号', width: 18 },
  { key: 'qbName', header: '企标名', width: 22 },
  { key: 'company', header: '公司名称', width: 22 },
  { key: 'referencedStd', header: '企标中引用的标准号', width: 22 },
  { key: 'historicalFull', header: '发布时引用的完整标准号', width: 28 },
  { key: 'latestStd', header: '最新标准号', width: 28 },
  { key: 'citationZh', header: '本条引用是否与现行一致', width: 22, highlightOnMismatch: true },
  { key: 'status', header: '状态', width: 28, highlightOnMismatch: true },
  { key: 'attention', header: '需重点核对', width: 26, highlightOnMismatch: true },
  { key: 'explanation', header: '说明/谱系', width: 56 },
]

const SIMPLIFIED_COLUMNS = FULL_COLUMNS.filter(
  (c) => c.key !== 'status' && c.key !== 'attention' && c.key !== 'explanation',
)

const CSV_HEADERS_ZH = FULL_COLUMNS.map((c) => c.header)

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

function getCellValue(row: BatchNormativeRefExportRow, key: ExportColumnKey): string | number {
  switch (key) {
    case 'rowIndex':
      return row.rowIndex
    case 'fileSeq':
      return row.fileSeq
    case 'label':
      return row.label
    case 'filename':
      return row.filename
    case 'qbCode':
      return row.qbCode
    case 'qbName':
      return row.qbName
    case 'company':
      return row.company
    case 'referencedStd':
      return row.r.queryBzId
    case 'historicalFull':
      return String(row.r.historicalFullStdCode ?? '')
    case 'latestStd':
      return buildLatestStandardCellFromRow(row.r)
    case 'citationZh':
      return rowCitationDisplayZh(row.r)
    case 'status':
      return rowStatusDisplayForExport(row.r)
    case 'attention':
      return attentionMarkForRow(row.r)
    case 'explanation':
      return formatPedigreePlainForCsv(row.r.pedigreeChain ?? '')
    default:
      return ''
  }
}

function safeDownloadFilename(job: BatchNormativeRefJobOut, suffix: string): string {
  const safe = (job.label ?? `job-${job.id}`).replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 80)
  return `batch-normative-ref-${job.id}-${safe}${suffix}`
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const MISMATCH_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFF0000' },
  bold: true,
}

async function writeXlsxFromFlat(
  flat: BatchNormativeRefExportRow[],
  columns: ExportColumnDef[],
  downloadName: string,
) {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet('规范性引用', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  sheet.addRow(columns.map((c) => c.header))
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    }
  })

  const highlightColIndexes = columns
    .map((c, i) => (c.highlightOnMismatch ? i + 1 : null))
    .filter((n): n is number => n != null)

  for (const row of flat) {
    const mismatch = isCitationMainNumberMismatch(row.r)
    const excelRow = sheet.addRow(columns.map((c) => getCellValue(row, c.key)))
    if (mismatch) {
      highlightColIndexes.forEach((col) => {
        excelRow.getCell(col).font = { ...MISMATCH_FONT }
      })
    }
  }

  sheet.columns = columns.map((c) => ({ width: c.width }))

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerBlobDownload(blob, downloadName)
}

/** 逗号分隔 CSV（UTF-8 BOM），扩展名与内容一致，可用 Excel 直接打开 */
export function buildBatchNormativeRefJobReferencesCsv(job: BatchNormativeRefJobOut): string {
  const headerLine = CSV_HEADERS_ZH.map((h) => escapeCsvCell(h)).join(',')
  const lines: string[] = [headerLine]
  const flat = flattenExportRows(job)

  for (const row of flat) {
    lines.push(
      FULL_COLUMNS.map((c) => {
        const v = getCellValue(row, c.key)
        return typeof v === 'number' ? String(v) : escapeCsvCell(v)
      }).join(','),
    )
  }

  const body = lines.join('\r\n')
  return `\ufeff${body}`
}

/** 生成完整 .xlsx：「与现行主号不一致」行在「本条引用是否与现行一致 / 状态 / 需重点核对」列标红加粗 */
export async function downloadBatchNormativeRefJobReferencesXlsx(job: BatchNormativeRefJobOut) {
  const flat = flattenExportRows(job)
  await writeXlsxFromFlat(flat, FULL_COLUMNS, safeDownloadFilename(job, '.xlsx'))
}

/** 简明 .xlsx：去掉「状态」「需重点核对」「说明/谱系」，不一致行仅在「本条引用是否与现行一致」列标红 */
export async function downloadBatchNormativeRefJobReferencesXlsxSimplified(job: BatchNormativeRefJobOut) {
  const flat = flattenExportRows(job)
  await writeXlsxFromFlat(flat, SIMPLIFIED_COLUMNS, safeDownloadFilename(job, '-简明.xlsx'))
}

function formatQbTitleLine(qbName: string, qbCode: string): string {
  const name = qbName.trim()
  const code = qbCode.trim()
  if (name && code) return `《${name}》（${code}）`
  if (name) return `《${name}》`
  if (code) return `（${code}）`
  return '—'
}

const MISMATCH_COMPANIES_PER_EPISODE = 10
/** 文字段 3：每家企业最多展示的「引用标准 / 现行有效」组数 */
const MAX_MISMATCH_REFS_PER_COMPANY = 2

/** 文字段 1：固定文案模板（X / XX 为字面占位，导出时不替换为真实数据） */
const TEXT_BLOCK_1_TEMPLATE = `企业标准健康体检通报2026年第XX期
涉及XX省、XX省等地企业
2026年X月XX日，中科标准开展了2026年第X批企标健康体检，发现部分引用的规范性文件已修订、废止或被替代，存在健康隐患，其中有涉及XX、XX、XX等地企业，提醒以下企业及时核对`

type MismatchRefPair = { historical: string; latest: string }

type CompanyQbMismatchBlock = {
  qbName: string
  qbCode: string
  refs: MismatchRefPair[]
}

type CompanyMismatchGroup = {
  company: string
  location: string
  qbBlocks: CompanyQbMismatchBlock[]
}

function hasExportableCompanyName(company: string): boolean {
  const name = company.trim()
  if (!name) return false
  if (name === '—' || name === '（未命名企业）') return false
  return true
}

function companyNameOnly(group: CompanyMismatchGroup): string {
  return group.company.trim()
}

function buildTextBlock1(): string {
  return TEXT_BLOCK_1_TEMPLATE
}

/** 文字段 2：企业名单（仅公司名，每家之间空一行） */
function buildTextBlock2(chunk: CompanyMismatchGroup[]): string {
  return chunk.map(companyNameOnly).join('\n\n')
}

/** 文字段 3：不一致明细（顺序与文字段 2 一致；每企最多 2 组引用标准） */
function buildTextBlock3(chunk: CompanyMismatchGroup[]): string {
  const companyBlocks: string[] = []
  for (const group of chunk) {
    const lines: string[] = [companyNameOnly(group)]
    let refPairsShown = 0
    for (const qb of group.qbBlocks) {
      if (refPairsShown >= MAX_MISMATCH_REFS_PER_COMPANY) break
      lines.push(formatQbTitleLine(qb.qbName, qb.qbCode))
      for (const ref of qb.refs) {
        if (refPairsShown >= MAX_MISMATCH_REFS_PER_COMPANY) break
        lines.push(`引用标准：${ref.historical}`)
        lines.push(`现行有效：${ref.latest}`)
        refPairsShown += 1
      }
    }
    companyBlocks.push(lines.join('\n'))
  }
  return companyBlocks.join('\n\n')
}

function buildEpisodeSeparator(episodeIndex: number, companyCount: number): string {
  if (companyCount >= MISMATCH_COMPANIES_PER_EPISODE) {
    return `=======该批次可做的第${episodeIndex}期素材======`
  }
  return `=======该批次可做的第${episodeIndex}期素材（不够，${companyCount}家公司）======`
}

/** 按企业聚合不一致引用（同一企业多份企标合并，不按文件序号拆分） */
function buildCompanyMismatchGroups(job: BatchNormativeRefJobOut): CompanyMismatchGroup[] {
  const order: string[] = []
  const map = new Map<string, CompanyMismatchGroup>()

  for (const item of job.items) {
    if (item.status !== 'completed') continue

    const company = pickCompanyForItem(item, job).trim()
    if (!hasExportableCompanyName(company)) continue

    const location = pickLocationForItem(item)
    const qbName = pickQbStandardTitle(item) || pickQbShortName(item)
    const qbCode = pickQbCode(item)
    const qbKey = `${qbCode}::${qbName}`

    const resolved = hasResolvedReferenceRows(item)
      ? mapReferencesResolvedToStandardLatestResults(item.references_resolved)
      : []
    const mismatches = resolved.filter(isCitationMainNumberMismatch)
    if (mismatches.length === 0) continue

    let group = map.get(company)
    if (!group) {
      group = { company, location: location.trim(), qbBlocks: [] }
      map.set(company, group)
      order.push(company)
    } else if (!group.location && location.trim()) {
      group.location = location.trim()
    }

    let qbBlock = group.qbBlocks.find((b) => `${b.qbCode}::${b.qbName}` === qbKey)
    if (!qbBlock) {
      qbBlock = { qbName, qbCode, refs: [] }
      group.qbBlocks.push(qbBlock)
    }

    for (const r of mismatches) {
      qbBlock.refs.push({
        historical: String(r.historicalFullStdCode ?? '').trim() || '—',
        latest: buildLatestStandardCellFromRow(r).trim() || '—',
      })
    }
  }

  return order.map((key) => map.get(key)!).filter((g) => hasExportableCompanyName(g.company))
}

/**
 * 不一致引用清单（纯文本）：
 * 每期素材 = 文字段1 + 文字段2 + 文字段3（每段最多 10 家企业，按企业聚合且 2、3 顺序一致）。
 */
export function buildBatchNormativeRefMismatchSummaryText(job: BatchNormativeRefJobOut): string {
  const groups = buildCompanyMismatchGroups(job)
  if (groups.length === 0) {
    return '本批次无与现行主号不一致的引用（仅统计可自动比对且 citation_matches_latest 为 false 的条目）。'
  }

  const parts: string[] = []
  let episodeIndex = 0

  for (let start = 0; start < groups.length; start += MISMATCH_COMPANIES_PER_EPISODE) {
    episodeIndex += 1
    const chunk = groups.slice(start, start + MISMATCH_COMPANIES_PER_EPISODE)

    if (episodeIndex > 1) {
      parts.push('')
      parts.push(buildEpisodeSeparator(episodeIndex, chunk.length))
      parts.push('')
    }

    parts.push(buildTextBlock1())
    parts.push('')
    parts.push(buildTextBlock2(chunk))
    parts.push('')
    parts.push(buildTextBlock3(chunk))
  }

  return parts.join('\n').trimEnd()
}

export function downloadBatchNormativeRefMismatchSummaryTxt(job: BatchNormativeRefJobOut) {
  const text = buildBatchNormativeRefMismatchSummaryText(job)
  const blob = new Blob([`\ufeff${text}`], { type: 'text/plain;charset=utf-8' })
  triggerBlobDownload(blob, safeDownloadFilename(job, '-不一致引用清单.txt'))
}

/** @deprecated 请使用 {@link downloadBatchNormativeRefJobReferencesXlsx}；保留供脚本或需纯文本 CSV 时调用 */
export function downloadBatchNormativeRefJobReferencesCsv(job: BatchNormativeRefJobOut) {
  const csv = buildBatchNormativeRefJobReferencesCsv(job)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  triggerBlobDownload(blob, safeDownloadFilename(job, '.csv'))
}
