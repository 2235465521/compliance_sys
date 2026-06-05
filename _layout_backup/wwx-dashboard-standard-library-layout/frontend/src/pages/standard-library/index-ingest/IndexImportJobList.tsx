import { Button, Popconfirm, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteIndexImportJob, listIndexImportJobs } from '@/services/standard-library'
import type { IndexImportJob } from '@/services/standard-library'
import IndexImportJobDrawer from './IndexImportJobDrawer'

const { Text } = Typography

const PAGE_SIZE = 20

const JOB_STATUS_META: Record<string, { label: string; color: string }> = {
  pending:    { label: '等待中', color: 'default'    },
  running:    { label: '处理中', color: 'processing' },
  processing: { label: '处理中', color: 'processing' },
  completed:  { label: '已完成', color: 'success'    },
  failed:     { label: '失败',   color: 'error'      },
}

interface Props {
  refreshKey?: number
  /** 提交成功后自动打开此 job 的详情抽屉 */
  autoOpenJobId?: string | number | null
  onAutoOpenDone?: () => void
}

export default function IndexImportJobList({ refreshKey, autoOpenJobId, onAutoOpenDone }: Props) {
  const [data, setData]         = useState<IndexImportJob[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [selectedId, setSelectedId] = useState<string | number | null>(null)
  const handledAutoOpen = useRef<string | number | null>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await listIndexImportJobs({ page: p, page_size: PAGE_SIZE })
      setData(res.results)
      setTotal(res.total)
    } catch (e) {
      message.error((e as Error).message || '获取批次列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(page) }, [load, page])

  useEffect(() => {
    if (refreshKey === undefined) return
    setPage(1)
    void load(1)
  }, [refreshKey, load])

  // 提交成功后自动打开新批次详情
  useEffect(() => {
    if (!autoOpenJobId || handledAutoOpen.current === autoOpenJobId) return
    handledAutoOpen.current = autoOpenJobId
    setSelectedId(autoOpenJobId)
    onAutoOpenDone?.()
  }, [autoOpenJobId, onAutoOpenDone])

  const handleDelete = async (id: string | number) => {
    try {
      await deleteIndexImportJob(id)
      message.success('已删除该批次')
      void load(page)
    } catch (e) {
      message.error((e as Error).message || '删除失败')
    }
  }

  const columns: ColumnsType<IndexImportJob> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
      render: (v: string | number) => <Text strong>#{v}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => {
        const m = JOB_STATUS_META[s] ?? { label: s, color: 'default' }
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    {
      title: '文件总数',
      dataIndex: 'total_items',
      width: 90,
      align: 'right' as const,
      render: (n: number) => n ?? '—',
    },
    {
      title: '成功',
      dataIndex: 'completed_items',
      width: 70,
      align: 'right' as const,
      render: (n: number) => (
        <Text style={{ color: n > 0 ? '#52c41a' : undefined, fontWeight: 600 }}>{n ?? 0}</Text>
      ),
    },
    {
      title: '失败/跳过',
      dataIndex: 'failed_items',
      width: 90,
      align: 'right' as const,
      render: (n: number) =>
        n > 0 ? <Text type="danger">{n}</Text> : <Text type="secondary">0</Text>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (t: string) => (
        <Text style={{ fontSize: 13, color: '#6b7280' }}>{t || '—'}</Text>
      ),
    },
    {
      title: '操作',
      key: 'op',
      width: 130,
      render: (_, r) => (
        <Space size="middle">
          <Button type="link" size="small" onClick={() => setSelectedId(r.id)}>
            进入
          </Button>
          <Popconfirm
            title="确定删除该批次？"
            description="删除后不可恢复。"
            onConfirm={() => void handleDelete(r.id)}
          >
            <Button type="link" danger size="small">删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load(page)}
            loading={loading}
          >
            刷新
          </Button>
        </div>

        <Table<IndexImportJob>
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 680 }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setPage(p),
          }}
          locale={{ emptyText: '暂无批次记录' }}
        />
      </Space>

      <IndexImportJobDrawer
        jobId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </>
  )
}
