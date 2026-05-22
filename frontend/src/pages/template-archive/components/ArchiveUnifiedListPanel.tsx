import { ProTable } from '@ant-design/pro-components'
import { FileTextOutlined } from '@ant-design/icons'
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
import { downloadArchiveItem } from '@/services/template-archive'
import { useTemplateArchiveStore } from '@/stores/template-archive'
import type {
  ArchiveHistoryRecord,
  ArchiveUnifiedDisplayStatus,
  ArchiveUnifiedKind,
  ArchiveUnifiedRow,
  DownloadCenterItem,
} from '@/types/template-archive'

type PreviewFn = (title: string, payload: unknown, pdfUrl?: string) => void

const KEY_SEP = '::'

const UNIFIED_STATUS_OPTIONS = [
  { label: '成功 / 可下载', value: 'ok' },
  { label: '进行中', value: 'in_progress' },
  { label: '失败', value: 'failed' },
]

const KIND_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '含任务记录', value: 'record' },
  { label: '含可下载文件', value: 'download' },
]

function recordToDisplay(r: ArchiveHistoryRecord): ArchiveUnifiedDisplayStatus {
  if (r.status === 'success') return 'ok'
  if (r.status === 'failed') return 'failed'
  return 'in_progress'
}

function downloadToDisplay(d: DownloadCenterItem): ArchiveUnifiedDisplayStatus {
  if (d.status === 'ready') return 'ok'
  if (d.status === 'failed') return 'failed'
  return 'in_progress'
}

/** 将任务与下载项配对：reportId、文件 id、或文件名中的编号/片段 */
function downloadMatchesRecord(d: DownloadCenterItem, r: ArchiveHistoryRecord): boolean {
  if (r.reportId) {
    if (d.id === r.reportId) return true
    if (d.fileName.includes(r.reportId)) return true
    const nums = r.reportId.match(/\d+/g)
    if (nums?.some((n) => d.fileName.includes(n))) return true
  }
  return false
}

/** 每个任务最多消费一个下载项；剩余下载项各占一行 */
function pairRecordsWithDownloads(
  records: ArchiveHistoryRecord[],
  downloads: DownloadCenterItem[],
): ArchiveUnifiedRow[] {
  const pool = [...downloads]
  const rows: ArchiveUnifiedRow[] = []

  for (const r of records) {
    const idx = pool.findIndex((d) => downloadMatchesRecord(d, r))
    const d = idx >= 0 ? pool.splice(idx, 1)[0] : undefined
    rows.push({
      key: d
        ? `pair${KEY_SEP}${r.id}${KEY_SEP}${d.id}`
        : `record${KEY_SEP}${r.id}`,
      record: r,
      download: d,
    })
  }

  for (const d of pool) {
    rows.push({
      key: `download${KEY_SEP}${d.id}`,
      download: d,
    })
  }

  rows.sort((a, b) => rowSortTime(b) - rowSortTime(a))
  return rows
}

function rowSortTime(row: ArchiveUnifiedRow): number {
  const ts: number[] = []
  if (row.record) ts.push(new Date(row.record.createdAt).getTime())
  if (row.download) ts.push(new Date(row.download.createdAt).getTime())
  return ts.length ? Math.max(...ts) : 0
}

function downloadIdFromRowKey(key: string): string | null {
  if (key.startsWith(`pair${KEY_SEP}`)) {
    const parts = key.split(KEY_SEP)
    const id = parts[parts.length - 1]
    return id || null
  }
  if (key.startsWith(`download${KEY_SEP}`)) {
    return key.slice(`download${KEY_SEP}`.length) || null
  }
  return null
}

function statusPill(s: ArchiveUnifiedDisplayStatus, label?: string) {
  const text =
    label ||
    (s === 'ok' ? '成功 / 可下载' : s === 'failed' ? '失败' : '进行中')
  if (s === 'ok') return <span className="tplarch-pill tplarch-pill--success">{text}</span>
  if (s === 'failed') return <span className="tplarch-pill tplarch-pill--danger">{text}</span>
  return <span className="tplarch-pill tplarch-pill--processing">{text}</span>
}

function rowMatchesDisplayFilter(
  row: ArchiveUnifiedRow,
  f: ArchiveUnifiedDisplayStatus | 'all',
): boolean {
  if (f === 'all') return true
  const parts: ArchiveUnifiedDisplayStatus[] = []
  if (row.record) parts.push(recordToDisplay(row.record))
  if (row.download) parts.push(downloadToDisplay(row.download))
  return parts.some((s) => s === f)
}

