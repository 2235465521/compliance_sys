import { PlusOutlined, RedoOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Pagination, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchTaskList, retryNoveltyTask } from '@/services/novelty-search'
import { TASK_CONCLUSION_META } from '@/pages/novelty-search/utils/noveltyCompareLabels'
import type { NoveltyTask, NoveltyTaskStatus } from '@/types/novelty-search'

const STATUS_META: Record<
  NoveltyTaskStatus,
  { label: string; color: 'default' | 'processing' | 'success' | 'error' | 'warning' }
> = {
  queued: { label: '排队', color: 'default' },
  loading_history: { label: '汇聚历史', color: 'processing' },
  parsing: { label: '解析中', color: 'processing' },
  pending_confirm: { label: '待确认专用表', color: 'warning' },
  comparing: { label: '比对中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

export default function NoveltyTaskListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<{ keyword: string }>()

  const [tasks, setTasks] = useState<NoveltyTask[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const listRequestSeq = useRef(0)
  const messageRef = useRef(message)
  messageRef.current = message

  const loadList = useCallback(async () => {
    const kw = appliedKeyword.trim()
    let reqPage = page
    const reqPageSize = pageSize
    const seq = ++listRequestSeq.current

    setLoading(true)
    try {
      let res = await fetchTaskList({
        page: reqPage,
        page_size: reqPageSize,
        subject_code: kw || undefined,
        keyword: kw || undefined,
      })

      if (seq !== listRequestSeq.current) return

      const maxPage = Math.max(1, Math.ceil(res.total / reqPageSize) || 1)
      if (res.total > 0 && res.tasks.length === 0 && reqPage > 1) {
        reqPage = 1
        res = await fetchTaskList({
          page: 1,
          page_size: reqPageSize,
          subject_code: kw || undefined,
          keyword: kw || undefined,
        })
        if (seq !== listRequestSeq.current) return
      }

      const safePage = reqPage > maxPage ? 1 : reqPage

      setTasks(res.tasks)
      setTotal(res.total)
      if (safePage !== page) {
        setPage(safePage)
      }
    } catch (e) {
      if (seq !== listRequestSeq.current) return
      messageRef.current.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      if (seq === listRequestSeq.current) {
        setLoading(false)
      }
    }
  }, [appliedKeyword, page, pageSize])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const onSearch = (v: { keyword?: string }) => {
    const kw = (v.keyword ?? '').trim()
    setAppliedKeyword(kw)
    setPage(1)
  }

  const onReset = () => {
    form.resetFields()
    setAppliedKeyword('')
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
      title: '企标号',
      dataIndex: 'enterpriseStdNo',
      key: 'qb',
      width: 160,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: NoveltyTaskStatus) => {
        const m = STATUS_META[s]
        return <Tag color={m?.color ?? 'default'}>{m?.label ?? s}</Tag>
      },
    },
    {
      title: '查新结论',
      key: 'conclusion',
      width: 140,
      ellipsis: true,
      render: (_, row) => {
        if (!row.taskConclusion) return '—'
        const m = TASK_CONCLUSION_META[row.taskConclusion]
        return m?.label ?? row.taskSummary ?? '—'
      },
    },
    {
      title: '来源',
      key: 'source',
      width: 100,
      render: (_, row) =>
        row.source === 'upload' ? '企标上传' : row.source === 'national' ? '录入国标' : '标准号录入',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (iso: string) => (iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '—'),
    },
    {
      title: '操作',
      key: 'op',
      width: 180,
      render: (_, row) =>
        row.status === 'failed' ? (
          <Space size={0}>
            <Button
              type="link"
              size="small"
              icon={<RedoOutlined />}
              onClick={() => {
                void (async () => {
                  try {
                    await retryNoveltyTask(row.id)
                    message.success('已重新汇聚，请进入工作台确认专用表')
                    void loadList()
                  } catch (e) {
                    message.error(e instanceof Error ? e.message : '加载失败')
                  }
                })()
              }}
            >
              重试
            </Button>
            <Button type="link" size="small" onClick={() => navigate(`/novelty-search/tasks/${row.id}`)}>
              查看
            </Button>
          </Space>
        ) : (
          <Button type="link" size="small" onClick={() => navigate(`/novelty-search/tasks/${row.id}`)}>
            进入工作台
          </Button>
        ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        任务列表
      </Typography.Title>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        数据来自 <Typography.Text code>GET /api/v1/novelty-search/tasks</Typography.Text>
      </Typography.Paragraph>

      <Card bordered={false} styles={{ body: { paddingBottom: 8 } }}>
        <Form
          form={form}
          layout="inline"
          initialValues={{ keyword: '' }}
          onFinish={(vals) => onSearch(vals)}
          style={{ rowGap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <Form.Item label="关键字" name="keyword">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="企标号或任务标题"
              style={{ width: 280 }}
            />
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
            <Button
              type="text"
              icon={<ReloadOutlined />}
              aria-label="刷新"
              onClick={() => void loadList()}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/novelty-search/create')}>
              新建任务
            </Button>
          </Space>
        }
      >
        <Table<NoveltyTask>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={tasks}
          pagination={false}
          locale={{
            emptyText: (
              <Space direction="vertical" size="small" style={{ padding: '24px 0' }}>
                <Typography.Text type="secondary">
                  {total > 0 && tasks.length === 0
                    ? '当前页无数据，请返回第 1 页或重新查询'
                    : '暂无查新任务'}
                </Typography.Text>
                <Button type="primary" onClick={() => navigate('/novelty-search/create')}>
                  新建任务
                </Button>
              </Space>
            ),
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            showQuickJumper
            showTotal={(t) => `共 ${t} 条记录`}
            onChange={(p, ps) => {
              setPage(p)
              setPageSize(ps)
            }}
          />
        </div>
      </Card>
    </Space>
  )
}
