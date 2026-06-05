/** Dify② 写入的 indexes 数组元素（见后端 dify_contracts） */
export type IndexContentPair = {
  id: string
  key: string
  value: string
}

/** 指标内容编辑模型：键值对（常见）或整段文字（引用类描述） */
export type IndexContentEdit =
  | { mode: 'pairs'; pairs: IndexContentPair[] }
  | { mode: 'plain'; text: string }

export type ParsedNationalIndexEntry = {
  key: string
  indexName: string
  indexType: string
  indexContent: IndexContentEdit
}

export type NationalIndicatorRecordView = {
  id: string
  stdCode: string
  manualReviewStatus: 'pending' | 'approved' | 'rejected' | null
  indexes: ParsedNationalIndexEntry[]
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

let pairSeq = 0

export function createEmptyContentPair(): IndexContentPair {
  pairSeq += 1
  return { id: `pair-${Date.now()}-${pairSeq}`, key: '', value: '' }
}

function normalizeIndexContentRaw(content: unknown): unknown {
  if (content == null) return null
  if (typeof content === 'string') {
    const t = content.trim()
    if (!t || t === '—') return null
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.parse(t)
      } catch {
        return t
      }
    }
    return t
  }
  return content
}

function valueToEditString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function valueToDisplayString(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v.trim() || '—'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function isFlatScalarRecord(obj: Record<string, unknown>): boolean {
  return Object.values(obj).every(
    (v) =>
      v == null ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean',
  )
}

/** 后端 index_content → 可编辑结构 */
export function parseIndexContentToEdit(content: unknown): IndexContentEdit {
  const raw = normalizeIndexContentRaw(content)
  if (raw == null) {
    return { mode: 'pairs', pairs: [createEmptyContentPair()] }
  }
  if (typeof raw === 'string') {
    return { mode: 'plain', text: raw }
  }
  if (Array.isArray(raw)) {
    return { mode: 'plain', text: raw.map((item) => valueToDisplayString(item)).join('\n') }
  }
  const rec = asRecord(raw)
  if (!rec) {
    return { mode: 'plain', text: String(raw) }
  }
  const entries = Object.entries(rec)
  if (entries.length === 0) {
    return { mode: 'pairs', pairs: [createEmptyContentPair()] }
  }
  if (isFlatScalarRecord(rec)) {
    return {
      mode: 'pairs',
      pairs: entries.map(([k, v], i) => ({
        id: `pair-${i}`,
        key: k,
        value: valueToEditString(v),
      })),
    }
  }
  return {
    mode: 'plain',
    text: entries.map(([k, v]) => `${k}：${valueToDisplayString(v)}`).join('\n'),
  }
}

/** 可编辑结构 → 写回后端的 index_content */
export function indexContentEditToPayload(edit: IndexContentEdit): unknown {
  if (edit.mode === 'plain') {
    const t = edit.text.trim()
    return t || '—'
  }
  const obj: Record<string, string> = {}
  for (const p of edit.pairs) {
    const k = p.key.trim()
    if (!k) continue
    obj[k] = p.value.trim()
  }
  const keys = Object.keys(obj)
  if (keys.length === 0) return '—'
  if (keys.length === 1) return obj
  return obj
}

/** 只读展示：项目：要求（无 JSON 引号/花括号） */
export function formatIndexContentForDisplay(content: unknown): string {
  const edit = parseIndexContentToEdit(content)
  return formatIndexContentEditForDisplay(edit)
}

export function formatIndexContentEditForDisplay(edit: IndexContentEdit): string {
  if (edit.mode === 'plain') {
    const t = edit.text.trim()
    return t || '—'
  }
  const lines = edit.pairs
    .filter((p) => p.key.trim() || p.value.trim())
    .map((p) => {
      const k = p.key.trim() || '—'
      const v = p.value.trim() || '—'
      return `${k}：${v}`
    })
  return lines.length > 0 ? lines.join('\n') : '—'
}

export function cloneIndexContentEdit(edit: IndexContentEdit): IndexContentEdit {
  if (edit.mode === 'plain') {
    return { mode: 'plain', text: edit.text }
  }
  return {
    mode: 'pairs',
    pairs: edit.pairs.map((p, i) => ({
      id: p.id || `pair-${i}`,
      key: p.key,
      value: p.value,
    })),
  }
}

/** 整段文字拆成键值对（用于编辑内切换） */
export function plainTextToPairsEdit(text: string): IndexContentEdit {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) {
    return { mode: 'pairs', pairs: [createEmptyContentPair()] }
  }
  const pairs: IndexContentPair[] = lines.map((line, i) => {
    const cn = line.indexOf('：')
    const en = line.indexOf(':')
    let sep = -1
    if (cn >= 0 && (en < 0 || cn <= en)) sep = cn
    else if (en >= 0) sep = en
    if (sep >= 0) {
      return {
        id: `pair-${i}`,
        key: line.slice(0, sep).trim(),
        value: line.slice(sep + 1).trim(),
      }
    }
    return { id: `pair-${i}`, key: '', value: line }
  })
  return { mode: 'pairs', pairs }
}

