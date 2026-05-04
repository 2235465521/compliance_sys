import { downloadBlob } from '@/utils/download'

function escapeCsvCell(value: string): string {
  let s = value ?? ''
  if (s.includes('"')) s = s.replace(/"/g, '""')
  if (/[",\n\r]/.test(s)) return `"${s}"`
  return s
}

/** 表头为中文 label，取数用 key */
export function rowsToCsv(headers: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map((h) => escapeCsvCell(h.label)).join(',')
  const body = rows.map((row) =>
    headers.map((h) => escapeCsvCell(String(row[h.key] ?? ''))).join(','),
  )
  return [headerLine, ...body].join('\r\n')
}

function twoColMetaRows(rows: [string, string][]): string {
  return rows.map(([a, b]) => `${escapeCsvCell(a)},${escapeCsvCell(b)}`).join('\r\n')
}

/** 带 UTF-8 BOM，便于 Excel 直接打开中文 */
export function downloadCsvText(filename: string, text: string) {
  downloadBlob(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' }), filename)
}

/** 第2步：描述性合规评价 — 单行结论表 */
export function downloadDescriptiveComplianceCsv(
  filename: string,
  payload: {
    bzId: string
    enterpriseName: string
    decision: string
    isCompliant: string
    nonComplianceReasons: string
    nonComplianceDetail: string
    reviewConclusion: string
    updatedAt: string
  },
) {
  const headers = [
    { key: 'bzId', label: '企标号' },
    { key: 'enterpriseName', label: '企业名称' },
    { key: 'firstReviewDecision', label: '第一次人工审核结论' },
    { key: 'isCompliant', label: '是否合规（表单）' },
    { key: 'nonComplianceReasons', label: '不合规原因（多选）' },
    { key: 'nonComplianceDetail', label: '不合规说明' },
    { key: 'reviewConclusion', label: '描述性评价结论（导出全文）' },
    { key: 'updatedAt', label: '最后更新时间' },
  ]
  const row = {
    bzId: payload.bzId,
    enterpriseName: payload.enterpriseName,
    firstReviewDecision: payload.decision,
    isCompliant: payload.isCompliant,
    nonComplianceReasons: payload.nonComplianceReasons,
    nonComplianceDetail: payload.nonComplianceDetail,
    reviewConclusion: payload.reviewConclusion,
    updatedAt: payload.updatedAt,
  }
  const meta = twoColMetaRows([
    ['导出模块', '合规性评价 / 第2步 描述性合规评价'],
    ['导出时间', new Date().toISOString()],
  ])
  const csv = `${meta}\r\n\r\n${rowsToCsv(headers, [row])}`
  downloadCsvText(filename, csv)
}

/** 第4步：引用标准有效性与更替 */
export function downloadReferenceValidityCsv(
  filename: string,
  meta: { bzId: string; validityReviewDecision: string; manualLatestStandardIds: string },
  tableRows: Array<{
    queryBzId: string
    isLatest: string
    currentLatestId: string
    pedigreeChain: string
  }>,
) {
  const metaBlock = twoColMetaRows([
    ['导出模块', '合规性评价 / 第4步 引用标准有效性与更替确认'],
    ['导出时间', new Date().toISOString()],
    ['企标号（上下文）', meta.bzId],
    ['人工审核数据状态', meta.validityReviewDecision],
    ['已新增最新标准编号', meta.manualLatestStandardIds],
  ])
  const headers = [
    { key: 'queryBzId', label: '引用标准' },
    { key: 'isLatest', label: '是否现行最新' },
    { key: 'currentLatestId', label: '现行标准编号' },
    { key: 'pedigreeChain', label: '更替谱系/说明' },
  ]
  const tableCsv =
    tableRows.length > 0 ? rowsToCsv(headers, tableRows as Record<string, unknown>[]) : '（无明细行）'
  downloadCsvText(filename, `${metaBlock}\r\n\r\n${tableCsv}`)
}

/** 第5步：指标映射与技术对比 */
export function downloadTechnicalCompareCsv(
  filename: string,
  meta: { bzId: string; comparisonAuditPassed: string },
  tableRows: Array<{
    indicatorName: string
    enterpriseValue: string
    matchedStandard: string
    nationalValue: string
    status: string
    source: string
    baselineStandard: string
    latestStandard: string
  }>,
) {
  const metaBlock = twoColMetaRows([
    ['导出模块', '合规性评价 / 第5步 指标映射与技术对比确认'],
    ['导出时间', new Date().toISOString()],
    ['企标号（上下文）', meta.bzId],
    ['技术对比人工审核', meta.comparisonAuditPassed],
  ])
  const headers = [
    { key: 'indicatorName', label: '指标名称' },
    { key: 'enterpriseValue', label: '本标准指标值' },
    { key: 'matchedStandard', label: '相关比对标准指标值' },
    { key: 'nationalValue', label: '单项结果' },
    { key: 'status', label: '匹配情况' },
    { key: 'source', label: '数据来源' },
    { key: 'baselineStandard', label: '基线标准（如有）' },
    { key: 'latestStandard', label: '备注/最新标准（如有）' },
  ]
  const tableCsv =
    tableRows.length > 0 ? rowsToCsv(headers, tableRows as Record<string, unknown>[]) : '（无对比明细）'
  downloadCsvText(filename, `${metaBlock}\r\n\r\n${tableCsv}`)
}

/** 第六步：模板化结论区单项文本报告（UTF-8 文本，非 CSV） */
export function downloadComplianceConclusionTextReport(
  filename: string,
  meta: { section: string; bzId: string },
  body: string,
) {
  const header = [
    `合规性评价 — ${meta.section}`,
    `企标号（上下文）：${meta.bzId}`,
    `导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '',
  ].join('\r\n')
  const text = `${header}${'—'.repeat(40)}\r\n\r\n${(body ?? '').trim() || '（无正文）'}\r\n`
  downloadBlob(new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8;' }), filename)
}

export function safeFilenameSegment(raw: string) {
  return (raw || '未填写').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 80)
}
