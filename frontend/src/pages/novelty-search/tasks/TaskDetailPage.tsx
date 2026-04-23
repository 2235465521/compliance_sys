import { ArrowLeftOutlined, FilePdfOutlined } from '@ant-design/icons'
import type { ProColumns } from '@ant-design/pro-components'
import { ProTable } from '@ant-design/pro-components'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Progress,
  Space,
  Spin,
  Steps,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  confirmReferenceSheet,
  requestReportPdf,
  runDemoParsingSequence,
  saveReferenceSheetDraft,
} from '@/services/novelty-search'
import { useNoveltyStore } from '@/stores/novelty-search'
import { markParsingDemoScheduled } from '@/pages/novelty-search/utils/parsing-demo-scheduled'
import type { CompareConclusion, CompareRow, NoveltyTask, ReferenceSheetRow } from '@/types/novelty-search'

const CONCLUSION_META: Record<
  CompareConclusion,
  { label: string; color: 'success' | 'error' | 'warning' | 'default' | 'processing' }
> = {
  active: { label: '现行有效', color: 'success' },
  obsolete: { label: '已废止', color: 'error' },
  incoming: { label: '即将实施', color: 'warning' },
  unknown: { label: '待核定', color: 'default' },
  pending: { label: '待比对', color: 'processing' },
}

