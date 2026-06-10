import React from 'react'
import { Empty, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { WarningOutlined } from '@ant-design/icons'
import type { ComparePreviewRow } from '@/pages/compliance/comparison-types'

const { Text } = Typography

function renderSingleResultTag(result: string) {
  const text = (result || '').trim()
  if (!text || text === '—' || text === '待确认') {
    return <Tag>—</Tag>
  }
  if (text.includes('缺失') || text.includes('⚠')) {
    return (
      <Tag color="warning" icon={<WarningOutlined />}>
        {text.replace(/^⚠️?\s*/u, '') || '缺失'}
      </Tag>
    )
  }
  if (text.includes('合规') && !text.includes('不合规')) {
    return <Tag color="success">{text}</Tag>
  }
  if (text.includes('不合规')) {
    return <Tag color="error">{text}</Tag>
  }
  return <Tag color="processing">{text}</Tag>
}

export type IndicatorCompareResultTableProps = {
  rows: ComparePreviewRow[]
  loading?: boolean
  summary?: string | null
  emptyText?: string
}

export function IndicatorCompareResultTable({
  rows,
  loading,
  summary,
  emptyText = '暂无对比明细',
}: IndicatorCompareResultTableProps) {
  const columns: ColumnsType<ComparePreviewRow> = [
    {
      title: '序号',
      dataIndex: 'rowNo',
      width: 64,
      render: (v: string | undefined, _, idx) => v?.trim() || String(idx + 1),
    },
    {
      title: '指标类别',
      dataIndex: 'indicatorCategory',
      width: 100,
      ellipsis: true,
      render: (v: string | undefined) => v?.trim() || '—',
    },
    {
      title: '指标名称',
      dataIndex: 'indicatorName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '企标限值',
      dataIndex: 'enterpriseValue',
      width: 120,
      ellipsis: true,
    },
    {
      title: '引用国标号',
      dataIndex: 'referenceStdCode',
      width: 140,
      ellipsis: true,
      render: (v: string | undefined) => v?.trim() || '—',
    },
    {
      title: '国标限值',
      dataIndex: 'matchedStandard',
      width: 120,
      ellipsis: true,
    },
    {
      title: '单项结果',
      dataIndex: 'nationalValue',
      width: 130,
      render: (v: string) => renderSingleResultTag(v),
    },
    {
      title: '判决备注',
      dataIndex: 'compareNote',
      ellipsis: true,
      render: (v: string | undefined) => v?.trim() || '—',
    },
  ]

  return (
    <div>
      {summary?.trim() ? (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 14 }}>
          {summary.trim()}
        </Text>
      ) : null}
      <Table<ComparePreviewRow>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1100 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (total) => `共 ${total} 条`,
        }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />,
        }}
      />
    </div>
  )
}
