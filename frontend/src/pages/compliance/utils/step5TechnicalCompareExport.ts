import type { ComparePreviewRow } from '@/pages/compliance/comparison-types'
import {
  buildNationalIndicatorRecordView,
  formatIndexContentEditForDisplay,
} from '@/pages/compliance/utils/parseNationalIndicatorValue'
import { downloadBlob } from '@/utils/download'
import type { PendingIndexItem } from '@/services/compliance'
import type { StandardLatestCheckResult } from '@/services/compliance'

export type Step5WorkbookExportInput = {
  enterpriseBzId: string
  /** 第 3 步「企标指标提取结果」中已审核通过的行 */
  enterpriseQbIndicators: PendingIndexItem[]
  comparableReferences: StandardLatestCheckResult[]
  supplementStdCodes: string[]
  nationalByStdCode: Record<string, unknown[]>
  comparePreview: ComparePreviewRow[]
}

const SHEET1_SECTION_QB = 'A. 企标指标（第3步审核后）'
const SHEET1_SECTION_PUB_GB = 'B. 发布时点引用国标指标'

type FlatNationalIndicatorRow = {
  indexName: string
  indexType: string
  content: string
}

function safeFilenameSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim() || '未填企标号'
}

/** 第 3 步企标指标：仅导出已审核通过（不含驳回） */
export function filterApprovedEnterpriseIndicators(rows: PendingIndexItem[]): PendingIndexItem[] {
  return rows.filter((row) => {
    const status = row.statusText.trim()
    if (!status) return false
    if (status.includes('驳回')) return false
    return status.includes('审核通过') || (status.includes('通过') && !status.includes('待'))
  })
}

function flattenStdIndicators(stdCode: string, rawRows: unknown[] | undefined): FlatNationalIndicatorRow[] {
  const code = stdCode.trim()
  if (!code || !Array.isArray(rawRows) || rawRows.length === 0) return []
  const view = buildNationalIndicatorRecordView(code, rawRows)
  if (!view) return []
  const out: FlatNationalIndicatorRow[] = []
  for (const idx of view.indexes) {
    out.push({
      indexName: idx.indexName,
      indexType: idx.indexType,
      content: formatIndexContentEditForDisplay(idx.indexContent),
    })
  }
  return out
}

function buildSheet1EnterpriseAndPublicationRows(input: Step5WorkbookExportInput): (string | number)[][] {
  const { enterpriseBzId, enterpriseQbIndicators, comparableReferences, nationalByStdCode } = input
  const qb = enterpriseBzId.trim() || '—'
  const rows: (string | number)[][] = []
  const approved = filterApprovedEnterpriseIndicators(enterpriseQbIndicators)

  if (approved.length === 0) {
    rows.push([SHEET1_SECTION_QB, qb, '—', '—', '—', '—', '—', '—', '（暂无已审核通过的企标指标）'])
  } else {
    for (const item of approved) {
      rows.push([
        SHEET1_SECTION_QB,
        qb,
        '—',
        '—',
        '—',
        item.indicatorName.trim() || '—',
        '—',
        item.indicatorValue.trim() || '—',
        item.statusText.trim() || '—',
      ])
    }
  }

  for (const ref of comparableReferences) {
    const pub = (ref.historicalFullStdCode ?? '').trim()
    const latest = ref.currentLatestId.trim()
    const query = ref.queryBzId.trim()
    const indicators = flattenStdIndicators(pub, nationalByStdCode[pub])
    if (indicators.length === 0) {
      rows.push([
        SHEET1_SECTION_PUB_GB,
        qb,
        query || '—',
        pub || '—',
        latest || '—',
        '—',
        '—',
        '（暂无国标指标数据）',
        '—',
      ])
      continue
    }
    for (const ind of indicators) {
      rows.push([
        SHEET1_SECTION_PUB_GB,
        qb,
        query || '—',
        pub || '—',
        latest || '—',
        ind.indexName,
        ind.indexType,
        ind.content,
        '—',
      ])
    }
  }

  return rows
}

function addSheet(
  workbook: import('exceljs').Workbook,
  name: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.addRow(headers)
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    }
  })
  for (const row of rows) {
    sheet.addRow(row)
  }
  sheet.columns = headers.map((h) => ({ width: Math.min(48, Math.max(12, h.length + 4)) }))
}

/**
 * 导出第五步技术指标对比工作簿（3 个子表）。
 * 子表1：企标指标（第3步审核）+ 发布时点引用国标指标。
 */
export async function downloadStep5TechnicalCompareWorkbook(
  input: Step5WorkbookExportInput,
): Promise<void> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  workbook.creator = '合规性评价平台'
  workbook.created = new Date()

  const { enterpriseBzId, comparableReferences, supplementStdCodes, nationalByStdCode, comparePreview } =
    input

  const sheet1Rows = buildSheet1EnterpriseAndPublicationRows(input)

  addSheet(workbook, '企标与发布时点指标', [
    '数据分区',
    '企标号',
    '企标引用标准号',
    '发布时引用完整国标号',
    '最新标准号',
    '指标名称',
    '类型',
    '指标内容',
    '审核状态',
  ], sheet1Rows)

  const sheet2Rows: (string | number)[][] = []
  const latestCodes = [
    ...new Set(comparableReferences.map((r) => r.currentLatestId.trim()).filter(Boolean)),
  ]
  for (const code of supplementStdCodes) {
    const indicators = flattenStdIndicators(code, nationalByStdCode[code])
    if (indicators.length === 0) {
      sheet2Rows.push(['M（补充标准）', code, '—', '—', '—', '（暂无指标数据）'])
      continue
    }
    for (const ind of indicators) {
      sheet2Rows.push(['M（补充标准）', code, ind.indexName, ind.indexType, ind.content])
    }
  }
  for (const code of latestCodes) {
    const indicators = flattenStdIndicators(code, nationalByStdCode[code])
    if (indicators.length === 0) {
      sheet2Rows.push(['N（最新标准）', code, '—', '—', '—', '（暂无指标数据）'])
      continue
    }
    for (const ind of indicators) {
      sheet2Rows.push(['N（最新标准）', code, ind.indexName, ind.indexType, ind.content])
    }
  }

  addSheet(workbook, 'M与N标准指标', [
    '标准角色',
    '标准号',
    '指标名称',
    '类型',
    '指标内容',
  ], sheet2Rows)

  const sheet3Rows = comparePreview.map((row, index) => [
    row.rowNo && row.rowNo !== '—' ? row.rowNo : index + 1,
    row.indicatorCategory ?? '—',
    row.indicatorName,
    row.enterpriseValue,
    row.referenceStdCode ?? '—',
    row.matchedStandard,
    row.nationalValue,
    row.compareNote ?? row.latestStandard ?? row.baselineStandard ?? '—',
  ])

  addSheet(workbook, '技术指标对比明细', [
    '序号',
    '指标类别',
    '指标名称',
    '企标限值',
    '规范性引用标准号',
    '国标限值',
    '单项结果',
    '判决备注',
  ], sheet3Rows)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const bz = safeFilenameSegment(enterpriseBzId)
  downloadBlob(blob, `合规评价-技术指标对比-${bz}-${Date.now()}.xlsx`)
}
