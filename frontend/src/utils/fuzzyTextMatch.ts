/** 模糊检索：忽略大小写，并弱化空格与常见标点差异（便于 GB/T 1.1-2020 搜「gb11」「1.1」等） */
export function normalizeForFuzzyMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s/\\._\-—–、，,;；:：()（）[\]【】]/g, '')
}

/**
 * 判断关键词是否匹配标准号/名称（子串 + 规范化子串 + 多词 AND）
 */
export function fuzzyMatchText(
  keyword: string,
  ...fields: string[]
): boolean {
  const k = keyword.trim()
  if (!k) return true

  const rawHay = fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const compactHay = normalizeForFuzzyMatch(rawHay)
  const rawKey = k.toLowerCase()
  const compactKey = normalizeForFuzzyMatch(k)

  if (rawHay.includes(rawKey)) return true
  if (compactKey && compactHay.includes(compactKey)) return true

  const tokens = k.split(/\s+/).filter(Boolean)
  if (tokens.length > 1) {
    return tokens.every(
      (token) =>
        rawHay.includes(token.toLowerCase()) ||
        compactHay.includes(normalizeForFuzzyMatch(token)),
    )
  }

  return false
}

export function filterByFuzzyKeyword<T extends { stdCode: string; stdName: string }>(
  items: T[],
  keyword: string,
): T[] {
  const k = keyword.trim()
  if (!k) return items
  return items.filter((item) => fuzzyMatchText(k, item.stdCode, item.stdName))
}
