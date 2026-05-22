import React from 'react'
import { Button, Input, Radio, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { StandardLatestCheckResult } from '@/services/compliance'
import { buildValidityPedigreeDetailTags, buildValidityPedigreeExplanationPreview, buildValidityPedigreeShortLabel, extractReferenceRowStatusDisplay } from '@/pages/compliance/utils/validityPedigree'
import { renderPedigreeExplanationBody } from '@/pages/compliance/utils/pedigreeExplanationDisplay'

const { Text } = Typography

/** 状态列内彩色块固定宽度（与列宽 168 留边） */
const STATUS_BADGE_WIDTH = 148

/** 状态列：彩色标签底色（与行内 compliance / citation 语义一致） */
function referenceRowStatusTagColor(row: StandardLatestCheckResult): string {
  if (!row.complianceAssessable) return 'gold'
  if (row.citationMatchesLatest === true) return 'success'
  if (row.citationMatchesLatest === false) return 'error'
  return 'processing'
}

export type ReferenceLatestResolvedTableProps = {
  dataSource: StandardLatestCheckResult[]
  editingId: string | null
  draft: StandardLatestCheckResult | null
  setDraft: React.Dispatch<React.SetStateAction<StandardLatestCheckResult | null>>
  onSaveRow: () => void | Promise<void>
  onCancelEdit: () => void
  onStartEdit: (row: StandardLatestCheckResult) => void
  onDeleteRow: (queryBzId: string) => void
  scrollX?: number
  emptyText?: string
}

export function ReferenceLatestResolvedTable({
  dataSource,
  editingId,
  draft,
  setDraft,
  onSaveRow,
  onCancelEdit,
  onStartEdit,
  onDeleteRow,
  scrollX = 1290,
  emptyText = '暂无数据',
}: ReferenceLatestResolvedTableProps) {
  const columns: ColumnsType<StandardLatestCheckResult> = [
    {
      title: (
        <Tooltip title="对应接口 referenced_std_code / query_bz_id：企标文本中引用的标准号（审核后）">
          <span>企标中引用的标准号</span>
        </Tooltip>
      ),
      dataIndex: 'queryBzId',
      key: 'queryBzId',
      width: 200,
      render: (value: string, row) =>
        editingId === row.queryBzId ? (
          <Input
            size="small"
            value={draft?.queryBzId ?? value}
            onChange={(event) =>
              setDraft((prev) => (prev ? { ...prev, queryBzId: event.target.value } : prev))
            }
          />
        ) : (
          <Text ellipsis={{ tooltip: value }} style={{ maxWidth: 188 }}>
            {value}
          </Text>
        ),
    },
    {
      title: (
        <Tooltip title="对应接口 full_std_at_publication：企标发布时点下的完整国标号（无年号且推断失败时可为空）">
          <span>发布时引用的完整的企标号</span>
        </Tooltip>
      ),
      key: 'fullStdAtPublication',
      width: 220,
      render: (_value, row) => {
        const pub = (row.historicalFullStdCode || '').trim() || '-'
        return (
          <Text ellipsis={{ tooltip: pub === '-' ? false : pub }} style={{ maxWidth: 200 }}>
            {pub}
          </Text>
        )
      },
    },
    {
      title: (
        <Tooltip title="对应 latest_std_primary / latest_std_codes：主现行号及谱系拆分后的全部现行号">
          <span>最新标准号</span>
        </Tooltip>
      ),
      dataIndex: 'currentLatestId',
      key: 'currentLatestId',
      width: 220,
      render: (value: string, row) =>
        editingId === row.queryBzId ? (
          <Input
            size="small"
            value={draft?.currentLatestId ?? value}
            onChange={(event) =>
              setDraft((prev) => (prev ? { ...prev, currentLatestId: event.target.value } : prev))
            }
          />
        ) : (() => {
            const codes =
              row.currentLatestStdCodes && row.currentLatestStdCodes.length > 0
                ? row.currentLatestStdCodes
                : value?.trim()
                  ? [value.trim()]
                  : []
            if (codes.length === 0) {
              return '-'
            }
            if (codes.length === 1) {
              const t = codes[0]
              return (
                <Text ellipsis={{ tooltip: t }} style={{ maxWidth: 200 }}>
                  {t}
                </Text>
              )
            }
            const joined = codes.join('、')
            return (
              <Tooltip title={joined}>
                <Space size={4} wrap style={{ maxWidth: 208 }}>
                  {codes.slice(0, 2).map((c) => (
                    <Tag key={c}>{c}</Tag>
                  ))}
                  {codes.length > 2 ? <Tag>+{codes.length - 2}</Tag> : null}
                </Space>
              </Tooltip>
            )
          })(),
    },
    {
      title: (
        <Tooltip title="彩色标签表示比对子集与自动结论；悬停查看详情。文案取主行中「：」或「 · 」之后部分。">
          <span>状态</span>
        </Tooltip>
      ),
      key: 'referenceRowStatus',
      width: 168,
      align: 'center',
      render: (_value, row) => {
        const primary = buildValidityPedigreeShortLabel(row)
        const statusText = extractReferenceRowStatusDisplay(primary)
        const color = referenceRowStatusTagColor(row)
        return (
          <Tooltip
            title={buildValidityPedigreeDetailTags(row)}
            overlayStyle={{ maxWidth: 460 }}
            color="#1f2937"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                width: '100%',
                cursor: 'help',
              }}
            >
              <Tag
                color={color}
                style={{
                  margin: 0,
                  width: STATUS_BADGE_WIDTH,
                  minWidth: STATUS_BADGE_WIDTH,
                  maxWidth: STATUS_BADGE_WIDTH,
                  boxSizing: 'border-box',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  lineHeight: 1.45,
                  padding: '5px 8px',
                  textAlign: 'center',
                }}
              >
                {statusText}
              </Tag>
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: (
        <Tooltip title="对应接口 explanation（及谱系过程说明）；无长文案时显示「—」。">
          <span>说明 / 谱系</span>
        </Tooltip>
      ),
      key: 'pedigreeSummary',
      width: 260,
      render: (_value, row) => {
        const fullExplanation = (row.pedigreeChain || '').trim()
        const preview = buildValidityPedigreeExplanationPreview(row)
        return (
          <Tooltip
            title={buildValidityPedigreeDetailTags(row)}
            overlayStyle={{ maxWidth: 460 }}
            color="#1f2937"
          >
            <div style={{ maxWidth: 244, cursor: 'help' }}>
              {preview ? (
                <Text
                  type="secondary"
                  ellipsis={{ tooltip: renderPedigreeExplanationBody(fullExplanation) }}
                  style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 244 }}
                >
                  {preview}
                </Text>
              ) : (
                <Text type="secondary">—</Text>
              )}
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_value, row) =>
        editingId === row.queryBzId ? (
          <Space direction="vertical" size={8} align="start">
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                现行结论
              </Text>
              <Radio.Group
                size="small"
                value={draft?.isLatest ? 'latest' : 'outdated'}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          isLatest: event.target.value === 'latest',
                          complianceAssessable: true,
                          citationMatchesLatest: event.target.value === 'latest',
                        }
                      : prev,
                  )
                }
              >
                <Radio.Button value="latest">最新</Radio.Button>
                <Radio.Button value="outdated">需更新</Radio.Button>
              </Radio.Group>
            </div>
            <Space size={6}>
              <Button size="small" type="primary" onClick={onSaveRow}>
                保存
              </Button>
              <Button size="small" onClick={onCancelEdit}>
                取消
              </Button>
            </Space>
          </Space>
        ) : (
          <Space size={6}>
            <Button size="small" onClick={() => onStartEdit(row)}>
              编辑
            </Button>
            <Button size="small" danger onClick={() => onDeleteRow(row.queryBzId)}>
              删除
            </Button>
          </Space>
        ),
    },
  ]

  return (
    <Table<StandardLatestCheckResult>
      rowKey={(row, index) => `${row.queryBzId || 'row'}-${index ?? 0}`}
      dataSource={dataSource}
      columns={columns}
      pagination={false}
      locale={{ emptyText }}
      scroll={{ x: scrollX }}
    />
  )
}
