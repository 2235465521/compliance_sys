import { ProTable } from '@ant-design/pro-components'
import { Button, Card, Space, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo } from 'react'
import type { DuplicateCheckHit } from '@/types/duplicate-check'
import { useDuplicateCheckStore } from '@/stores/duplicate-check'

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

export function DuplicateCheckResultTable() {
  const results = useDuplicateCheckStore((s) => s.results)
  const submitting = useDuplicateCheckStore((s) => s.submitting)
  const lastPayload = useDuplicateCheckStore((s) => s.lastPayload)
  const runCheck = useDuplicateCheckStore((s) => s.runCheck)
  const clear = useDuplicateCheckStore((s) => s.clear)
  const openReport = useDuplicateCheckStore((s) => s.openReport)

  const columns: ColumnsType<DuplicateCheckHit> = useMemo(
    () => [
      {
        title: '输入标准',
        dataIndex: 'candidateName',
        key: 'candidateName',
        ellipsis: true,
      },
      {
        title: '相似标准',
        dataIndex: 'matchedName',
        key: 'matchedName',
        ellipsis: true,
      },
      {
        title: '相似度',
        dataIndex: 'similarity',
        key: 'similarity',
        width: 120,
        render: (value: number) => {
          const tone = value >= 85 ? 'danger' : value >= 70 ? 'warning' : 'default'
          return (
            <Tag className={`dupcheck-pill dupcheck-pill--${tone}`}>
              {formatPercent(value)}
            </Tag>
          )
        },
      },
      {
        title: '标准编号/状态',
        dataIndex: 'highlights',
        key: 'highlights',
        render: (items?: string[]) => (
          <Space size={4} wrap>
            {(items || []).slice(0, 6).map((t) => (
              <Tag key={t} className="dupcheck-pill dupcheck-pill--soft">
                {t}
              </Tag>
            ))}
          </Space>
        ),
      },
      {
        title: '生成时间',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 200,
      },
      {
        title: '操作',
        key: 'actions',
        width: 140,
        render: (_, row) => (
          <Button
            type="link"
            onClick={() =>
              openReport(`查重报告：${row.matchedName}`, row.report ?? row)
            }
          >
            查看报告
          </Button>
        ),
      },
    ],
    [openReport],
  )

  return (
    <Card className="dupcheck-card" style={{ marginTop: 16 }}>
      <Typography.Title level={5} className="dupcheck-section-title" style={{ marginTop: 0 }}>
        重合列表
      </Typography.Title>
      <ProTable<DuplicateCheckHit>
        rowKey="id"
        search={false}
        options={false}
        pagination={{ pageSize: 10 }}
        dataSource={results}
        columns={columns as never}
        toolBarRender={() => [
          <Button
            key="rerun"
            onClick={() => {
              if (!lastPayload) {
                message.info('请先提交一次查重。')
                return
              }
              void runCheck(lastPayload)
            }}
            disabled={submitting}
          >
            重新查重
          </Button>,
          <Button
            key="clear"
            onClick={() => clear()}
            disabled={!results.length || submitting}
          >
            清空结果
          </Button>,
        ]}
      />
    </Card>
  )
}
