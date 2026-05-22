import React from 'react'
import { Space, Tag, Typography } from 'antd'
import type { StandardLatestCheckResult } from '@/services/compliance'
import { renderPedigreeExplanationBody } from '@/pages/compliance/utils/pedigreeExplanationDisplay'

const { Text } = Typography

/** 审核 3：reference-latest 的 resolution_path 简要说明（联调/归类） */
const RESOLUTION_PATH_HINT: Record<string, string> = {
  historical_then_pedigree: '先国标历史再谱系推断',
  unresolved_no_historical_row: '国标库未推断到企标时点版本',
  direct_latest_match: '直接匹配现行',
  pedigree_direct: '谱系直接命中',
  pedigree_direct_miss: '谱系未命中',
  pedigree_only: '仅谱系推断',
  enterprise_std_as_anchor: '以企标为锚点',
  manual_review_non_gb: '非国标行（另册）',
  qb_enterprise_citation: '企标互引（另册）',
  missing_enterprise_qb_code: '缺企标号（另册）',
  sqlite_stub: '本地占位',
  empty: '空路径',
}

export function resolutionPathHint(path: string | null | undefined): string {
  if (path == null || path === '') return ''
  return RESOLUTION_PATH_HINT[path] ?? `解析路径：${path}`
}

const EXPLANATION_PREVIEW_MAX = 72

/** 接口 `explanation` 映射后的 `pedigreeChain`：表格第二行摘要（无则空串） */
export function buildValidityPedigreeExplanationPreview(row: StandardLatestCheckResult): string {
  const t = (row.pedigreeChain || '').trim()
  if (!t) return ''
  return t.length > EXPLANATION_PREVIEW_MAX ? `${t.slice(0, EXPLANATION_PREVIEW_MAX)}…` : t
}

/** 另册行：主列一行状态（不参与整文件自动强结论子集，§3.2） */
function buildNonAssessableShortLabel(row: StandardLatestCheckResult): string {
  const path = (row.resolutionPath ?? '').trim()
  if (path === 'unresolved_no_historical_row') {
    return '另册 · 时点版本未命中国标历史'
  }
  const hint = resolutionPathHint(row.resolutionPath)
  if (hint) {
    const one = hint.replace(/。$/, '')
    return one.length <= 14 ? `另册 · ${one}` : `另册 · ${one.slice(0, 12)}…`
  }
  return '另册（不参与自动强结论）'
}

/**
 * 表格「说明/谱系」列：主行状态文案（与 §3.2 参与子集 + citation 三态对齐；另册与自动比对区分）。
 */
export function buildValidityPedigreeShortLabel(row: StandardLatestCheckResult): string {
  if (!row.complianceAssessable) {
    return buildNonAssessableShortLabel(row)
  }
  if (row.citationMatchesLatest === true) {
    return '自动比对：与现行主号一致'
  }
  if (row.citationMatchesLatest === false) {
    return '自动比对：与现行主号不一致'
  }
  if (row.resolutionPath === 'unresolved_no_historical_row' && row.citationMatchesLatest === null) {
    return '历史库未命中（无自动结论）'
  }
  return '自动比对：暂无结论'
}

/**
 * 从 `buildValidityPedigreeShortLabel` 主行拆出「状态」列文案：
 * 优先取全角冒号 `：` 或半角 `:` 之后；否则取间隔号 ` · `（空格+中点+空格）之后；否则整行即状态。
 */
export function extractReferenceRowStatusDisplay(primaryLine: string): string {
  const s = primaryLine.trim()
  const fw = s.indexOf('：')
  if (fw >= 0 && fw < s.length - 1) {
    return s.slice(fw + 1).trim()
  }
  const asc = s.indexOf(':')
  if (asc >= 0 && asc < s.length - 1) {
    return s.slice(asc + 1).trim()
  }
  const sep = ' · '
  const j = s.indexOf(sep)
  if (j >= 0 && j + sep.length <= s.length) {
    return s.slice(j + sep.length).trim()
  }
  return s
}

export function buildValidityPedigreeDetailTags(row: StandardLatestCheckResult): React.ReactNode {
  const hint = resolutionPathHint(row.resolutionPath)
  const year =
    row.enterpriseAsOfYear != null && Number.isFinite(row.enterpriseAsOfYear)
      ? `企标时点年 ${row.enterpriseAsOfYear}`
      : ''
  const pedigree = (row.pedigreeChain || '').trim()
  const subsetTag = row.complianceAssessable ? (
    <Tag color="blue">比对子集：参与自动合规</Tag>
  ) : (
    <Tag>比对子集：不参与（另册）</Tag>
  )
  const citationTag = !row.complianceAssessable ? (
    <Tag>自动结论：不适用（另册）</Tag>
  ) : row.citationMatchesLatest === null ? (
    <Tag>自动结论：暂无（未给出 true/false）</Tag>
  ) : row.citationMatchesLatest ? (
    <Tag color="success">自动结论：时点号与现行主号一致</Tag>
  ) : (
    <Tag color="warning">自动结论：时点号与现行主号不一致</Tag>
  )
  return (
    <div style={{ maxWidth: 440 }}>
      <Space wrap size={[6, 6]}>
        {subsetTag}
        {citationTag}
        {hint ? <Tag color="processing">{hint}</Tag> : null}
        {year ? <Tag>{year}</Tag> : null}
        {row.pedigreeAnchorStdCode?.trim() ? (
          <Tag color="blue">谱系锚点 {row.pedigreeAnchorStdCode.trim()}</Tag>
        ) : null}
        {row.inferredHistoricalStdCode?.trim() ? (
          <Tag>推断历史 {row.inferredHistoricalStdCode.trim()}</Tag>
        ) : null}
        {row.latestStdCodeRaw?.trim() ? <Tag>原始 latest {row.latestStdCodeRaw.trim()}</Tag> : null}
      </Space>
      {pedigree ? (
        <div style={{ marginTop: 10, maxHeight: 280, overflow: 'auto' }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
            谱系 / 说明
          </Text>
          {renderPedigreeExplanationBody(pedigree)}
        </div>
      ) : null}
    </div>
  )
}
