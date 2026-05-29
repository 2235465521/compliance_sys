import type { ComparePreviewRow } from '@/pages/compliance/comparison-types'

function cellText(raw: string): string {
  return raw.replace(/^\||\|$/g, '').trim()
}

function parseMarkdownRowCells(line: string): string[] {
  return line
    .split('|')
    .map(cellText)
    .filter((c, idx, arr) => {
      if (idx === 0 && arr[0] === '') return false
      if (idx === arr.length - 1 && arr[arr.length - 1] === '') return false
      return true
    })
}

function findColIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex((h) => keywords.some((k) => h.includes(k)))
}

function pickCell(cells: string[], index: number): string {
  if (index < 0 || index >= cells.length) return '—'
  const v = cells[index]?.trim()
  if (!v || v === '—' || v === '-') return '—'
  return v
}

/** Dify③ 标准表头：序号 | 指标类别 | 指标名称 | 企标限值 | 规范性引用标准号 | 国标限值 | 单项结果 | 判决备注 */
function mapMarkdownRowByHeaders(headerCells: string[], cells: string[], rowId: string): ComparePreviewRow {
  const iSeq = findColIndex(headerCells, ['序号', '序', '编号'])
  const iCategory = findColIndex(headerCells, ['指标类别', '类别'])
  const iName = findColIndex(headerCells, ['指标名称', '指标名'])
  const iEnt = findColIndex(headerCells, ['企标限值', '企标指标', '企标', '本标准', '旧基线'])
  const iRef = findColIndex(headerCells, ['规范性引用标准号', '规范性引用', '引用标准号', '引用标准'])
  const iNat = findColIndex(headerCells, ['国标限值', '国标指标', '现行标准指标', '国标'])
  const iResult = findColIndex(headerCells, ['单项结果', '单项结论', '结论'])
  const iNote = findColIndex(headerCells, ['判决备注', '判定备注', '备注', '比对说明'])

  const singleResult = pickCell(cells, iResult)

  return {
    id: rowId,
    rowNo: iSeq >= 0 ? pickCell(cells, iSeq) : undefined,
    indicatorCategory: iCategory >= 0 ? pickCell(cells, iCategory) : undefined,
    indicatorName: iName >= 0 ? pickCell(cells, iName) : pickCell(cells, iCategory >= 0 ? iCategory + 1 : 0),
    enterpriseValue: pickCell(cells, iEnt),
    referenceStdCode: iRef >= 0 ? pickCell(cells, iRef) : undefined,
    matchedStandard: pickCell(cells, iNat),
    nationalValue: singleResult,
    status: singleResult,
    compareNote: iNote >= 0 ? pickCell(cells, iNote) : undefined,
    source: 'enterprise_or_old',
  }
}

