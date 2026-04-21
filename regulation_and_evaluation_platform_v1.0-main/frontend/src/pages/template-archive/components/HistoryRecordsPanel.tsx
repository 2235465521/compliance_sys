import { ProTable } from '@ant-design/pro-components'
import { FileTextOutlined } from '@ant-design/icons'
import { Button, DatePicker, Form, Input, Select, Space, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import type { ArchiveHistoryRecord } from '@/types/template-archive'
import { useTemplateArchiveStore } from '@/stores/template-archive'

const STATUS_OPTIONS = [
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
  { label: '进行中', value: 'running' },
]

type PreviewFn = (title: string, payload: unknown, pdfUrl?: string) => void

export function HistoryRecordsPanel({ onPreview }: { onPreview: PreviewFn }) {
  const [form] = Form.useForm<{
    keyword?: string
    status?: string
    enterprise?: string
    operator?: string
    taskType?: string
  }>()
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)

  const records = useTemplateArchiveStore((s) => s.records)
  const loading = useTemplateArchiveStore((s) => s.recordsLoading)
  const fetchRecords = useTemplateArchiveStore((s) => s.fetchRecords)

  useEffect(() => {
    void fetchRecords()
  }, [fetchRecords])

  function statusPill(s: ArchiveHistoryRecord['status']) {
    if (s === 'success') return <span className="tplarch-pill tplarch-pill--success">成功</span>
    if (s === 'failed') return <span className="tplarch-pill tplarch-pill--danger">失败</span>
    return <span className="tplarch-pill tplarch-pill--processing">进行中</span>
  }

  const columns: ColumnsType<ArchiveHistoryRecord> = useMemo(
    () => [
      {
        title: '记录名称',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
        render: (name: string) => (
          <div className="tplarch-row-title">
            <span className="tplarch-avatar" aria-hidden="true">
              <FileTextOutlined />
            </span>
            <span className="tplarch-row-title-text">{name}</span>
          </div>
        ),
      },
      { title: '企业', dataIndex: 'enterprise', key: 'enterprise', width: 160, ellipsis: true },
      { title: '操作人', dataIndex: 'operatorName', key: 'operatorName', width: 120 },
      {
        title: '任务类型',
        dataIndex: 'taskType',
        key: 'taskType',
        width: 140,
        render: (t?: string) => t || '—',
      },
      {
        title: '模块',
        dataIndex: 'module',
        key: 'module',
        width: 120,
        render: (m: string) => <Tag className="tplarch-tag">{m}</Tag>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (s: ArchiveHistoryRecord['status']) => statusPill(s),
      },
      { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 200 },
      {
        title: '操作',
        key: 'actions',
        width: 200,
        render: (_, row) => (
          <Space size={8}>
            <Button
              type="link"
              onClick={() => onPreview(`历史记录：${row.name}`, row)}
            >
              查看
            </Button>
            <Button
              type="link"
              disabled={!row.reportId}
              onClick={() =>
                onPreview(`报告：${row.reportId}`, {
                  reportId: row.reportId,
                  record: row,
                })
              }
            >
              打开报告
            </Button>
          </Space>
        ),
      },
    ],
    [onPreview],
  )

  function buildQuery() {
    const v = form.getFieldsValue()
    return {
      ...v,
      timeFrom: range?.[0]?.startOf('day').toISOString(),
      timeTo: range?.[1]?.endOf('day').toISOString(),
    }
  }

  return (
    <>
      <div className="tplarch-banner tplarch-banner--softblue">
        <div className="tplarch-panel-head tplarch-panel-head--inBanner">
        <div>
          <Typography.Title level={3} className="tplarch-panel-title" style={{ margin: 0 }}>
            任务历史记录
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
            查看并管理系统中已执行的模板任务、审计记录与下载报告。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={() => void fetchRecords(buildQuery())} loading={loading}>
            刷新列表
          </Button>
        </Space>
        </div>
      </div>

      <div className="tplarch-filterbar">
        <Form form={form} layout="inline" className="tplarch-filterbar-form">
          <Form.Item name="keyword" label="关键字">
            <Input placeholder="名称/编号" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="enterprise" label="企业">
            <Input placeholder="企业名称" allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="operator" label="操作人">
            <Input placeholder="操作人" allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="taskType" label="任务类型">
            <Input placeholder="如 duplicate-check" allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select allowClear placeholder="状态" style={{ width: 120 }} options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label="时间">
            <DatePicker.RangePicker
              value={range}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
              style={{ width: 260 }}
            />
          </Form.Item>
        </Form>

        <div className="tplarch-filterbar-actions">
          <Space size={12}>
            <Button type="primary" onClick={() => void fetchRecords(buildQuery())} loading={loading}>
              查询
            </Button>
            <Button
              onClick={() => {
                form.resetFields()
                setRange(null)
                void fetchRecords()
              }}
              disabled={loading}
            >
              清空
            </Button>
          </Space>
        </div>
      </div>

      <div className="tplarch-tablecard">
        <ProTable<ArchiveHistoryRecord>
          rowKey="id"
          search={false}
          options={false}
          pagination={{ pageSize: 10 }}
          loading={loading}
          dataSource={records}
          columns={columns as never}
        />
      </div>
    </>
  )
}
