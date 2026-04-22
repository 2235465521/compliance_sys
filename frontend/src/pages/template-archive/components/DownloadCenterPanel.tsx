import { ProTable } from '@ant-design/pro-components'
import {
  Button,
  DatePicker,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DownloadCenterItem } from '@/types/template-archive'
import { downloadArchiveItem } from '@/services/template-archive'
import { useTemplateArchiveStore } from '@/stores/template-archive'

const STATUS_OPTIONS = [
  { label: '可下载', value: 'ready' },
  { label: '处理中', value: 'processing' },
  { label: '失败', value: 'failed' },
]

type PreviewFn = (title: string, payload: unknown, pdfUrl?: string) => void

export function DownloadCenterPanel({ onPreview }: { onPreview: PreviewFn }) {
  const [form] = Form.useForm<{
    keyword?: string
    status?: string
    enterprise?: string
    operator?: string
    taskType?: string
  }>()
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  const downloads = useTemplateArchiveStore((s) => s.downloads)
  const loading = useTemplateArchiveStore((s) => s.downloadsLoading)
  const batchDownloading = useTemplateArchiveStore((s) => s.batchDownloading)
  const fetchDownloads = useTemplateArchiveStore((s) => s.fetchDownloads)
  const batchDownload = useTemplateArchiveStore((s) => s.batchDownload)

  const downloadingRef = useRef(false)

  useEffect(() => {
    void fetchDownloads()
  }, [fetchDownloads])

  function statusPill(s: DownloadCenterItem['status']) {
    if (s === 'ready') return <span className="tplarch-pill tplarch-pill--success">可下载</span>
    if (s === 'failed') return <span className="tplarch-pill tplarch-pill--danger">失败</span>
    return <span className="tplarch-pill tplarch-pill--processing">处理中</span>
  }

  const columns: ColumnsType<DownloadCenterItem> = useMemo(
    () => [
      { title: '文件名', dataIndex: 'fileName', key: 'fileName', ellipsis: true },
      {
        title: '类型',
        dataIndex: 'fileType',
        key: 'fileType',
        width: 120,
        render: (t: DownloadCenterItem['fileType']) => {
          if (t === 'template') return <Tag className="tplarch-tag tplarch-tag--blue">模板</Tag>
          if (t === 'report') return <Tag className="tplarch-tag tplarch-tag--green">报告</Tag>
          return <Tag className="tplarch-tag">其他</Tag>
        },
      },
      { title: '大小', dataIndex: 'sizeText', key: 'sizeText', width: 120 },
      { title: '生成时间', dataIndex: 'createdAt', key: 'createdAt', width: 200 },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (s: DownloadCenterItem['status']) => statusPill(s),
      },
      {
        title: '操作',
        key: 'actions',
        width: 240,
        render: (_, row) => (
          <Space size={8}>
            <Button
              type="link"
              onClick={() => {
                const pdfUrl =
                  row.mimeType === 'application/pdf' && row.url ? row.url : undefined
                onPreview(`下载项：${row.fileName}`, row, pdfUrl)
              }}
            >
              预览
            </Button>
            <Button
              type="link"
              disabled={row.status !== 'ready' || downloadingRef.current}
              onClick={() => void handleDownloadOne(row)}
            >
              下载
            </Button>
          </Space>
        ),
      },
    ],
    [onPreview],
  )

  async function handleDownloadOne(row: DownloadCenterItem) {
    if (downloadingRef.current) return
    downloadingRef.current = true
    try {
      await downloadArchiveItem(row)
      message.success('下载已开始')
    } catch {
      message.error('下载失败，请检查网络后重试。')
    } finally {
      downloadingRef.current = false
    }
  }

  function buildQuery() {
    const v = form.getFieldsValue()
    return {
      ...v,
      timeFrom: range?.[0]?.startOf('day').toISOString(),
      timeTo: range?.[1]?.endOf('day').toISOString(),
    }
  }

  async function handleBatchDownload() {
    if (!selectedKeys.length) return
    if (batchDownloading) return
    try {
      await batchDownload(selectedKeys)
      message.success('批量打包下载已开始')
    } catch {
      message.error('批量下载失败，请稍后重试。')
    }
  }

  return (
    <>
      <div className="tplarch-banner tplarch-banner--softblue">
        <div className="tplarch-banner-content">
          <Typography.Title level={3} style={{ margin: 0, color: '#fff' }}>
            下载中心
          </Typography.Title>
          <Typography.Paragraph style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.85)' }}>
            高效管理、预览并下载已生成的报告与模板文件。
          </Typography.Paragraph>
        </div>
      </div>

      <div className="tplarch-filterbar">
        <Form form={form} layout="inline" className="tplarch-filterbar-form">
          <Form.Item name="keyword" label="关键字">
            <Input placeholder="文件名" allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="enterprise" label="企业">
            <Input placeholder="企业" allowClear style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="operator" label="操作人">
            <Input placeholder="操作人" allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="taskType" label="任务类型">
            <Input placeholder="任务类型" allowClear style={{ width: 140 }} />
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
            <Button type="primary" onClick={() => void fetchDownloads(buildQuery())} loading={loading}>
              查询
            </Button>
            <Button
              onClick={() => {
                form.resetFields()
                setRange(null)
                setSelectedKeys([])
                void fetchDownloads()
              }}
              disabled={loading}
            >
              清空
            </Button>
          </Space>
        </div>

        <Divider type="vertical" className="tplarch-filterbar-divider" />

        <div className="tplarch-filterbar-batch">
          <Space size={12}>
            <Button
              type="primary"
              disabled={!selectedKeys.length}
              loading={batchDownloading}
              onClick={() => void handleBatchDownload()}
            >
              批量打包下载
            </Button>
            <Button disabled={!selectedKeys.length} onClick={() => setSelectedKeys([])}>
              清空选择
            </Button>
          </Space>
        </div>
      </div>

      <div className="tplarch-tablecard">
        <ProTable<DownloadCenterItem>
          rowKey="id"
          search={false}
          options={false}
          pagination={{ pageSize: 10 }}
          loading={loading}
          dataSource={downloads}
          columns={columns as never}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys.map(String)),
          }}
        />
      </div>
    </>
  )
}