/** 解析 Dify③ compare_result.markdown 对比表 */
export function parseCompareMarkdownTable(markdown: string): ComparePreviewRow[] {
  const lines = markdown.split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean)
  const tableLines = lines.filter((ln) => ln.includes('|'))
  if (tableLines.length < 2) return []

  const headerCells = parseMarkdownRowCells(tableLines[0])
  const dataStart = tableLines[1]?.replace(/[-:\s|]/g, '').length === 0 ? 2 : 1

  const isDifyWorkflow3 =
    findColIndex(headerCells, ['指标名称']) >= 0 &&
    (findColIndex(headerCells, ['企标限值']) >= 0 || findColIndex(headerCells, ['企标']) >= 0)

  const rows: ComparePreviewRow[] = []
  for (let i = dataStart; i < tableLines.length; i += 1) {
    const cells = parseMarkdownRowCells(tableLines[i])
    if (cells.length === 0 || cells.every((c) => !c || /^[-—]+$/.test(c))) continue

    if (isDifyWorkflow3 || findColIndex(headerCells, ['指标名称']) >= 0) {
      rows.push(mapMarkdownRowByHeaders(headerCells, cells, `cmp-md-${i}`))
      continue
    }

    // 旧版表头兜底
    const iSeq = findColIndex(headerCells, ['序号'])
    const iName = findColIndex(headerCells, ['指标名称', '指标名', '名称'])
    const iEnt = findColIndex(headerCells, ['企标', '本标准', '旧基线'])
    const iNat = findColIndex(headerCells, ['国标', '现行'])
    const iMatch = findColIndex(headerCells, ['匹配情况', '匹配'])
    const iResult = findColIndex(headerCells, ['单项结论', '单项结果', '结论'])
    const iNote = findColIndex(headerCells, ['备注', '比对标准', '判决备注'])

    rows.push({
      id: `cmp-md-${i}`,
      rowNo: iSeq >= 0 ? pickCell(cells, iSeq) : undefined,
      indicatorName: iName >= 0 ? pickCell(cells, iName) : pickCell(cells, 0),
      enterpriseValue: pickCell(cells, iEnt),
      matchedStandard: pickCell(cells, iNat),
      status: iMatch >= 0 ? pickCell(cells, iMatch) : pickCell(cells, iResult),
      nationalValue: pickCell(cells, iResult),
      compareNote: iNote >= 0 ? pickCell(cells, iNote) : undefined,
      source: 'enterprise_or_old',
    })
  }

  return rows
}

export function parseStep5CompareResultToRows(
  compareResult: Record<string, unknown> | null | undefined,
): ComparePreviewRow[] {
  if (!compareResult || typeof compareResult !== 'object') return []

  const details = compareResult.details
  if (Array.isArray(details) && details.length > 0) {
    return details.map((raw, index) => {
      const d = raw as Record<string, unknown>
      const compareNote = String(
        d.judgment_note ??
          d.decision_note ??
          d.compare_note ??
          d.note ??
          d['判决备注'] ??
          d.remark ??
          '',
      ).trim()
      const singleResult = String(
        d.single_result ??
          d.result ??
          d.conclusion ??
          d['单项结果'] ??
          d['单项结论'] ??
          '—',
      )
      return {
        id: String(d.id ?? `cmp-detail-${index}`),
        rowNo: d.row_no != null ? String(d.row_no) : d['序号'] != null ? String(d['序号']) : undefined,
        indicatorCategory: String(
          d.indicator_category ?? d.category ?? d['指标类别'] ?? '',
        ).trim() || undefined,
        indicatorName: String(
          d.indicator_name ?? d.index_name ?? d.name ?? d['指标名称'] ?? '—',
        ),
        enterpriseValue: String(
          d.enterprise_value ??
            d.qb_limit ??
            d.qb_value ??
            d['企标限值'] ??
            d['企标指标值'] ??
            '—',
        ),
        referenceStdCode: String(
          d.reference_std_code ??
            d.normative_ref_std ??
            d['规范性引用标准号'] ??
            '',
        ).trim() || undefined,
        matchedStandard: String(
          d.national_limit ??
            d.national_value ??
            d.latest_value ??
            d['国标限值'] ??
            d['国标指标值'] ??
            '—',
        ),
        nationalValue: singleResult,
        status: String(d.match_status ?? d.status ?? d['匹配情况'] ?? singleResult),
        compareNote: compareNote || undefined,
        source: 'enterprise_or_old' as const,
      }
    })
  }

  const markdown = typeof compareResult.markdown === 'string' ? compareResult.markdown : ''
  if (markdown.trim()) {
    const fromMd = parseCompareMarkdownTable(markdown)
    if (fromMd.length > 0) return fromMd
  }

  const summary = typeof compareResult.summary === 'string' ? compareResult.summary.trim() : ''
  if (summary) {
    return [
      {
        id: 'cmp-summary-only',
        indicatorName: '对比摘要',
        enterpriseValue: '—',
        matchedStandard: '—',
        status: summary,
        nationalValue: summary,
        source: 'enterprise_or_old',
      },
    ]
  }

  return []
}
