import { Card, Typography } from 'antd'
import { useDuplicateCheckStore } from '@/stores/duplicate-check'

function renderHighlightedConclusion(text: string) {
  const src = text || ''
  const parts = src.split(/(\d+(?:\.\d+)?%|≥|<=|>=|<|>|高|中|低)/g).filter((x) => x !== '')
  return parts.map((p, idx) => {
    const isEmph =
      /^(\d+(?:\.\d+)?%|≥|<=|>=|<|>|高|中|低)$/.test(p) ||
      /重合度|相似度|风险|不建议|建议/.test(p)
    return (
      <span key={`${idx}-${p}`} className={isEmph ? 'dupcheck-emph' : undefined}>
        {p}
      </span>
    )
  })
}

export function DuplicateCheckSummaryCard() {
  const summary = useDuplicateCheckStore((s) => s.summary)

  if (!summary) return null

  const riskText =
    summary.riskLevel === 'high' ? '高' : summary.riskLevel === 'medium' ? '中' : '低'
  const riskClass =
    summary.riskLevel === 'high'
      ? 'dupcheck-risk--high'
      : summary.riskLevel === 'medium'
        ? 'dupcheck-risk--medium'
        : 'dupcheck-risk--low'

  return (
    <Card className="dupcheck-card" style={{ marginTop: 16 }}>
      <Typography.Title level={5} className="dupcheck-section-title" style={{ marginTop: 0 }}>
        查重结论
      </Typography.Title>

      <div className="dupcheck-metrics">
        <div className="dupcheck-metric dupcheck-metric--danger">
          <div className="dupcheck-metric-label">最高重合度</div>
          <div className="dupcheck-metric-value">{Math.round(summary.maxSimilarity)}%</div>
        </div>
        <div className="dupcheck-metric">
          <div className="dupcheck-metric-label">参考档位</div>
          <div className="dupcheck-metric-value">70% / 85%</div>
        </div>
        <div className="dupcheck-metric">
          <div className="dupcheck-metric-label">风险档位</div>
          <div className={`dupcheck-metric-value ${riskClass}`}>{riskText} △</div>
        </div>
      </div>

      <div className="dupcheck-conclusion dupcheck-conclusion--danger">
        <div className="dupcheck-conclusion-icon">!</div>
        <div className="dupcheck-conclusion-text">
          <span className="dupcheck-conclusion-prefix">结论：</span>
          {renderHighlightedConclusion(summary.conclusionText)}
        </div>
      </div>
    </Card>
  )
}
