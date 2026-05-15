import React from 'react'
import { Space, Tag, Typography } from 'antd'

const { Text } = Typography

function tryPrettyJson(s: string): string | null {
  const t = s.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return null
  try {
    const o = JSON.parse(t) as unknown
    return JSON.stringify(o, null, 2)
  } catch {
    return null
  }
}

/** 将连续的 `{..}{..}` 谱系片段拆成多段，便于分行展示 */
function splitPedigreeSegments(s: string): string[] {
  const t = s.trim()
  if (!t) return []
  const withBreaks = t.replace(/\}\s*\{/g, '}\n__SEG__\n{')
  const parts = withBreaks.split('\n__SEG__\n').map((x) => x.trim()).filter(Boolean)
  if (parts.length > 1) return parts
  /** 单段极长时，在 `{[` 前换行，缓解「一坨」观感 */
  if (t.length > 80) {
    return t
      .split(/\n/)
      .flatMap((line) => line.replace(/\{\[/g, '\n{[').split('\n'))
      .map((x) => x.trim())
      .filter(Boolean)
  }
  return [t]
}

/** 从原文中抽取常见标准号，用于顶部 Tag 条（去重） */
function extractStandardCodesFromPedigreeText(s: string): string[] {
  const re =
    /GB\s*\/\s*T\s*[\d.\u2013\u2014\-]+(?:-[\d]+)?|GB\s*\/\s*[\d.\u2013\u2014\-]+(?:-[\d]+)?|GB\s+[\d.\u2013\u2014\-]+(?:-[\d]+)?|Q\s*\/[^\s、}\],]+/gi
  const raw = s.match(re) ?? []
  const norm = raw.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return [...new Set(norm)]
}

/**
 * 将后端 `explanation`（pedigreeChain）长串渲染为有条理的 Tooltip 内容：
 * - 若为合法 JSON，则 pretty-print；
 * - 否则拆段 + 等宽小字块；并尽量抽出 GB/Q 标准号用 Tag 展示。
 */
export function renderPedigreeExplanationBody(text: string): React.ReactNode {
  const t = text.trim()
  if (!t) return null

  const pretty = tryPrettyJson(t)
  if (pretty) {
    return (
      <pre
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 11,
          lineHeight: 1.55,
          maxHeight: 260,
          overflow: 'auto',
        }}
      >
        {pretty}
      </pre>
    )
  }

  const codes = extractStandardCodesFromPedigreeText(t)
  const segments = splitPedigreeSegments(t)

  return (
    <div style={{ maxWidth: 420 }}>
      {codes.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
            涉及标准号（自动抽取）
          </Text>
          <Space wrap size={[4, 4]}>
            {codes.map((c) => (
              <Tag key={c} style={{ margin: 0, fontSize: 11 }}>
                {c}
              </Tag>
            ))}
          </Space>
        </div>
      ) : null}
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
        谱系 / 过程（已分段）
      </Text>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {segments.map((seg, i) => (
          <div
            key={`${i}-${seg.slice(0, 12)}`}
            style={{
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 8,
              fontSize: 11,
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {seg}
          </div>
        ))}
      </Space>
    </div>
  )
}

/** 将谱系/说明导出为纯文本（分段换行，与界面 Tooltip 分段逻辑一致），用于 CSV 等 */
export function formatPedigreePlainForCsv(text: string): string {
  const t = (text || '').trim()
  if (!t) return ''
  const pretty = tryPrettyJson(t)
  if (pretty) return pretty
  const codes = extractStandardCodesFromPedigreeText(t)
  const segments = splitPedigreeSegments(t)
  const parts: string[] = []
  if (codes.length > 0) {
    parts.push(`涉及标准号：${codes.join('、')}`)
  }
  parts.push(...segments)
  return parts.join('\n---\n')
}
