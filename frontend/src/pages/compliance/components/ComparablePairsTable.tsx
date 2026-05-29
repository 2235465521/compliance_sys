import React from 'react'
import { Empty, Spin, Typography } from 'antd'
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons'
import {
  getStdOrchestrationDisplay,
  type StdOrchestrationDisplay,
} from '@/pages/compliance/utils/step5StdOrchestrationLookup'

const { Text } = Typography

export type ComparablePairRow = {
  id: string
  publicationFullStdCode: string
  latestStdCode: string
  source: 'reference' | 'supplement'
}

function IndicatorStatusBadge(props: {
  stdCode: string
  lookup: Map<string, StdOrchestrationDisplay>
  orchestrationLoading: boolean
  onOpenMissingDetail: (stdCode: string) => void
  onOpenReadyDetail: (stdCode: string) => void
}) {
  const code = props.stdCode.trim()
  if (!code) {
    return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
  }

  const info = getStdOrchestrationDisplay(props.lookup, code)

  if (info.isParsing || info.statusKind === 'parsing') {
    return (
      <span className="comparable-pairs-status comparable-pairs-status--parsing">
        <LoadingOutlined spin style={{ fontSize: 12 }} />
        正在解析
      </span>
    )
  }

  if (props.orchestrationLoading && !props.lookup.has(code)) {
    return (
      <span className="comparable-pairs-status comparable-pairs-status--loading">
        <LoadingOutlined spin style={{ fontSize: 12 }} />
        编排中
      </span>
    )
  }

  const count = info.indicatorCount

  if (info.hasIndicators) {
    return (
      <button
        type="button"
        className="comparable-pairs-status comparable-pairs-status--ready comparable-pairs-status--clickable"
        title={count > 0 ? `库内 ${count} 条指标，点击查看并审核` : '点击查看指标明细'}
        onClick={() => props.onOpenReadyDetail(code)}
      >
        <CheckCircleFilled />
        有指标 · 查看
      </button>
    )
  }

  return (
    <button
      type="button"
      className="comparable-pairs-status comparable-pairs-status--missing"
      onClick={() => props.onOpenMissingDetail(code)}
    >
      <ExclamationCircleFilled />
      无指标 · 去处理
    </button>
  )
}

function StdCodeBlock(props: {
  label: string
  stdCode: string
  lookup: Map<string, StdOrchestrationDisplay>
  orchestrationLoading: boolean
  onOpenMissingDetail: (stdCode: string) => void
  onOpenReadyDetail: (stdCode: string) => void
  placeholder?: string
}) {
  const code = props.stdCode.trim()
  return (
    <div className="comparable-pairs-cell">
      <Text type="secondary" className="comparable-pairs-cell-label">
        {props.label}
      </Text>
      <div className="comparable-pairs-cell-body">
        {code ? (
          <Text className="comparable-pairs-std-code" ellipsis={{ tooltip: code }}>
            {code}
          </Text>
        ) : (
          <Text type="secondary" className="comparable-pairs-std-placeholder">
            {props.placeholder ?? '—'}
          </Text>
        )}
        {code ? (
          <IndicatorStatusBadge
            stdCode={code}
            lookup={props.lookup}
            orchestrationLoading={props.orchestrationLoading}
            onOpenMissingDetail={props.onOpenMissingDetail}
            onOpenReadyDetail={props.onOpenReadyDetail}
          />
        ) : null}
      </div>
    </div>
  )
}

export type ComparablePairsTableProps = {
  rows: ComparablePairRow[]
  lookup: Map<string, StdOrchestrationDisplay>
  orchestrationLoading: boolean
  onOpenMissingDetail: (stdCode: string) => void
  onOpenReadyDetail: (stdCode: string) => void
}

export function ComparablePairsTable(props: ComparablePairsTableProps) {
  const { rows, lookup, orchestrationLoading, onOpenMissingDetail, onOpenReadyDetail } = props

  if (rows.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无可进行指标对比的标准（请先在第四步补全 GB 引用或补充标准）"
      />
    )
  }

  return (
    <div className="comparable-pairs-table">
      <div className="comparable-pairs-table-head">
        <span className="comparable-pairs-col-index">#</span>
        <span className="comparable-pairs-col-pub">发布时引用（N）</span>
        <span className="comparable-pairs-col-arrow" aria-hidden />
        <span className="comparable-pairs-col-latest">最新标准（N+M）</span>
      </div>

      <div className="comparable-pairs-table-body">
        {rows.map((row, index) => {
          const isSupplement = row.source === 'supplement'
          return (
            <div key={row.id} className="comparable-pairs-row">
              <span className="comparable-pairs-col-index">
                <Text type="secondary">{index + 1}</Text>
              </span>

              <div className="comparable-pairs-col-pub">
                <StdCodeBlock
                  label="发布完整号"
                  stdCode={isSupplement ? '' : row.publicationFullStdCode}
                  lookup={lookup}
                  orchestrationLoading={orchestrationLoading}
                  onOpenMissingDetail={onOpenMissingDetail}
                  onOpenReadyDetail={onOpenReadyDetail}
                  placeholder="—"
                />
              </div>

              <span className="comparable-pairs-col-arrow">
                <ArrowRightOutlined />
              </span>

              <div className="comparable-pairs-col-latest">
                <StdCodeBlock
                  label="最新标准号"
                  stdCode={row.latestStdCode}
                  lookup={lookup}
                  orchestrationLoading={orchestrationLoading}
                  onOpenMissingDetail={onOpenMissingDetail}
                  onOpenReadyDetail={onOpenReadyDetail}
                />
              </div>
            </div>
          )
        })}
      </div>

      {orchestrationLoading ? (
        <div className="comparable-pairs-table-overlay">
          <Spin indicator={<LoadingOutlined spin />} tip="正在编排指标…" />
        </div>
      ) : null}
    </div>
  )
}
