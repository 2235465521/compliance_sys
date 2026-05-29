import { Empty, Spin, Table, Tabs, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { fetchTaskIndicators } from '@/services/novelty-search'
import type { NoveltyEnterpriseIndicator, NoveltyIndicatorsBundle } from '@/types/novelty-search'

const entColumns: ColumnsType<NoveltyEnterpriseIndicator> = [
  { title: '指标名称', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '指标值', dataIndex: 'value', key: 'value', ellipsis: true },
  {
    title: '来源',
    key: 'source',
    width: 140,
    render: (_, row) =>
      row.source ? `${row.source}${row.sourceId != null ? ` #${row.sourceId}` : ''}` : '—',
  },
]

export function NoveltyIndicatorsPanel({
  taskId,
  indicatorsAvailable,
}: {
  taskId: string
  indicatorsAvailable: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [bundle, setBundle] = useState<NoveltyIndicatorsBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!indicatorsAvailable) {
      setLoading(false)
      setBundle(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchTaskIndicators(taskId)
      .then((data) => {
        if (!cancelled) {
          setBundle(data)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setBundle(null)
          setError(e instanceof Error ? e.message : '加载指标失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [taskId, indicatorsAvailable])

  if (!indicatorsAvailable) {
    return <Empty description="该任务无汇聚指标数据（indicators_available=false）" />
  }

  if (loading) {
    return <Spin tip="加载历史指标…" />
  }

  if (error) {
    return <Empty description={error} />
  }

  if (!bundle) {
    return <Empty description="暂无指标数据" />
  }

  const nationalCodes = Object.keys(bundle.nationalByStdCode ?? {}).sort()
  const nationalTabs = nationalCodes.map((code) => ({
    key: code,
    label: code,
    children: (
      <Table
        size="small"
        rowKey={(_, i) => `${code}-${i}`}
        pagination={false}
        dataSource={(bundle.nationalByStdCode[code] ?? []) as Record<string, unknown>[]}
        columns={[
          {
            title: '指标名称',
            key: 'name',
            render: (_, r) => String(r.indicator_name ?? r.name ?? r.index_name ?? '—'),
          },
          {
            title: '类型',
            key: 'type',
            width: 100,
            render: (_, r) => String(r.indicator_type ?? r.index_type ?? '—'),
          },
          {
            title: '内容',
            key: 'content',
            ellipsis: true,
            render: (_, r) => String(r.content ?? r.indicator_value ?? r.index_value ?? '—'),
          },
        ]}
      />
    ),
  }))

  return (
    <Tabs
      items={[
        {
          key: 'enterprise',
          label: `企标指标（${bundle.enterpriseIndicators.length}）`,
          children:
            bundle.enterpriseIndicators.length > 0 ? (
              <Table
                size="small"
                rowKey="id"
                pagination={{ pageSize: 20, showSizeChanger: true }}
                columns={entColumns}
                dataSource={bundle.enterpriseIndicators}
              />
            ) : (
              <Empty description="无企标指标记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ),
        },
        {
          key: 'national',
          label: `国标指标（${nationalCodes.length} 个标准）`,
          children:
            nationalCodes.length > 0 ? (
              <Tabs tabPosition="left" size="small" items={nationalTabs} />
            ) : (
              <Empty description="无国标指标记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ),
        },
        {
          key: 'sources',
          label: '数据来源',
          children:
            bundle.sourceEvaluations.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {bundle.sourceEvaluations.map((s) => (
                  <li key={`${s.sourceType}-${s.sourceId}`}>
                    <Typography.Text>
                      {s.title}（{s.sourceType === 'compliance' ? '合规评价' : '批量评价'} #{s.sourceId}，{' '}
                      {s.evaluatedAt.replace('T', ' ').slice(0, 19)}）
                    </Typography.Text>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty description="无来源摘要" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ),
        },
      ]}
    />
  )
}
