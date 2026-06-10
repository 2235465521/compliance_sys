import type { ComparePreviewRow } from '@/pages/compliance/comparison-types'
import { downloadBlob } from '@/utils/download'
import type {
  BatchIndicatorCompareItemOut,
  BatchIndicatorCompareJobOut,
} from '@/types/batch-indicator-compare'
import { mapCompareResultToPreviewRows, pickCompareSummary } from '@/pages/batch-indicator-compare/mapIndicatorCompareItem'
import { batchIndicatorCompareItemStatusMeta } from '@/pages/batch-indicator-compare/batchIndicatorCompareStatusLabels'

function safeFilenameSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim() || 'batch-indicator-compare'
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

function summaryRowsFromJob(job: BatchIndicatorCompareJobOut): (string | number)[][] {
  return (job.items ?? []).map((item) => [
    item.subject_code?.trim() || '—',
    item.subject_name?.trim() || '—',
    item.original_filename?.trim() || '—',
    batchIndicatorCompareItemStatusMeta(item.indicator_compare_status).label,
    item.compare_summary?.trim() || '—',
    item.skip_reason?.trim() || item.error_message?.trim() || '—',
  ])
}

function detailRowsFromItem(item: BatchIndicatorCompareItemOut, rows: ComparePreviewRow[]): (string | number)[][] {
  const qb = item.subject_code?.trim() || '—'
  const company = item.company_name?.trim() || '—'
  if (rows.length === 0) {
    return [[qb, company, '—', '—', '—', '—', '—', '—', pickCompareSummary(item) || '无明细']]
  }
  return rows.map((r) => [
    qb,
    company,
    r.rowNo ?? '—',
    r.indicatorCategory ?? '—',
    r.indicatorName,
    r.enterpriseValue,
    r.referenceStdCode ?? '—',
    r.matchedStandard,
    r.nationalValue,
    r.compareNote ?? '—',
  ])
}

export async function downloadBatchIndicatorCompareJobXlsx(
  job: BatchIndicatorCompareJobOut,
  itemDetails?: BatchIndicatorCompareItemOut[],
): Promise<void> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  workbook.creator = '合规性评价平台'
  workbook.created = new Date()

  addSheet(workbook, '任务汇总', ['企标号', '企标名', '文件名', '对比状态', '摘要', '跳过或失败原因'], summaryRowsFromJob(job))

  const details = itemDetails ?? []
  const detailRows: (string | number)[][] = []
  for (const item of details) {
    const preview = mapCompareResultToPreviewRows(item.compare_result)
    detailRows.push(...detailRowsFromItem(item, preview))
  }
  if (detailRows.length === 0) {
    for (const summary of job.items ?? []) {
      detailRows.push([
        summary.subject_code?.trim() || '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        summary.compare_summary?.trim() || '（子项明细未加载）',
      ])
    }
  }

  addSheet(workbook, '指标对比明细', [
    '企标号',
    '公司名',
    '序号',
    '指标类别',
    '指标名称',
    '企标限值',
    '引用国标号',
    '国标限值',
    '单项结果',
    '判决备注',
  ], detailRows)

  const buffer = await workbook.xlsx.writeBuffer()
  const label = (job.label ?? `job-${job.id}`).trim()
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${safeFilenameSegment(label)}-指标对比.xlsx`,
  )
}

export async function downloadBatchIndicatorCompareItemXlsx(item: BatchIndicatorCompareItemOut): Promise<void> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  const rows = mapCompareResultToPreviewRows(item.compare_result)
  addSheet(
    workbook,
    '指标对比',
    ['序号', '指标类别', '指标名称', '企标限值', '引用国标号', '国标限值', '单项结果', '判决备注'],
    rows.map((r) => [
      r.rowNo ?? '—',
      r.indicatorCategory ?? '—',
      r.indicatorName,
      r.enterpriseValue,
      r.referenceStdCode ?? '—',
      r.matchedStandard,
      r.nationalValue,
      r.compareNote ?? '—',
    ]),
  )
  const buffer = await workbook.xlsx.writeBuffer()
  const qb = item.subject_code?.trim() || `item-${item.id}`
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${safeFilenameSegment(qb)}-指标对比.xlsx`,
  )
}
