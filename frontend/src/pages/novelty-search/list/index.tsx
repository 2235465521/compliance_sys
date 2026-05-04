import { PlusOutlined, RedoOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchTaskList } from '@/services/novelty-search'
import { useNoveltyStore } from '@/stores/novelty-search'
import type { NoveltyTask, NoveltyTaskStatus } from '@/types/novelty-search'

const STATUS_META: Record<
  NoveltyTaskStatus,
  { label: string; color: 'default' | 'processing' | 'success' | 'error' | 'warning' }
> = {
  queued: { label: '排队', color: 'default' },
  parsing: { label: '解析中', color: 'processing' },
  pending_confirm: { label: '待确认专用表', color: 'warning' },
  comparing: { label: '比对中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

const STATUS_OPTIONS: { value: NoveltyTaskStatus | ''; label: string }[] = [
  { value: '', label: '全部状态' },
  ...(Object.keys(STATUS_META) as NoveltyTaskStatus[]).map((k) => ({
    value: k,
    label: STATUS_META[k].label,
  })),
]

export default function NoveltyTaskListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<{ keyword: string; status: NoveltyTaskStatus | '' }>()
  const tasks = useNoveltyStore((s) => s.tasks)
  const retryTask = useNoveltyStore((s) => s.retryTask)

  const [applied, setApplied] = useState<{ keyword: string; status: NoveltyTaskStatus | '' }>({
    keyword: '',
    status: '',
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const refresh = useCallback(async () => {
    try {
      await fetchTaskList()
      message.success('已刷新')
    } catch {
      message.error('加载失败（演示服务异常）')
    }
  }, [message])

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [tasks],
  )

  const filtered = useMemo(() => {
    let rows = sorted
    const kw = applied.keyword.trim()
    if (kw) {
      rows = rows.filter(
        (t) =>
          t.title.includes(kw) ||
          (t.enterpriseName || '').includes(kw) ||
          t.enterpriseStdNo.includes(kw) ||
          t.id.includes(kw) ||
          (t.fileName?.includes(kw) ?? false) ||
          (t.formStdNos?.some((n) => n.includes(kw)) ?? false),
      )
    }
    if (applied.status) {
      rows = rows.filter((t) => t.status === applied.status)
    }
    return rows
  }, [sorted, applied])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  )

  const onSearch = (v: { keyword?: string; status?: NoveltyTaskStatus | '' }) => {
    setApplied({
      keyword: (v.keyword ?? '').trim(),
      status: v.status ?? '',
    })
    setPage(1)
  }

  const onReset = () => {
    form.resetFields()
    setApplied({ keyword: '', status: '' })
    setPage(1)
  }

  const columns: ColumnsType<NoveltyTask> = [
    {
      title: '任务标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (t: string) => <Typography.Text strong>{t}</Typography.Text>,
    },
    {
      title: '企业',
      dataIndex: 'enterpriseName',
      key: 'enterprise',
      ellipsis: true,
      width: 200,
      render: (v: string) => v?.trim() || '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: NoveltyTaskStatus) => {
        const m = STATUS_META[s]
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    {
      title: '来源',
      key: 'source',
      width: 120,
      render: (_, row) =>
        row.source === 'upload'
          ? '企标上传'
          : row.source === 'national'
            ? '上传国标'
            : '标准号录入',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (iso: string) => dayjs(iso).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '失败摘要',
      key: 'fail',
      ellipsis: true,
      width: 220,
      render: (_, row) =>
        row.status === 'failed' && row.errorSummary ? (
          <Typography.Text type="danger">{row.errorSummary}</Typography.Text>
        ) : (
          '—'
        ),
    },
    {
      title: '操作',
      key: 'op',
      width: 160,
      fixed: 'right',
      render: (_, row) =>
        row.status === 'failed' ? (
          <Button
            type="link"
            icon={<RedoOutlined />}
            onClick={() => {
              retryTask(row.id)
              message.success('已重新尝试（演示）')
            }}
          >
            重新尝试
          </Button>
        ) : (
          <Button type="link" onClick={() => navigate(`/novelty-search/tasks/${row.id}`)}>
            进入工作台 -&gt;
          </Button>
        ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        任务列表
      </Typography.Title>

      <AlertMock />

      <Card bordered={false} styles={{ body: { paddingBottom: 8 } }}>
        <Form
          form={form}
          layout="inline"
          initialValues={{ keyword: '', status: '' }}
          onFinish={(vals) => onSearch(vals)}
          style={{ rowGap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <Form.Item label="标题关键字" name="keyword">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="输入任务标题..."
              style={{ width: 260 }}
            />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select options={STATUS_OPTIONS} style={{ width: 180 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button type="link" htmlType="button" onClick={onReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card
        bordered={false}
        title={<Typography.Title level={5} style={{ margin: 0 }}>任务数据列表</Typography.Title>}
        extra={
          <Space>
            <Button type="text" icon={<ReloadOutlined />} aria-label="刷新" onClick={() => void refresh()} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/novelty-search/create')}>
              新建任务
            </Button>
          </Space>
        }
      >
        <Table<NoveltyTask>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={paged}
          pagination={{
            current: page,
            pageSize,
            total: filtered.length,
            showSizeChanger: true,
            showQuickJumper: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
            showTotal: (total) => {
              const pages = Math.max(1, Math.ceil(total / pageSize))
              const cur = Math.min(page, pages)
              return `共 ${total} 条记录，当前 ${cur}/${pages} 页`
            },
          }}
          locale={{
            emptyText: (
              <Space direction="vertical" size="small" style={{ padding: '24px 0' }}>
                <Typography.Text type="secondary">暂无查新任务</Typography.Text>
                <Button type="primary" onClick={() => navigate('/novelty-search/create')}>
                  新建任务
                </Button>
              </Space>
            ),
          }}
        />
      </Card>
    </Space>
  )
}

function AlertMock() {
  return (
    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
      <Typography.Text type="warning">演示数据</Typography.Text>
      ：列表与状态为前端 Mock，后端任务 REST 未对接时请勿当作生产数据。
    </Typography.Paragraph>
  )
}
