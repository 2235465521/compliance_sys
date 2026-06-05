import { ArrowLeftOutlined, FilePdfOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Space,
  Spin,
  Steps,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { NoveltyCompareResultTable } from '@/pages/novelty-search/components/NoveltyCompareResultTable'
import { NoveltyIndicatorsPanel } from '@/pages/novelty-search/components/NoveltyIndicatorsPanel'
import { NoveltyTaskConclusionAlert } from '@/pages/novelty-search/components/NoveltyTaskConclusionAlert'
import { useNoveltyTaskPoll } from '@/pages/novelty-search/hooks/useNoveltyTaskPoll'
import {
  confirmReferenceSheet,
  NoveltySearchApiError,
  saveReferenceSheetDraft,
} from '@/services/novelty-search'
import type { NoveltyTask, NoveltyTaskStatus, ReferenceSheetRow } from '@/types/novelty-search'

const STATUS_LABEL: Record<NoveltyTaskStatus, string> = {
  queued: '排队',
  loading_history: '汇聚历史',
  parsing: '解析中',
  pending_confirm: '待确认专用表',
  comparing: '比对中',
  completed: '已完成',
  failed: '失败',
}

function stepsForTask(task: NoveltyTask): { current: number; status?: 'error' } {
  if (task.status === 'failed') {
    const atParse = task.errorSummary?.includes('解析') || task.errorSummary?.includes('汇聚')
    return { current: atParse ? 1 : 3, status: 'error' }
  }
  const map: Record<NoveltyTaskStatus, number> = {
    queued: 0,
    loading_history: 1,
    parsing: 1,
    pending_confirm: 2,
    comparing: 3,
    completed: 4,
    failed: 3,
  }
  return { current: map[task.status] }
}

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const { task, setTask, loading, error, reload } = useNoveltyTaskPoll(taskId)

  const [sheetDraft, setSheetDraft] = useState<ReferenceSheetRow[]>([])
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!task) return
    setSheetDraft(task.referenceSheet.map((r) => ({ ...r })))
  }, [task?.id, task?.referenceSheet])

  const stepCfg = useMemo(() => (task ? stepsForTask(task) : { current: 0 }), [task])

  const onSaveDraft = async () => {
    if (!taskId) return
    setSaving(true)
    try {
      const updated = await saveReferenceSheetDraft(taskId, sheetDraft)
      setTask(updated)
      message.success('草稿已保存')
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onConfirmSheet = () => {
    if (!taskId || !task) return
    modal.confirm({
      title: '确认专用表并进入比对？',
      content: '确认后将按表中引用标准执行三列查新（补全年代号 / 首次查新最新号 / 本次最新号）。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setConfirming(true)
        try {
          const updated = await confirmReferenceSheet(taskId, sheetDraft)
          setTask(updated)
          message.success(updated.taskSummary ? `比对完成：${updated.taskSummary}` : '比对完成')
        } catch (e) {
          if (e instanceof NoveltySearchApiError && e.status === 422) {
            message.error(e.message)
          } else {
            message.error(e instanceof Error ? e.message : '确认失败')
          }
        } finally {
          setConfirming(false)
        }
      },
    })
  }

  if (!taskId) {
    return <Empty description="缺少任务 ID" />
  }

  if (loading && !task) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" tip="加载任务…" />
      </div>
    )
  }

  if (!task) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description={error ?? '未找到该任务'}>
          <Button type="primary" onClick={() => navigate('/novelty-search')}>
            返回任务列表
          </Button>
        </Empty>
      </div>
    )
  }

  const compareDisabled = task.status !== 'completed' || task.compareRows.length === 0
  const totalRows = task.compareTotal || task.referenceSheet.length

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space align="center" wrap>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/novelty-search')}>
            返回列表
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {task.title}
          </Typography.Title>
          <Tag>{STATUS_LABEL[task.status]}</Tag>
          <Tag>{task.id}</Tag>
        </Space>

        <Card size="small">
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="企标号">{task.enterpriseStdNo}</Descriptions.Item>
            <Descriptions.Item label="任务标题">{task.title}</Descriptions.Item>
            <Descriptions.Item label="来源">
              {task.source === 'upload'
                ? `企标上传${task.fileName ? `（${task.fileName}）` : ''}`
                : task.source === 'national'
                  ? '上传国标'
                  : '标准号录入'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {task.createdAt.replace('T', ' ').slice(0, 19)}
            </Descriptions.Item>
            {task.sourceEvaluations && task.sourceEvaluations.length > 0 ? (
              <Descriptions.Item label="历史评价来源" span={3}>
                {task.sourceEvaluations
                  .map((s) => `${s.title} (#${s.sourceId})`)
                  .join('；')}
              </Descriptions.Item>
            ) : null}
          </Descriptions>
          <Steps
            size="small"
            current={stepCfg.current}
            status={stepCfg.status}
            items={[
              { title: '排队' },
              { title: '汇聚/解析' },
              { title: '待确认专用表' },
              { title: '比对中' },
              { title: '已完成' },
            ]}
          />
        </Card>

        {task.status === 'failed' && task.errorSummary ? (
          <Alert type="error" showIcon message="任务失败" description={task.errorSummary} />
        ) : null}

        <Tabs
          defaultActiveKey="sheet"
          items={[
            {
              key: 'sheet',
              label: '专用表与确认',
              children: (
                <Card size="small" title="企标查新专用表">
                  {task.status === 'failed' ? (
                    <Empty description={task.errorSummary ?? '任务失败'} />
                  ) : (
                    <>
                      <Table<ReferenceSheetRow>
                        size="small"
                        pagination={false}
                        rowKey="id"
                        dataSource={sheetDraft}
                        scroll={{ x: 720 }}
                        columns={[
                          {
                            title: '标准号',
                            dataIndex: 'stdNo',
                            width: 160,
                            render: (v, row, index) => (
                              <Input
                                value={v as string}
                                disabled={task.sheetConfirmed}
                                onChange={(e) => {
                                  const next = [...sheetDraft]
                                  next[index] = { ...row, stdNo: e.target.value }
                                  setSheetDraft(next)
                                }}
                              />
                            ),
                          },
                          {
                            title: '标准名称',
                            dataIndex: 'stdName',
                            render: (v, row, index) => (
                              <Input
                                value={v as string}
                                disabled={task.sheetConfirmed}
                                onChange={(e) => {
                                  const next = [...sheetDraft]
                                  next[index] = { ...row, stdName: e.target.value }
                                  setSheetDraft(next)
                                }}
                              />
                            ),
                          },
                          {
                            title: '技术指标片段',
                            dataIndex: 'techFragment',
                            ellipsis: true,
                            render: (v, row, index) => (
                              <Input
                                value={(v as string) || ''}
                                disabled={task.sheetConfirmed}
                                onChange={(e) => {
                                  const next = [...sheetDraft]
                                  next[index] = { ...row, techFragment: e.target.value }
                                  setSheetDraft(next)
                                }}
                              />
                            ),
                          },
                          {
                            title: '备注',
                            dataIndex: 'remark',
                            width: 140,
                            render: (v, row, index) => (
                              <Input
                                value={(v as string) || ''}
                                disabled={task.sheetConfirmed}
                                onChange={(e) => {
                                  const next = [...sheetDraft]
                                  next[index] = { ...row, remark: e.target.value }
                                  setSheetDraft(next)
                                }}
                              />
                            ),
                          },
                        ]}
                      />
                      <Space style={{ marginTop: 16 }} wrap>
                        <Button
                          onClick={() => void onSaveDraft()}
                          loading={saving}
                          disabled={task.sheetConfirmed}
                        >
                          保存草稿
                        </Button>
                        {task.status === 'pending_confirm' ? (
                          <Tooltip
                            title={
                              sheetDraft.length === 0 ? '专用表为空，请补充引用行后再确认' : undefined
                            }
                          >
                            <span>
                              <Button
                                type="primary"
                                loading={confirming}
                                disabled={sheetDraft.length === 0}
                                onClick={() => onConfirmSheet()}
                              >
                                确认专用表并执行三列比对
                              </Button>
                            </span>
                          </Tooltip>
                        ) : null}
                        {task.sheetConfirmed ? <Tag color="success">已确认</Tag> : null}
                        {task.status === 'completed' ? (
                          <Tag color="blue">比对已完成，专用表已锁定</Tag>
                        ) : null}
                      </Space>
                    </>
                  )}
                </Card>
              ),
            },
            {
              key: 'compare',
              label: '比对明细（三列）',
              disabled: compareDisabled,
              children: (
                <Card size="small" title="规范性引用三列查新结果">
                  <NoveltyTaskConclusionAlert task={task} />
                  <NoveltyCompareResultTable
                    dataSource={task.compareRows}
                    compareDone={task.compareDone}
                    compareTotal={totalRows}
                  />
                </Card>
              ),
            },
            {
              key: 'indicators',
              label: '历史指标',
              disabled: task.status === 'failed',
              children: (
                <Card size="small" title="历次评价指标汇总">
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                    数据来自 <Typography.Text code>GET .../tasks/{'{id}'}/indicators</Typography.Text>
                    （仅当 <Typography.Text code>indicators_available=true</Typography.Text> 时加载）。
                  </Typography.Paragraph>
                  <NoveltyIndicatorsPanel
                    taskId={task.id}
                    indicatorsAvailable={Boolean(task.indicatorsAvailable)}
                  />
                </Card>
              ),
            },
            {
              key: 'report',
              label: '报告与归档',
              children: (
                <Card size="small" title="查新报告（PDF）">
                  <Alert
                    type="info"
                    showIcon
                    message="PDF 报告尚未开放"
                    description="后端 POST /tasks/{id}/report 当前返回 501，请以后端上线后再启用生成与下载。"
                  />
                  <Space style={{ marginTop: 16 }}>
                    <Button type="primary" icon={<FilePdfOutlined />} disabled>
                      生成查新 PDF
                    </Button>
                    <Button disabled>下载报告</Button>
                  </Space>
                </Card>
              ),
            },
          ]}
        />
      </Space>
    </div>
  )
}
