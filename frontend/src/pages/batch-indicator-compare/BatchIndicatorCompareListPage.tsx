import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Popconfirm, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import type { BatchIndicatorCompareJobSummary } from '@/types/batch-indicator-compare'
import {
  deleteBatchIndicatorCompareJob,
  listBatchIndicatorCompareJobs,
} from '@/services/batch-indicator-compare'
import { batchIndicatorCompareJobStatusMeta } from '@/pages/batch-indicator-compare/batchIndicatorCompareStatusLabels'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'

const { Title, Text } = Typography

function formatDateTime(iso: string | undefined | null): string {
  if (!iso?.trim()) return '—'
  const d = dayjs(iso)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : iso.trim()
}

export default function BatchIndicatorCompareListPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [list, setList] = useState<BatchIndicatorCompareJobSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [listHint, setListHint] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    setListHint(null)
    try {
      const res = await listBatchIndicatorCompareJobs({ page, page_size: pageSize })
      setList(res.results)
      setTotal(res.total)
    } catch (e) {
      const msg = getComplianceApiErrorMessage(e)
      setList([])
      setTotal(0)
      setListHint(msg)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleDelete = async (id: number) => {
    try {
      await deleteBatchIndicatorCompareJob(id)
      message.success('已删除指标对比任务')
      void loadList()
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    }
  }

  const columns: ColumnsType<BatchIndicatorCompareJobSummary> = [
    {
      title: '任务名称',
      dataIndex: 'label',
      ellipsis: true,
      render: (v: string | null, r) => v?.trim() || `指标对比 #${r.id}`,
    },
    {
      title: '来源体检批次',
      dataIndex: 'source_batch_job_id',
      width: 120,
      render: (id: number) => (
        <Link to={`/batch-normative-reference/${id}`}>批次 #{id}</Link>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => {
        const meta = batchIndicatorCompareJobStatusMeta(status)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '进度',
      key: 'prog',
      width: 180,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 14 }}>
          完成 {r.completed_items ?? 0}/{r.total_items ?? 0}
          {(r.failed_items ?? 0) > 0 ? `，失败 ${r.failed_items}` : ''}
          {(r.skipped_items ?? 0) > 0 ? `，跳过 ${r.skipped_items}` : ''}
        </Text>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '操作',
      key: 'op',
      width: 160,
      render: (_, r) => (
        <Space size="middle">
          <Link to={`/batch-normative-reference/indicator-compare/${r.id}`}>查看</Link>
          <Popconfirm
            title="确定删除该指标对比任务？"
            description="删除后留痕记录不可恢复。"
            onConfirm={() => void handleDelete(r.id)}
          >
            <Button type="link" danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 8 }}>
          指标对比记录
        </Title>
        <Text type="secondary" style={{ fontSize: 15, lineHeight: 1.7 }}>
          对已完成的规范性体检批次发起的技术指标对比任务留痕。对比模型为「企标提取指标 vs 最新国标指标」，不含 M
          补充标准。
        </Text>
      </div>

      <Space wrap>
        <Link to="/batch-normative-reference">
          <Button>返回规范性体检</Button>
        </Link>
        <Button onClick={() => void loadList()} loading={loading}>
          刷新列表
        </Button>
      </Space>

      {listHint ? (
        <Alert type="warning" showIcon message="指标对比列表暂不可用" description={listHint} />
      ) : null}

      <Card title="任务列表" size="small">
        <Table<BatchIndicatorCompareJobSummary>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={list}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps ?? 20)
            },
          }}
          locale={{ emptyText: listHint ? '无数据' : '暂无指标对比任务，请从体检批次发起' }}
        />
      </Card>
    </Space>
  )
}
