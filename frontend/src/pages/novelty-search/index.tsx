import { DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Pagination, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NoveltyCompareResultTable } from '@/pages/novelty-search/components/NoveltyCompareResultTable'
import { NoveltyTaskConclusionAlert } from '@/pages/novelty-search/components/NoveltyTaskConclusionAlert'
import { TASK_CONCLUSION_META } from '@/pages/novelty-search/utils/noveltyCompareLabels'
import {
  deleteNoveltyTask,
  fetchTaskById,
  fetchTaskList,
  NoveltySearchApiError,
  runNoveltySearchByQbCode,
} from '@/services/novelty-search'
import type { NoveltyTask, NoveltyTaskStatus } from '@/types/novelty-search'

const STATUS_META: Record<NoveltyTaskStatus, { label: string; color: string }> = {
  queued: { label: '排队', color: 'default' },
  loading_history: { label: '汇聚中', color: 'processing' },
  parsing: { label: '解析中', color: 'processing' },
  pending_confirm: { label: '待确认', color: 'warning' },
  comparing: { label: '比对中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

export default function NoveltySearchPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ qbCode: string }>()

  const [searching, setSearching] = useState(false)
  const [currentTask, setCurrentTask] = useState<NoveltyTask | null>(null)
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null)

  const [history, setHistory] = useState<NoveltyTask[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(10)
  const [historyKeyword, setHistoryKeyword] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const historySeq = useRef(0)

  const loadHistory = useCallback(async () => {
    const seq = ++historySeq.current
    setHistoryLoading(true)
    try {
      const res = await fetchTaskList({
        page: historyPage,
        page_size: historyPageSize,
        qb_code: historyKeyword || undefined,
        keyword: historyKeyword || undefined,
      })
      if (seq !== historySeq.current) return
      setHistory(res.tasks)
      setHistoryTotal(res.total)
    } catch (e) {
      if (seq !== historySeq.current) return
      message.error(e instanceof Error ? e.message : '加载历史记录失败')
    } finally {
      if (seq === historySeq.current) setHistoryLoading(false)
    }
  }, [historyKeyword, historyPage, historyPageSize, message])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleSearchError = (e: unknown) => {
    if (e instanceof NoveltySearchApiError) {
      if (e.status === 422 || e.message.includes('empty_history') || e.message.includes('无历史')) {
        message.error(
          e.message.includes('empty_history') || e.message.includes('无')
            ? e.message
            : '该企标暂无合规/批量评价历史，请先在合规模块或批量评价中完成评价后再查新。',
        )
        return
      }
      if (e.status === 503) {
        message.error(e.message || '服务依赖未就绪，请联系管理员')
        return
      }
      message.error(e.message)
      return
    }
    message.error(e instanceof Error ? e.message : '查新失败')
  }

  const onRunSearch = async (values: { qbCode: string }) => {
    const code = values.qbCode?.trim()
    if (!code) {
      message.warning('请输入企标号')
      return
    }
    setSearching(true)
    setViewingHistoryId(null)
    try {
      const task = await runNoveltySearchByQbCode(code)
      setCurrentTask(task)
      setHistoryKeyword(code)
      setHistoryPage(1)
      message.success(task.taskSummary ? `查新完成：${task.taskSummary}` : '查新完成')
      const hist = await fetchTaskList({
        page: 1,
        page_size: historyPageSize,
        qb_code: code,
        keyword: code,
      })
      setHistory(hist.tasks)
      setHistoryTotal(hist.total)
    } catch (e) {
      handleSearchError(e)
    } finally {
      setSearching(false)
    }
  }

  const clearCurrentIfDeleted = (taskId: string) => {
    if (viewingHistoryId === taskId || currentTask?.id === taskId) {
      setCurrentTask(null)
      setViewingHistoryId(null)
    }
  }

  const onDeleteHistory = async (row: NoveltyTask) => {
    setDeletingId(row.id)
    try {
      await deleteNoveltyTask(row.id)
      message.success('删除成功')
      clearCurrentIfDeleted(row.id)
      const res = await fetchTaskList({
        page: historyPage,
        page_size: historyPageSize,
        qb_code: historyKeyword || undefined,
        keyword: historyKeyword || undefined,
      })
      if (res.tasks.length === 0 && res.total > 0 && historyPage > 1) {
        setHistoryPage((p) => Math.max(1, p - 1))
      } else {
        setHistory(res.tasks)
        setHistoryTotal(res.total)
      }
    } catch (e) {
      if (e instanceof NoveltySearchApiError) {
        if (e.status === 403) {
          message.error('无权删除该任务')
          return
        }
        if (e.status === 404) {
          message.warning('任务不存在或已删除')
          clearCurrentIfDeleted(row.id)
          void loadHistory()
          return
        }
      }
      message.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const onViewHistory = async (row: NoveltyTask) => {
    setViewingHistoryId(row.id)
    setSearching(true)
    try {
      const task = await fetchTaskById(row.id)
      if (!task) {
        message.error('记录不存在')
        return
      }
      setCurrentTask(task)
      form.setFieldsValue({ qbCode: task.enterpriseStdNo !== '—' ? task.enterpriseStdNo : '' })
      if (task.status !== 'completed') {
        message.info('该记录尚未完成查新比对，仅展示已有信息')
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载记录失败')
    } finally {
      setSearching(false)
    }
  }

  const historyColumns: ColumnsType<NoveltyTask> = [
    {
      title: '企标号',
      dataIndex: 'enterpriseStdNo',
      width: 180,
      ellipsis: true,
    },
    {
      title: '任务标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: NoveltyTaskStatus) => {
        const m = STATUS_META[s]
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    {
      title: '查新结论',
      width: 140,
      ellipsis: true,
      render: (_, row) => {
        if (!row.taskConclusion) return '—'
        return TASK_CONCLUSION_META[row.taskConclusion]?.label ?? row.taskSummary ?? '—'
      },
    },
    {
      title: '查询时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (iso: string) => (iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '—'),
    },
    {
      title: '操作',
      width: 160,
      render: (_, row) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => void onViewHistory(row)}>
            查看
          </Button>
          <Popconfirm
            title="确定删除该查新记录？"
            description="删除后无法恢复，不影响合规/批量评价原始数据与查新基线。"
            okText="删除"
            okType="danger"
            cancelText="取消"
            onConfirm={() => void onDeleteHistory(row)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deletingId === row.id}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const showCompare =
    currentTask &&
    (currentTask.status === 'completed' || currentTask.compareRows.length > 0)

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} style={{ marginBottom: 8 }}>
          标准查新
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          输入企标号即可查新：系统自动汇聚历史合规/批量评价中的规范性引用，并给出三列比对结果。
        </Typography.Paragraph>
      </div>

      <Card bordered={false}>
        <Form form={form} layout="inline" onFinish={onRunSearch} style={{ flexWrap: 'wrap', gap: 12 }}>
          <Form.Item
            label="企标号"
            name="qbCode"
            rules={[{ required: true, message: '请输入企标号' }]}
            style={{ marginBottom: 0 }}
          >
            <Input
              placeholder="例如 Q/MPSTC 0010-2018"
              allowClear
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              style={{ width: 320 }}
              onPressEnter={() => form.submit()}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={searching}>
              开始查新
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {currentTask && (
        <Card
          bordered={false}
          title={
            <Space>
              <span>查新结果</span>
              <Typography.Text type="secondary">
                {currentTask.enterpriseStdNo}
                {viewingHistoryId ? '（历史记录）' : ''}
              </Typography.Text>
            </Space>
          }
        >
          <NoveltyTaskConclusionAlert task={currentTask} />
          {showCompare ? (
            <NoveltyCompareResultTable
              dataSource={currentTask.compareRows}
              loading={searching}
              compareDone={currentTask.compareDone}
              compareTotal={currentTask.compareTotal}
            />
          ) : (
            <Typography.Text type="secondary">
              {currentTask.status === 'failed'
                ? currentTask.errorSummary || '查新失败'
                : '暂无比对结果，请稍后从历史记录中查看或重新查新。'}
            </Typography.Text>
          )}
        </Card>
      )}

      <Card bordered={false} title="历史查询记录">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Form
            layout="inline"
            onFinish={(v) => {
              setHistoryKeyword((v.filter ?? '').trim())
              setHistoryPage(1)
            }}
            initialValues={{ filter: '' }}
          >
            <Form.Item label="筛选企标号" name="filter">
              <Input allowClear placeholder="可选" style={{ width: 240 }} />
            </Form.Item>
            <Form.Item>
              <Button type="default" htmlType="submit">
                筛选
              </Button>
            </Form.Item>
          </Form>

          <Table<NoveltyTask>
            rowKey="id"
            size="middle"
            loading={historyLoading}
            columns={historyColumns}
            dataSource={history}
            pagination={false}
            locale={{ emptyText: '暂无历史查新记录' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination
              current={historyPage}
              pageSize={historyPageSize}
              total={historyTotal}
              showSizeChanger
              showTotal={(t) => `共 ${t} 条`}
              onChange={(p, ps) => {
                setHistoryPage(p)
                setHistoryPageSize(ps)
              }}
            />
          </div>
        </Space>
      </Card>
    </Space>
  )
}