export function pairsEditToPlainText(edit: IndexContentEdit): string {
  if (edit.mode === 'plain') return edit.text
  return edit.pairs
    .filter((p) => p.key.trim() || p.value.trim())
    .map((p) => {
      const k = p.key.trim()
      const v = p.value.trim()
      if (k && v) return `${k}：${v}`
      return v || k
    })
    .join('\n')
}

function parseIndexesFromPayload(payload: string): ParsedNationalIndexEntry[] {
  const trimmed = payload.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed)) return []
    const out: ParsedNationalIndexEntry[] = []
    for (let i = 0; i < parsed.length; i += 1) {
      const raw = parsed[i]
      const r = asRecord(raw)
      if (!r) continue
      out.push({
        key: `idx-${i}`,
        indexName: String(r.index_name ?? r.name ?? '—'),
        indexType: String(r.index_type ?? r.type ?? '—'),
        indexContent: parseIndexContentToEdit(r.index_content ?? r.content),
      })
    }
    return out
  } catch {
    return [
      {
        key: 'idx-0',
        indexName: '原始内容',
        indexType: '—',
        indexContent: { mode: 'plain', text: trimmed },
      },
    ]
  }
}

/** 编辑后序列化为 Dify② indexes JSON 字符串（写入 specific_indicator_value） */
export function serializeIndexesToPayload(entries: ParsedNationalIndexEntry[]): string {
  const arr = entries.map((entry) => ({
    index_name: entry.indexName.trim() || '—',
    index_type: entry.indexType.trim() || '其他',
    index_content: indexContentEditToPayload(entry.indexContent),
  }))
  return JSON.stringify(arr)
}

export function cloneIndexEntries(entries: ParsedNationalIndexEntry[]): ParsedNationalIndexEntry[] {
  return entries.map((e, i) => ({
    key: e.key || `idx-${i}`,
    indexName: e.indexName,
    indexType: e.indexType,
    indexContent: cloneIndexContentEdit(e.indexContent),
  }))
}

let newEntrySeq = 0

export function createEmptyIndexEntry(): ParsedNationalIndexEntry {
  newEntrySeq += 1
  return {
    key: `idx-new-${Date.now()}-${newEntrySeq}`,
    indexName: '',
    indexType: '',
    indexContent: { mode: 'pairs', pairs: [createEmptyContentPair()] },
  }
}

/** 将 ensure 返回的 `national_by_std_code[std]` 行转为可展示结构 */
export function buildNationalIndicatorRecordView(
  stdCode: string,
  rawRows: unknown[] | undefined,
): NationalIndicatorRecordView | null {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return null
  const first = asRecord(rawRows[0])
  if (!first) return null
  const id = String(first.id ?? `nat-${stdCode}`)
  const payload = String(first.specific_indicator_value ?? first.index_value ?? '')
  const statusRaw = first.manual_review_status ?? first.manualReviewStatus
  const manualReviewStatus =
    statusRaw === 'pending' || statusRaw === 'approved' || statusRaw === 'rejected'
      ? statusRaw
      : statusRaw != null && String(statusRaw).trim()
        ? (String(statusRaw).trim() as NationalIndicatorRecordView['manualReviewStatus'])
        : null

  return {
    id,
    stdCode,
    manualReviewStatus,
    indexes: parseIndexesFromPayload(payload),
  }
}