function stepsForTask(task: NoveltyTask): { current: number; status?: 'error' } {
  if (task.status === 'failed') {
    const atParse = task.errorSummary?.includes('解析')
    return { current: atParse ? 1 : 3, status: 'error' }
  }
  const map: Record<NoveltyTask['status'], number> = {
    queued: 0,
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

  const task = useNoveltyStore(
    useCallback((s) => (taskId ? s.tasks.find((t) => t.id === taskId) : undefined), [taskId]),
  )

  const [sheetDraft, setSheetDraft] = useState<ReferenceSheetRow[]>([])
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)

  useEffect(() => {
    if (!task || task.status !== 'parsing' || task.source !== 'upload') return
    if (!markParsingDemoScheduled(task.id)) return
    void runDemoParsingSequence(task.id).catch(() => {
      message.error('演示解析失败')
    })
  }, [message, task])

  useEffect(
    () => {
      if (!task) return
      setSheetDraft(task.referenceSheet.map((r) => ({ ...r })))
    },
    // 仅在任务切换或专用表引用变化时同步，避免依赖整个 task 导致比对进度更新时误重置编辑中草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task?.id, task?.referenceSheet],
  )

  const stepCfg = useMemo(() => (task ? stepsForTask(task) : { current: 0 }), [task])

  const onSaveDraft = async () => {
    if (!taskId) return
    setSaving(true)
    try {
      await saveReferenceSheetDraft(taskId, sheetDraft)
      message.success('草稿已保存（演示）')
    } finally {
      setSaving(false)
    }
  }

  const onConfirmSheet = () => {
    if (!taskId || !task) return
    modal.confirm({
      title: '确认专用表并进入比对？',
      content: '确认后将按当前表格发起演示比对流水线。真实环境由后端编排。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setConfirming(true)
        try {
          await saveReferenceSheetDraft(taskId, sheetDraft)
          await confirmReferenceSheet(taskId)
          message.success('已确认，正在比对（演示）…')
        } finally {
          setConfirming(false)
        }
      },
    })
  }

  const onGeneratePdf = async () => {
    if (!taskId) return
    setReportBusy(true)
    try {
      await requestReportPdf(taskId)
      message.success('报告已生成（演示）')
    } catch {
      message.error('生成失败（演示）')
    } finally {
      setReportBusy(false)
    }
  }

  const compareColumns: ProColumns<CompareRow>[] = [
    { title: '标准号', dataIndex: 'stdNo', width: 140, ellipsis: true },
    { title: '标准名称', dataIndex: 'stdName', ellipsis: true },
    {
      title: '库内存在',
      dataIndex: 'existsInDb',
      width: 100,
      render: (_, r) => (r.existsInDb ? <Tag color="blue">是</Tag> : <Tag color="red">否</Tag>),
    },
    {
      title: '结论',
      dataIndex: 'conclusion',
      width: 110,
      render: (_, r) => {
        const m = CONCLUSION_META[r.conclusion]
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    {
      title: '替代标准',
      search: false,
      ellipsis: true,
      render: (_, r) =>
        r.replacementNo ? (
          <Typography.Text>
            {r.replacementNo} {r.replacementName ? `· ${r.replacementName}` : ''}
          </Typography.Text>
        ) : (
          '—'
        ),
    },
    {
      title: '异常',
      dataIndex: 'rowError',
      ellipsis: true,
      search: false,
      render: (t) => t || '—',
    },
  ]

  if (!taskId) {
    return <Empty description="缺少任务 ID" />
  }

  if (!task) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="未找到该任务（可能已刷新导致演示数据丢失）">
          <Button type="primary" onClick={() => navigate('/novelty-search')}>
            返回任务列表
          </Button>
        </Empty>
      </div>
    )
  }

  const compareDisabled = !task.sheetConfirmed && task.status !== 'comparing' && task.status !== 'completed'
  const totalRows = task.referenceSheet.length
  const compareProgress =
    task.status === 'comparing' && totalRows > 0 ? Math.round((task.compareDone / totalRows) * 100) : undefined

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="工作台为前端演示"
        description="任务阶段、专用表、比对与报告均来自 Mock Store；与标准库 HTTP、WebSocket 未绑定。对接后端后请替换 services/novelty-search.ts。"
      />

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space align="center" wrap>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/novelty-search')}>
            返回列表
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {task.title}
          </Typography.Title>
          <Tag>{task.id}</Tag>
        </Space>

        <Card size="small">
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="企业">{task.enterpriseName}</Descriptions.Item>
            <Descriptions.Item label="企标号">{task.enterpriseStdNo}</Descriptions.Item>
            <Descriptions.Item label="任务标题">{task.title}</Descriptions.Item>
            <Descriptions.Item label="来源">
              {task.source === 'upload' ? `企标上传${task.fileName ? `（${task.fileName}）` : ''}` : '标准号录入'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{task.createdAt.replace('T', ' ').slice(0, 19)}</Descriptions.Item>
          </Descriptions>
          <Steps
            size="small"
            current={stepCfg.current}
            status={stepCfg.status}
            items={[
              { title: '排队' },
              { title: '解析中' },
              { title: '待确认专用表' },
              { title: '比对中' },
              { title: '已完成' },
            ]}
          />
        </Card>

        <Tabs
          defaultActiveKey="sheet"
          items={[
            {
              key: 'sheet',
              label: '专用表与确认',
              children: (
                <Card size="small" title="企标查新专用表">
                  {task.status === 'parsing' ? (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Spin tip="正在解析企标并生成初稿（演示）…" />
                      <Typography.Text type="secondary">
                        真实环境为 Celery 异步 + WebSocket；此处为定时 Mock。
                      </Typography.Text>
                    </Space>
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
                        <Button onClick={() => void onSaveDraft()} loading={saving} disabled={task.sheetConfirmed}>
                          保存草稿
                        </Button>
                        <Tooltip
                          title={
                            task.sheetConfirmed
                              ? '已确认，不可重复提交'
                              : sheetDraft.length === 0
                                ? '请等待解析完成或补充行后再确认'
                                : undefined
                          }
                        >
                          <span>
                            <Button
                              type="primary"
                              loading={confirming}
                              disabled={task.sheetConfirmed || sheetDraft.length === 0}
                              onClick={() => onConfirmSheet()}
                            >
                              确认专用表并进入比对
                            </Button>
                          </span>
                        </Tooltip>
                        {task.sheetConfirmed ? <Tag color="success">已确认</Tag> : null}
                      </Space>
                    </>
                  )}
                </Card>
              ),
            },
            {
              key: 'compare',
              label: '比对明细',
              disabled: compareDisabled,
              children: (
                <Card size="small" title="企标查新比对明细表">
                  {task.status === 'comparing' ? (
                    <Progress percent={compareProgress ?? 30} status="active" style={{ marginBottom: 16 }} />
                  ) : null}
                  <ProTable<CompareRow>
                    rowKey="id"
                    search={false}
                    options={false}
                    pagination={false}
                    dataSource={task.compareRows}
                    columns={compareColumns}
                    expandable={{
                      expandedRowRender: (r) => (
                        <Typography.Paragraph style={{ margin: 0 }}>
                          <Typography.Text strong>谱系摘要（演示）</Typography.Text>
                          <br />
                          {r.pedigreeSummary || '—'}
                        </Typography.Paragraph>
                      ),
                      rowExpandable: (r) => Boolean(r.pedigreeSummary || r.replacementNo),
                    }}
                    locale={{
                      emptyText: (
                        <Empty description="暂无比对结果，请先完成「专用表与确认」" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                      ),
                    }}
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
                    style={{ marginBottom: 16 }}
                    message="与合规导出的区别"
                    description={
                      <>
                        说明文档中的{' '}
                        <Typography.Text code>export-report</Typography.Text> 为合规审查 Excel，不可替代查新结论
                        PDF；真实查新下载路径待后端提供。
                      </>
                    }
                  />
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<FilePdfOutlined />}
                        loading={reportBusy || task.reportState === 'generating'}
                        disabled={task.status !== 'completed' || task.reportState === 'ready'}
                        onClick={() => void onGeneratePdf()}
                      >
                        生成查新 PDF（演示）
                      </Button>
                      <Button
                        disabled={task.status !== 'completed'}
                        onClick={() =>
                          message.info('演示：已按「无报告」归档；真实环境应写入查新历史并保留比对结果。')
                        }
                      >
                        跳过 PDF，仅归档
                      </Button>
                      <Button
                        disabled={task.reportState !== 'ready'}
                        onClick={() => message.info('演示环境不提供真实文件流；对接后在此触发下载 URL。')}
                      >
                        下载报告
                      </Button>
                    </Space>
                    {task.reportState === 'ready' && task.reportGeneratedAt ? (
                      <Typography.Text type="success">
                        报告已就绪（演示）：{task.reportGeneratedAt.replace('T', ' ').slice(0, 19)}
                      </Typography.Text>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="预览区占位：嵌入 PDF 预览待联调" />
                    )}
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