function rowMatchesKindFilter(row: ArchiveUnifiedRow, kind: ArchiveUnifiedKind | 'all'): boolean {
  if (kind === 'all') return true
  if (kind === 'record') return row.record != null
  return row.download != null
}

function matchesClientFilters(
  row: ArchiveUnifiedRow,
  v: {
    keyword?: string
    enterprise?: string
    operator?: string
    taskType?: string
    kind?: ArchiveUnifiedKind | 'all'
    displayStatus?: ArchiveUnifiedDisplayStatus | 'all'
    range: [Dayjs, Dayjs] | null
  },
): boolean {
  const kw = v.keyword?.trim()
  if (kw) {
    const lower = kw.toLowerCase()
    const chunks: string[] = []
    if (row.record) {
      chunks.push(row.record.name, row.record.id, row.record.reportId ?? '')
    }
    if (row.download) {
      chunks.push(row.download.fileName, row.download.id)
    }
    const hay = chunks.join(' ').toLowerCase()
    if (!hay.includes(lower)) return false
  }

  const ent = v.enterprise?.trim()
  if (ent) {
    const cell = (row.record?.enterprise ?? '').toLowerCase()
    if (!cell.includes(ent.toLowerCase())) return false
  }

  const op = v.operator?.trim()
  if (op) {
    const cell = (row.record?.operatorName ?? '').toLowerCase()
    if (!cell.includes(op.toLowerCase())) return false
  }

  const tt = v.taskType?.trim()
  if (tt) {
    const cell = (row.record?.taskType ?? '').toLowerCase()
    if (!cell.includes(tt.toLowerCase())) return false
  }

  const kind = v.kind ?? 'all'
  if (!rowMatchesKindFilter(row, kind)) return false

  const displayStatus = v.displayStatus ?? 'all'
  if (!rowMatchesDisplayFilter(row, displayStatus)) return false

  if (v.range) {
    const t = rowSortTime(row)
    const from = v.range[0].startOf('day').valueOf()
    const to = v.range[1].endOf('day').valueOf()
    if (t < from || t > to) return false
  }

  return true
}

