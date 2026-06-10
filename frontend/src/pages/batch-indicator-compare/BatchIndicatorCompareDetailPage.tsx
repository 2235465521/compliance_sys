import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Popconfirm,
  Progress,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import type { BatchIndicatorCompareItemSummary } from '@/types/batch-indicator-compare'
import {
  deleteBatchIndicatorCompareJob,
  getBatchIndicatorCompareJobItem,
} from '@/services/batch-indicator-compare'
import { useBatchIndicatorCompareJobPoll } from '@/pages/batch-indicator-compare/hooks/useBatchIndicatorCompareJobPoll'
import {
  resolveBatchIndicatorCompareProgressDisplay,
  shouldPollBatchIndicatorCompareJob,
} from '@/pages/batch-indicator-compare/batchIndicatorCompareProgress'
import {
  batchIndicatorCompareItemStatusMeta,
  batchIndicatorCompareJobStatusMeta,
} from '@/pages/batch-indicator-compare/batchIndicatorCompareStatusLabels'
import { downloadBatchIndicatorCompareJobXlsx } from '@/pages/batch-indicator-compare/exportBatchIndicatorCompareXlsx'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'

const { Title, Text } = Typography

function formatDateTime(iso: string | undefined | null): string {
  if (!iso?.trim()) return '—'
  const d = dayjs(iso)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : iso.trim()
}

export default function BatchIndicatorCompareDetailPage() {
  const navigate = useNavigate()
  const { compareJobId: jobIdParam } = useParams()
  const jobId = Number(jobIdParam)
  const validId = Number.isFinite(jobId) && jobId > 0 ? jobId : null
  const { job, loading, error } = useBatchIndicatorCompareJobPoll(validId)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const progress = useMemo(() => (job ? resolveBatchIndicatorCompareProgressDisplay(job) : null), [job])
  const isProcessing = job ? shouldPollBatchIndicatorCompareJob(job) : false

  const handleDelete = async () => {
    if (validId == null) return
    setDeleting(true)
    try {
      await deleteBatchIndicatorCompareJob(validId)
      message.success('已删除')
      navigate('/batch-normative-reference/indicator-compare')
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setDeleting(false)
    }
  }

  const handleExport = async () => {
    if (!job || validId == null) return
    setExporting(true)
    try {
      const details = await Promise.all(
        (job.items ?? [])
          .filter((i) => i.indicator_compare_status === 'completed')
          .map((i) => getBatchIndicatorCompareJobItem(validId, i.id)),
      )
      await downloadBatchIndicatorCompareJobXlsx(job, details)
      message.success('导出成功')
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<BatchIndicatorCompareItemSummary> = [
    {
      title: '企标号',
      dataIndex: 'subject_code',
      width: 160,
      ellipsis: true,
      render: (v: string | null | undefined) => v?.trim() || '—',
    },
    {
      title: '文件名',
      dataIndex: 'original_filename',
      ellipsis: true,
      render: (v: string | null | undefined) => v?.trim() || '—',
    },
    {
      title: '状态',
      dataIndex: 'indicator_compare_status',
      width: 100,
      render: (s: string) => {
        const meta = batchIndicatorCompareItemStatusMeta(s)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '摘要',
      key: 'summary',
      ellipsis: true,
      render: (_, r) => r.compare_summary?.trim() || r.skip_reason?.trim() || r.error_message?.trim() || '—',
    },
    {
      title: '操作',
      key: 'op',
      width: 100,
      render: (_, r) =>
        validId ? (
          <Link to={`/batch-normative-reference/indicator-compare/${validId}/items/${r.id}`}>审阅</Link>
        ) : null,
    },
  ]

  if (!validId) {
    return <Alert type="error" message="无效的任务 id" />
  }

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Space align="center" size="large" wrap>
        <Link to="/batch-normative-reference/indicator-compare" style={{ fontSize: 15 }}>
          返回指标对比记录
        </Link>
        <Link to={`/batch-normative-reference/${job?.source_batch_job_id ?? ''}`} style={{ fontSize: 15 }}>
          来源体检批次
        </Link>
        <Popconfirm title="确定删除本任务？" onConfirm={() => void handleDelete()}>
          <Button danger loading={deleting}>
            删除任务
          </Button>
        </Popconfirm>
      </Space>

      <Title level={3} style={{ margin: 0 }}>
        {job?.label?.trim() || `指标对比任务 #${validId}`}
      </Title>

      {error ? <Alert type="error" message={error} /> : null}

      {job ? (
        <>
          <Card size="small" loading={loading}>
            <Descriptions bordered column={2} labelStyle={{ fontSize: 15 }} contentStyle={{ fontSize: 15 }}>
              <Descriptions.Item label="状态">
                <Tag color={batchIndicatorCompareJobStatusMeta(job.status).color}>
                  {batchIndicatorCompareJobStatusMeta(job.status).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="来源体检批次">
                <Link to={`/batch-normative-reference/${job.source_batch_job_id}`}>
                  批次 #{job.source_batch_job_id}
                </Link>
              </Descriptions.Item>
              <Descriptions.Item label="子项进度" span={2}>
                {progress ? (
                  <Progress
                    style={{ maxWidth: 420 }}
                    percent={progress.percent}
                    status={isProcessing ? 'active' : progress.failed > 0 ? 'exception' : 'success'}
                    format={() => {
                      const base = `${progress.finished} / ${progress.total}`
                      if (progress.running + progress.pending > 0) {
                        return `${base}（处理中 ${progress.running + progress.pending}）`
                      }
                      return base
                    }}
                  />
                ) : (
                  '—'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDateTime(job.created_at)}</Descriptions.Item>
              <Descriptions.Item label="创建人">{job.created_by?.trim() || '—'}</Descriptions.Item>
              {job.error_summary ? (
                <Descriptions.Item label="错误摘要" span={2}>
                  {job.error_summary}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <Button
                type="primary"
                loading={exporting}
                disabled={!job.items.some((i) => i.indicator_compare_status === 'completed')}
                onClick={() => void handleExport()}
              >
                导出本任务指标对比 Excel
              </Button>
            </div>
          </Card>

          <Card title="子项列表" size="small">
            <Table<BatchIndicatorCompareItemSummary>
              rowKey="id"
              size="middle"
              loading={loading}
              columns={columns}
              dataSource={job.items}
              pagination={false}
            />
          </Card>
        </>
      ) : (
        !error && <Card loading={loading}>加载中…</Card>
      )}
    </Space>
  )
}
