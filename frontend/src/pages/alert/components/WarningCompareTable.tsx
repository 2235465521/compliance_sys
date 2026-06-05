import { Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ROW_CONCLUSION_META, rowConclusionLabel } from '@/pages/novelty-search/utils/noveltyCompareLabels'
import type { WarningCompareRow } from '@/types/warnings'

const { Text } = Typography

export function WarningCompareTable({
  dataSource,
  loading,
}: {
  dataSource: WarningCompareRow[]
  loading?: boolean
}) {
  const columns: ColumnsType<WarningCompareRow> = [
    {
      title: (
        <Tooltip title="从企标文件中提取的引用标准号原文">
          <span>企标文件中引用的标准号</span>
        </Tooltip>
      ),
      dataIndex: 'referencedStdCode',
      key: 'referenced',
      width: 180,
      ellipsis: true,
      render: (v: string) => (
        <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 168 }}>
          {v || '—'}
        </Text>
      ),
    },
    {
      title: (
        <Tooltip title="企标发布时点补全年代号后的标准号">
          <span>补全之后的引用标准</span>
        </Tooltip>
      ),
      key: 'fullStd',
      width: 190,
      ellipsis: true,
      render: (_, row) => (
        <Text ellipsis={{ tooltip: row.fullStdAtPublication }} style={{ maxWidth: 178 }}>
          {row.fullStdAtPublication || '—'}
        </Text>
      ),
    },
    {
      title: (
        <Tooltip title="上一次合规/批量规范性引用查新记录的最新标准号（后端聚合）">
          <span>上一次查出的最新标准号</span>
        </Tooltip>
      ),
      key: 'baseline',
      width: 190,
      ellipsis: true,
      render: (_, row) => (
        <Text ellipsis={{ tooltip: row.baselineLatestStd }} style={{ maxWidth: 178 }}>
          {row.baselineLatestStd || '—'}
        </Text>
      ),
    },
    {
      title: (
        <Tooltip title="本次预警实时查新得到的最新标准号">
          <span>本次预警查出的最新标准号</span>
        </Tooltip>
      ),
      key: 'current',
      width: 190,
      ellipsis: true,
      render: (_, row) => (
        <Text
          strong={row.rowConclusion === 'updated'}
          type={row.rowConclusion === 'updated' ? 'danger' : undefined}
          ellipsis={{ tooltip: row.currentLatestStd }}
          style={{ maxWidth: 178 }}
        >
          {row.currentLatestStd || '—'}
        </Text>
      ),
    },
    {
      title: '预警结论',
      key: 'conclusion',
      width: 120,
      render: (_, row) => {
        const meta = ROW_CONCLUSION_META[row.rowConclusion]
        return (
          <Tag color={meta?.color ?? 'default'}>
            {rowConclusionLabel(row.rowConclusion, row.rowConclusionLabel)}
          </Tag>
        )
      },
    },
  ]

  return (
    <Table<WarningCompareRow>
      rowKey="id"
      size="small"
      loading={loading}
      pagination={false}
      scroll={{ x: 980 }}
      dataSource={dataSource}
      columns={columns}
      expandable={{
        expandedRowRender: (row) =>
          row.explanation ? (
            <Typography.Paragraph style={{ margin: 0 }} type="secondary">
              <Text strong>说明</Text>：{row.explanation}
            </Typography.Paragraph>
          ) : null,
        rowExpandable: (row) => Boolean(row.explanation),
      }}
      locale={{ emptyText: '暂无比对数据' }}
    />
  )
}
