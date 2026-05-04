import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { ProTable } from '@ant-design/pro-components'
import { App, Button, Card, DatePicker, Drawer, Form, Input, Modal, Select, Space, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import AuditDiffViewer from '@/components/AuditDiffViewer'
import { getAuditLogById, listAuditLogs } from '@/services/system'
import { useSystemStore } from '@/stores/system'
import type { AuditLogEntry } from '@/types/system'

const MODULE_OPTIONS = [
  { value: '', label: '全部模块' },
  { value: '标准库', label: '标准库' },
  { value: '查新服务', label: '查新服务' },
  { value: '企业档案', label: '企业档案' },
  { value: '认证', label: '认证' },
]

const ACTION_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: '修改', label: '修改' },
  { value: '导出', label: '导出' },
  { value: '登录', label: '登录' },
]

export default function SystemAuditLogPage() {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>(null)
  const isSuper = useSystemStore((s) => s.viewerRole === 'super_admin')
  const [form] = Form.useForm<{
    keyword?: string
    module?: string
    actionType?: string
    actorUsername?: string
    range?: [Dayjs | null, Dayjs | null] | null
  }>()
  const [applied, setApplied] = useState({
    keyword: '',
    module: '',
    actionType: '',
    actorUsername: '',
    timeFrom: undefined as string | undefined,
    timeTo: undefined as string | undefined,
  })
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<AuditLogEntry | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  if (!isSuper) {
    return <Navigate to="/system/users" replace />
  }

  const openDetail = async (row: AuditLogEntry) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const d = await getAuditLogById(row.id)
      setDetail(d)
    } finally {
      setDetailLoading(false)
    }
  }

  const columns: ProColumns<AuditLogEntry>[] = [
    {
      title: '时间',
      dataIndex: 'occurredAt',
      width: 180,
      valueType: 'dateTime',
      search: false,
    },
    { title: '操作人', dataIndex: 'actorUsername', width: 120, ellipsis: true, search: false },
    { title: 'IP', dataIndex: 'ip', width: 130, search: false },
    { title: '模块', dataIndex: 'module', width: 100, ellipsis: true, search: false },
    { title: '操作类型', dataIndex: 'actionType', width: 100, search: false },
    { title: '摘要', dataIndex: 'summary', ellipsis: true, search: false },
    {
      title: '结果',
      dataIndex: 'result',
      width: 90,
      search: false,
      render: (_, row) =>
        row.result === 'success' ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>,
    },
    {
      title: '操作',
      valueType: 'option',
      width: 100,
      search: false,
      render: (_, row) => [
        <Button key="d" type="link" onClick={() => void openDetail(row)}>
          查看详情
        </Button>,
      ],
    },
  ]

  const doRequest = useCallback(
    async (params: { current?: number; pageSize?: number }) => {
      try {
        const { list, total } = await listAuditLogs({
          keyword: applied.keyword,
          module: applied.module || undefined,
          actionType: applied.actionType || undefined,
          actorUsername: applied.actorUsername || undefined,
          timeFrom: applied.timeFrom,
          timeTo: applied.timeTo,
          page: params.current ?? 1,
          pageSize: params.pageSize ?? 10,
        })
        return { data: list, success: true, total }
      } catch {
        message.error('加载审计日志失败（Mock）')
        return { data: [], success: false, total: 0 }
      }
    },
    [applied, message],
  )

  const exportMock = () => {
    Modal.confirm({
      title: '导出审计日志',
      content: '演示环境：确认后将模拟异步导出任务，不会下载真实文件。',
      okText: '确认导出',
      onOk: () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            message.success('已提交导出任务（Mock）')
            resolve()
          }, 600)
        }),
    })
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        审计日志
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        与 <Typography.Text code>/api/audit/pending_indexes</Typography.Text> 等「指标审核台」接口无关；系统审计 REST
        待后端补充后替换 Mock。
      </Typography.Paragraph>

      <Card bordered={false} styles={{ body: { paddingBottom: 8 } }}>
        <Form
          form={form}
          layout="inline"
          initialValues={{
            keyword: '',
            module: '',
            actionType: '',
            actorUsername: '',
            range: null,
          }}
          onFinish={(v) => {
            const r = v.range
            setApplied({
              keyword: (v.keyword ?? '').trim(),
              module: (v.module as string) ?? '',
              actionType: (v.actionType as string) ?? '',
              actorUsername: (v.actorUsername ?? '').trim(),
              timeFrom: r?.[0] ? r[0]!.startOf('second').toISOString() : undefined,
              timeTo: r?.[1] ? r[1]!.endOf('second').toISOString() : undefined,
            })
            setTimeout(() => actionRef.current?.reload(), 0)
          }}
          style={{ rowGap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <Form.Item label="时间范围" name="range">
            <DatePicker.RangePicker showTime style={{ width: 320 }} />
          </Form.Item>
          <Form.Item label="操作人" name="actorUsername">
            <Input allowClear placeholder="用户名" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="模块" name="module">
            <Select options={MODULE_OPTIONS} style={{ width: 140 }} allowClear />
          </Form.Item>
          <Form.Item label="操作类型" name="actionType">
            <Select options={ACTION_OPTIONS} style={{ width: 140 }} allowClear />
          </Form.Item>
          <Form.Item label="关键字" name="keyword">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="摘要 / IP / 模块…"
              style={{ width: 220 }}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button
                type="link"
                htmlType="button"
                onClick={() => {
                  form.resetFields()
                  setApplied({
                    keyword: '',
                    module: '',
                    actionType: '',
                    actorUsername: '',
                    timeFrom: undefined,
                    timeTo: undefined,
                  })
                  setTimeout(() => actionRef.current?.reload(), 0)
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <ProTable<AuditLogEntry>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        options={false}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        dateFormatter="string"
        headerTitle="审计记录"
        request={doRequest}
        key={`${applied.keyword}-${applied.module}-${applied.actionType}-${applied.actorUsername}-${applied.timeFrom}-${applied.timeTo}`}
        toolBarRender={() => [
          <Button key="reload" icon={<ReloadOutlined />} onClick={() => actionRef.current?.reload()}>
            刷新
          </Button>,
          <Button key="export" icon={<DownloadOutlined />} onClick={exportMock}>
            导出
          </Button>,
        ]}
      />

      <Drawer
        title="审计详情"
        width={640}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        destroyOnClose
      >
        {detailLoading ? (
          <Typography.Text type="secondary">加载中…</Typography.Text>
        ) : detail ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Typography.Text type="secondary">时间</Typography.Text>
              <Typography.Text>{dayjs(detail.occurredAt).format('YYYY-MM-DD HH:mm:ss')}</Typography.Text>
              <Typography.Text type="secondary">操作人</Typography.Text>
              <Typography.Text>{detail.actorUsername}</Typography.Text>
              <Typography.Text type="secondary">IP</Typography.Text>
              <Typography.Text>{detail.ip}</Typography.Text>
              <Typography.Text type="secondary">模块 / 类型</Typography.Text>
              <Typography.Text>
                {detail.module} / {detail.actionType}
              </Typography.Text>
              <Typography.Text type="secondary">摘要</Typography.Text>
              <Typography.Text>{detail.summary}</Typography.Text>
              <Typography.Text type="secondary">结果</Typography.Text>
              <div>{detail.result === 'success' ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>}</div>
            </Space>
            <div>
              <Typography.Title level={5}>Diff</Typography.Title>
              <AuditDiffViewer
                changes={detail.changes}
                failed={detail.result === 'failure'}
                failureHint="本条为演示失败记录；真实环境应由后端返回错误码与可选快照字段。"
              />
            </div>
          </Space>
        ) : (
          <Typography.Text type="secondary">未找到记录</Typography.Text>
        )}
      </Drawer>
    </Space>
  )
}