export function ArchiveUnifiedListPanel({ onPreview }: { onPreview: PreviewFn }) {
  const [form] = Form.useForm<{
    keyword?: string
    enterprise?: string
    operator?: string
    taskType?: string
    kind?: ArchiveUnifiedKind | 'all'
    displayStatus?: ArchiveUnifiedDisplayStatus | 'all'
  }>()
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [clientFilter, setClientFilter] = useState<{
    values: {
      keyword?: string
      enterprise?: string
      operator?: string
      taskType?: string
      kind?: ArchiveUnifiedKind | 'all'
      displayStatus?: ArchiveUnifiedDisplayStatus | 'all'
    }
    range: [Dayjs, Dayjs] | null
  }>({ values: {}, range: null })

  const records = useTemplateArchiveStore((s) => s.records)
  const downloads = useTemplateArchiveStore((s) => s.downloads)
  const recordsLoading = useTemplateArchiveStore((s) => s.recordsLoading)
  const downloadsLoading = useTemplateArchiveStore((s) => s.downloadsLoading)
  const batchDownloading = useTemplateArchiveStore((s) => s.batchDownloading)
  const fetchRecords = useTemplateArchiveStore((s) => s.fetchRecords)
  const fetchDownloads = useTemplateArchiveStore((s) => s.fetchDownloads)
  const batchDownload = useTemplateArchiveStore((s) => s.batchDownload)

  const downloadingRef = useRef(false)
  const loading = recordsLoading || downloadsLoading

  useEffect(() => {
    void fetchRecords()
    void fetchDownloads()
  }, [fetchRecords, fetchDownloads])

  const mergedRows = useMemo(() => {
    const base = pairRecordsWithDownloads(records, downloads)
    const v = clientFilter.values
    const kind = v.kind ?? 'all'
    const displayStatus = v.displayStatus ?? 'all'
    return base.filter((row) =>
      matchesClientFilters(row, {
        ...v,
        kind,
        displayStatus,
        range: clientFilter.range,
      }),
    )
  }, [records, downloads, clientFilter])

  async function handleDownloadOne(item: DownloadCenterItem) {
    if (downloadingRef.current) return
    downloadingRef.current = true
    try {
      await downloadArchiveItem(item)
      message.success('下载已开始')
    } catch {
      message.error('下载失败，请检查网络后重试。')
    } finally {
      downloadingRef.current = false
    }
  }

  async function handleBatchDownload() {
    const ids = selectedKeys
      .map((k) => downloadIdFromRowKey(k))
      .filter((x): x is string => Boolean(x))
    if (!ids.length) return
    if (batchDownloading) return
    try {
      await batchDownload(ids)
      message.success('批量打包下载已开始')
    } catch {
      message.error('批量下载失败，请稍后重试。')
    }
  }

  function runQuery() {
    const kw = form.getFieldValue('keyword') as string | undefined
    void fetchRecords({ keyword: kw?.trim() })
    void fetchDownloads({ keyword: kw?.trim() })
    setClientFilter({ values: form.getFieldsValue(), range })
  }

  function resetFilters() {
    form.resetFields()
    form.setFieldsValue({ kind: 'all', displayStatus: 'all' })
    setRange(null)
    setSelectedKeys([])
    setClientFilter({
      values: { kind: 'all', displayStatus: 'all' },
      range: null,
    })
    void fetchRecords()
    void fetchDownloads()
  }

  const columns: ColumnsType<ArchiveUnifiedRow> = useMemo(
    () => [
      {
        title: '类型',
        key: 'categories',
        width: 172,
        render: (_, row) => (
          <Space size={4} wrap>
            {row.record ? <Tag className="tplarch-tag">任务记录</Tag> : null}
            {row.download ? (
              <Tag
                className={
                  row.download.fileType === 'template'
                    ? 'tplarch-tag tplarch-tag--blue'
                    : 'tplarch-tag tplarch-tag--green'
                }
              >
                {row.download.fileType === 'template'
                  ? '模板文件'
                  : row.download.fileType === 'report'
                    ? '报告文件'
                    : '其他文件'}
              </Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: '任务 / 文件',
        key: 'titles',
        width: 360,
        onCell: () => ({ className: 'tplarch-archive-cell-titles' }),
        render: (_, row) => (
          <div>
            {row.record ? (
              <div className="tplarch-row-title" style={{ marginBottom: row.download ? 6 : 0 }}>
                <span className="tplarch-avatar" aria-hidden="true">
                  <FileTextOutlined />
                </span>
                <span className="tplarch-row-title-text">
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    任务{' '}
                  </Typography.Text>
                  {row.record.name}
                </span>
              </div>
            ) : null}
            {row.download ? (
              <div style={{ wordBreak: 'break-word' }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  文件{' '}
                </Typography.Text>
                <Typography.Text style={{ wordBreak: 'break-word' }}>{row.download.fileName}</Typography.Text>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        title: '模块 / 类型',
        key: 'moduleType',
        width: 228,
        onCell: () => ({ className: 'tplarch-archive-cell-module' }),
        render: (_, row) => (
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {row.record ? (
              <Tag className="tplarch-tag" style={{ marginInlineEnd: 0 }}>
                {String(row.record.module)}
              </Tag>
            ) : null}
            {row.download ? (
              <Tag className="tplarch-tag" style={{ marginInlineEnd: 0 }}>
                {row.download.fileType}
              </Tag>
            ) : null}
            {!row.record && !row.download ? '—' : null}
          </Space>
        ),
      },
      {
        title: '企业',
        key: 'enterprise',
        width: 130,
        ellipsis: true,
        render: (_, row) => row.record?.enterprise ?? '—',
      },
      {
        title: '操作人',
        key: 'operator',
        width: 100,
        render: (_, row) => row.record?.operatorName ?? '—',
      },
      {
        title: '任务类型',
        key: 'taskType',
        width: 120,
        ellipsis: true,
        render: (_, row) => row.record?.taskType ?? '—',
      },
      {
        title: '大小',
        key: 'size',
        width: 90,
        render: (_, row) => row.download?.sizeText ?? '—',
      },
      {
        title: '状态',
        key: 'status',
        width: 216,
        render: (_, row) => (
          <Space direction="vertical" size={4}>
            {row.record ? (
              <span>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>
                  任务
                </Typography.Text>
                {statusPill(recordToDisplay(row.record))}
              </span>
            ) : null}
            {row.download ? (
              <span>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>
                  文件
                </Typography.Text>
                {statusPill(downloadToDisplay(row.download))}
              </span>
            ) : null}
          </Space>
        ),
      },
      {
        title: '时间',
        key: 'times',
        width: 200,
        render: (_, row) => (
          <Space direction="vertical" size={2}>
            {row.record ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                任务 {row.record.createdAt}
              </Typography.Text>
            ) : null}
            {row.download ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                文件 {row.download.createdAt}
              </Typography.Text>
            ) : null}
          </Space>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 268,
        fixed: 'right',
        render: (_, row) => {
          const rec = row.record
          const dl = row.download
          return (
            <Space size={8} wrap>
              {rec ? (
                <>
                  <Button type="link" onClick={() => onPreview(`历史记录：${rec.name}`, rec)}>
                    查看任务
                  </Button>
                  <Button
                    type="link"
                    disabled={!rec.reportId}
                    onClick={() =>
                      onPreview(`报告：${rec.reportId}`, {
                        reportId: rec.reportId,
                        record: rec,
                      })
                    }
                  >
                    打开报告
                  </Button>
                </>
              ) : null}
              {dl ? (
                <>
                  <Button
                    type="link"
                    onClick={() => {
                      const pdfUrl =
                        dl.mimeType === 'application/pdf' && dl.url ? dl.url : undefined
                      onPreview(`下载项：${dl.fileName}`, dl, pdfUrl)
                    }}
                  >
                    预览文件
                  </Button>
                  <Button
                    type="link"
                    disabled={dl.status !== 'ready' || downloadingRef.current}
                    onClick={() => void handleDownloadOne(dl)}
                  >
                    下载文件
                  </Button>
                </>
              ) : null}
            </Space>
          )
        },
      },
    ],
    [onPreview],
  )

  const selectedDownloadIds = useMemo(
    () =>
      selectedKeys
        .map((k) => downloadIdFromRowKey(k))
        .filter((x): x is string => Boolean(x)),
    [selectedKeys],
  )

  return (
    <>
      <div className="tplarch-banner tplarch-banner--softblue">
        <div className="tplarch-panel-head tplarch-panel-head--inBanner">
          <div>
            <Typography.Title level={3} className="tplarch-panel-title" style={{ margin: 0 }}>
              存档与下载
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
              同一任务与其生成文件尽量合并为一行（按报告编号等自动关联）；其余文件单独成行。
            </Typography.Paragraph>
          </div>
          <Space>
            <Button onClick={() => runQuery()} loading={loading}>
              刷新数据
            </Button>
          </Space>
        </div>
      </div>

      <div className="tplarch-filterbar">
        <Form
          form={form}
          layout="inline"
          className="tplarch-filterbar-form"
          initialValues={{ kind: 'all', displayStatus: 'all' }}
        >
          <Form.Item name="keyword" label="关键字">
            <Input placeholder="任务名 / 文件名 / 编号" allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="enterprise" label="企业">
            <Input placeholder="企业名称" allowClear style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="operator" label="操作人">
            <Input placeholder="操作人" allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="taskType" label="任务类型">
            <Input placeholder="如 duplicate-check" allowClear style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="kind" label="条目类型">
            <Select allowClear placeholder="全部" style={{ width: 140 }} options={KIND_OPTIONS} />
          </Form.Item>
          <Form.Item name="displayStatus" label="状态">
            <Select allowClear placeholder="全部" style={{ width: 140 }} options={UNIFIED_STATUS_OPTIONS} />
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
            <Button type="primary" onClick={() => runQuery()} loading={loading}>
              查询
            </Button>
            <Button onClick={() => resetFilters()} disabled={loading}>
              清空
            </Button>
          </Space>
        </div>

        <Divider type="vertical" className="tplarch-filterbar-divider" />

        <div className="tplarch-filterbar-batch">
          <Space size={12}>
            <Button
              type="primary"
              disabled={!selectedDownloadIds.length}
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
        <ProTable<ArchiveUnifiedRow>
          rowKey="key"
          search={false}
          options={false}
          pagination={{ pageSize: 10 }}
          loading={loading}
          dataSource={mergedRows}
          scroll={{ x: 2000 }}
          columns={columns as never}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys.map(String)),
            getCheckboxProps: (row) => ({
              disabled: !row.download || row.download.status !== 'ready',
            }),
          }}
        />
      </div>
    </>
  )
}
