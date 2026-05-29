import { Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { CompareRow } from '@/types/novelty-search'
import { ROW_CONCLUSION_META, rowConclusionLabel } from '@/pages/novelty-search/utils/noveltyCompareLabels'

const { Text } = Typography

export type NoveltyCompareResultTableProps = {
  dataSource: CompareRow[]
  loading?: boolean
  compareDone?: number
  compareTotal?: number
}

export function NoveltyCompareResultTable({
  dataSource,
  loading,
  compareDone,
  compareTotal,
}: NoveltyCompareResultTableProps) {
  const columns: ColumnsType<CompareRow> = [
    {
      title: (
        <Tooltip title="企标发布时点补全后的完整国标号（full_std_at_publication）">
          <span>补全年代号的标准号</span>
        </Tooltip>
      ),
      key: 'fullStd',
      width: 200,
      ellipsis: true,
      render: (_, row) => (
        <Text ellipsis={{ tooltip: row.fullStdAtPublication }} style={{ maxWidth: 188 }}>
          {row.fullStdAtPublication || '—'}
        </Text>
      ),
    },
    {
      title: (
        <Tooltip title="该企标在系统中首次完成合规/批量查新时记录的最新标准号">
          <span>首次查新时最新标准号</span>
        </Tooltip>
      ),
      key: 'baseline',
      width: 200,
      ellipsis: true,
      render: (_, row) => (
        <Text ellipsis={{ tooltip: row.baselineLatestStd }} style={{ maxWidth: 188 }}>
          {row.baselineLatestStd || '—'}
        </Text>
      ),
    },
    {
      title: (
        <Tooltip title="本次查新任务实时谱系查询得到的最新标准号">
          <span>本次查新最新标准号</span>
        </Tooltip>
      ),
      key: 'current',
      width: 200,
      ellipsis: true,
      render: (_, row) => (
        <Text
          strong={row.rowConclusion === 'updated'}
          type={row.rowConclusion === 'updated' ? 'danger' : undefined}
          ellipsis={{ tooltip: row.currentLatestStd }}
          style={{ maxWidth: 188 }}
        >
          {row.currentLatestStd || '—'}
        </Text>
      ),
    },
    {
      title: '结论',
      key: 'conclusion',
      width: 130,
      render: (_, row) => {
        const meta = ROW_CONCLUSION_META[row.rowConclusion]
        return (
          <Tag color={meta?.color ?? 'default'}>
            {rowConclusionLabel(row.rowConclusion, row.rowConclusionLabel)}
          </Tag>
        )
      },
    },
    {
      title: '企标引用号',
      dataIndex: 'referencedStdCode',
      key: 'referenced',
      width: 160,
      ellipsis: true,
      render: (v: string) => v || '—',
    },
  ]

  return (
    <Table<CompareRow>
      rowKey="id"
      size="small"
      loading={loading}
      pagination={false}
      scroll={{ x: 920 }}
      dataSource={dataSource}
      columns={columns}
      expandable={{
        expandedRowRender: (row) => (
          <Typography.Paragraph style={{ margin: 0 }} type="secondary">
            {row.explanation ? (
              <>
                <Text strong>说明</Text>：{row.explanation}
              </>
            ) : (
              '—'
            )}
            {row.baselineRecordedAt ? (
              <>
                <br />
                <Text type="secondary">
                  基线记录：{row.baselineSource ?? '—'} · {row.baselineRecordedAt.replace('T', ' ').slice(0, 19)}
                </Text>
              </>
            ) : null}
          </Typography.Paragraph>
        ),
        rowExpandable: (row) => Boolean(row.explanation || row.baselineRecordedAt),
      }}
      locale={{
        emptyText:
          compareTotal != null && compareTotal > 0
            ? `比对中（${compareDone ?? 0}/${compareTotal}）…`
            : '暂无比对结果，请先完成「专用表与确认」',
      }}
    />
  )
}
