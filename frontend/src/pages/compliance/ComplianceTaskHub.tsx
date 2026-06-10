import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Popconfirm, Space, Table, Tabs, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import {
  deleteComplianceEvaluationTask,
  isComplianceEvaluationCompleted,
  setComplianceEvaluationTaskId,
  startNewComplianceEvaluation,
} from '@/services/compliance'
import { listEvaluations } from '@/services/compliance-api'
import type { ComplianceTaskOut } from '@/types/compliance-api'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'
import { WIZARD_STEP_TITLES } from '@/pages/compliance/ComplianceWizardPanel'

const STEP_LABELS = WIZARD_STEP_TITLES

type TaskListTab = 'in_progress' | 'history' | 'all'

function parseTaskListTab(raw: string | null): TaskListTab {
  if (raw === 'in_progress') return 'in_progress'
  if (raw === 'history' || raw === 'completed') return 'history'
  return 'all'
}

function taskStatusTag(task: ComplianceTaskOut) {
  if (task.parse_status === 'failed') return <Tag color="error">解析失败</Tag>
  if (isComplianceEvaluationCompleted(task)) return <Tag color="success">已完成</Tag>
  if (task.current_step > 1 || task.has_parse_result) return <Tag color="processing">进行中</Tag>
  return <Tag>草稿</Tag>
}

function isTaskInProgress(task: ComplianceTaskOut): boolean {
  return !isComplianceEvaluationCompleted(task) && task.parse_status !== 'failed'
}

const EMPTY_TEXT: Record<TaskListTab, string> = {
  in_progress: '暂无进行中的评价任务，可点击「新建评价」开始',
  history:
    '暂无已完成的评价。任务需在第 5 步「指标映射与技术对比」点击「人工审核通过」提交审核 5 后才会出现于此（后端 current_step≥6）',
  all: '暂无评价任务，请点击「新建评价」',
}

export default function ComplianceTaskHub() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [tasks, setTasks] = useState<ComplianceTaskOut[]>([])

  const filter = parseTaskListTab(searchParams.get('tab'))

  const setFilter = (tab: TaskListTab) => {
    if (tab === 'all') {
      setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ tab }, { replace: true })
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listEvaluations()
      setTasks(list)
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(
    () => ({
      inProgress: tasks.filter(isTaskInProgress).length,
      history: tasks.filter(isComplianceEvaluationCompleted).length,
      all: tasks.length,
    }),
    [tasks],
  )

  const filtered = useMemo(() => {
    if (filter === 'all') return tasks
    if (filter === 'history') return tasks.filter(isComplianceEvaluationCompleted)
    return tasks.filter(isTaskInProgress)
  }, [filter, tasks])

  const onContinue = (taskId: number) => {
    setComplianceEvaluationTaskId(taskId)
    navigate(`/compliance/evaluations/${taskId}`)
  }

  const onCreate = async () => {
    setCreating(true)
    try {
      const task = await startNewComplianceEvaluation()
      message.success('已创建新评价任务')
      navigate(`/compliance/evaluations/${task.id}`)
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setCreating(false)
    }
  }

  const onDelete = async (task: ComplianceTaskOut) => {
    setDeletingId(task.id)
    try {
      await deleteComplianceEvaluationTask(task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
      message.success('任务已删除')
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setDeletingId(null)
    }
  }

  const columns: ColumnsType<ComplianceTaskOut> = [
    {
      title: '企标号',
      dataIndex: 'subject_code',
      render: (v: string | null) => v?.trim() || '—',
    },
    {
      title: '上传文件',
      dataIndex: 'uploaded_file_name',
      ellipsis: true,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '当前步骤',
      key: 'step',
      render: (_, row) => {
        const idx = Math.min(5, Math.max(0, row.current_step - 1))
        return `${row.current_step} / 6 · ${STEP_LABELS[idx] ?? '—'}`
      },
    },
    {
      title: '状态',
      key: 'status',
      render: (_, row) => taskStatusTag(row),
    },
    {
      title: '解析',
      dataIndex: 'parse_status',
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, row) => (
        <Space size={4} wrap>
          <Button type="link" icon={<RightOutlined />} onClick={() => onContinue(row.id)}>
            {isComplianceEvaluationCompleted(row) ? '查看' : '继续评价'}
          </Button>
          <Popconfirm
            title="删除该评价任务？"
            description={
              isComplianceEvaluationCompleted(row)
                ? '将删除该已完成评价的任务记录、评价结果与关联制品，不可恢复。'
                : '将删除任务记录及关联制品目录，不可恢复。进行中的向导会话也会失效。'
            }
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => void onDelete(row)}
          >
            <Button
              type="link"
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

  return (
    <PageContainer
      header={{
        title: '合规性评价',
        subTitle: '进行中的任务可继续评价；提交审核 5 后的任务在「已完成的评价」中查看',
      }}
    >
      <Card style={{ marginBottom: 16 }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} loading={creating} onClick={() => void onCreate()}>
            新建评价
          </Button>
          <Button onClick={() => void load()}>刷新列表</Button>
        </Space>
        <Tabs
          activeKey={filter}
          onChange={(key) => setFilter(parseTaskListTab(key))}
          items={[
            { key: 'all', label: `全部（${counts.all}）` },
            { key: 'history', label: `已完成的评价（${counts.history}）` },
            { key: 'in_progress', label: `进行中（${counts.inProgress}）` },
          ]}
        />
      </Card>

      <Card>
        <Table<ComplianceTaskOut>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: EMPTY_TEXT[filter] }}
        />
      </Card>
    </PageContainer>
  )
}
