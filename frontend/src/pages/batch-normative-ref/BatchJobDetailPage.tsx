import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Descriptions, Popconfirm, Progress, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { BatchNormativeRefItemOut } from '@/types/batch-normative-ref'
import { fileComplianceOutcomeLabel, parseFileComplianceOutcome } from '@/services/compliance'
import { deleteBatchNormativeRefJob } from '@/services/batch-normative-reference'
import {
  createBatchIndicatorCompareJob,
  listBatchIndicatorCompareJobs,
} from '@/services/batch-indicator-compare'
import type { BatchIndicatorCompareJobSummary } from '@/types/batch-indicator-compare'
import { useBatchNormativeRefJobPoll } from '@/pages/batch-normative-ref/hooks/useBatchNormativeRefJobPoll'
import {
  downloadBatchNormativeRefJobReferencesXlsx,
  downloadBatchNormativeRefJobReferencesXlsxSimplified,
  downloadBatchNormativeRefMismatchSummaryTxt,
} from '@/pages/batch-normative-ref/exportJobReferencesCsv'
import { resolveBatchJobProgressDisplay, shouldPollBatchNormativeRefJob } from '@/pages/batch-normative-ref/batchJobProgress'
import { batchItemStatusMeta, batchJobStatusMeta } from '@/pages/batch-normative-ref/batchStatusLabels'
import { pickQbCode } from '@/pages/batch-normative-ref/itemMetaDisplay'
import { displayBatchJobLabel } from '@/pages/batch-normative-ref/session'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'

const { Title, Text } = Typography

function formatBatchDateTime(iso: string | undefined | null): string {
  if (!iso?.trim()) return '—'
  const d = dayjs(iso)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : iso.trim()
}

export default function BatchJobDetailPage() {
  const navigate = useNavigate()
  const { jobId: jobIdParam } = useParams()
  const jobId = Number(jobIdParam)
  const validId = Number.isFinite(jobId) && jobId > 0 ? jobId : null
  const { job, loading, error } = useBatchNormativeRefJobPoll(validId)
  const [deleting, setDeleting] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([])
  const [startingCompare, setStartingCompare] = useState(false)
  const [compareJobs, setCompareJobs] = useState<BatchIndicatorCompareJobSummary[]>([])

  const loadCompareJobs = useCallback(async () => {
    if (validId == null) return
    try {
      const res = await listBatchIndicatorCompareJobs({
        page: 1,
        page_size: 10,
        source_batch_job_id: validId,
      })
      setCompareJobs(res.results)
    } catch {
      setCompareJobs([])
    }
  }, [validId])

  useEffect(() => {
    void loadCompareJobs()
  }, [loadCompareJobs])

  const handleStartIndicatorCompare = async () => {
    if (validId == null) return
    if (selectedItemIds.length === 0) {
      message.warning('请先勾选已完成的子项')
      return
    }
    setStartingCompare(true)
    try {
      const label = job?.label?.trim()
        ? `${job.label.trim()} · 指标对比（${selectedItemIds.length} 项）`
        : `体检批次 #${validId} 指标对比`
      const created = await createBatchIndicatorCompareJob({
        source_batch_job_id: validId,
        source_item_ids: selectedItemIds,
        label,
      })
      message.success('已创建指标对比任务')
      setSelectedItemIds([])
      void loadCompareJobs()
      navigate(`/batch-normative-reference/indicator-compare/${created.id}`)
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setStartingCompare(false)
    }
  }

  const progress = useMemo(() => (job ? resolveBatchJobProgressDisplay(job) : null), [job])
  const isProcessing = job ? shouldPollBatchNormativeRefJob(job) : false

  const handleDeleteJob = async () => {
    if (validId == null) return
    setDeleting(true)
    try {
      await deleteBatchNormativeRefJob(validId)
      message.success('已删除该批次')
      navigate('/batch-normative-reference')
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setDeleting(false)
    }
  }

  const columns: ColumnsType<BatchNormativeRefItemOut> = [
    { title: '顺序', dataIndex: 'sort_order', width: 70 },
    {
      title: '企标号',
      key: 'subject_code',
      width: 160,
      ellipsis: true,
      render: (_, r) => pickQbCode(r) || '—',
    },
    { title: '文件名', dataIndex: 'original_filename', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => {
        const meta = batchItemStatusMeta(s)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '说明',
      key: 'err',
      ellipsis: true,
      render: (_, r) => r.error_message || '-',
    },
    {
      title: '文件合规结论',
      key: 'fileOutcome',
      width: 160,
      render: (_, r) => {
        if (r.status !== 'completed') return <Text type="secondary">—</Text>
        const o = parseFileComplianceOutcome(r.file_compliance_outcome)
        if (!o) return <Text type="secondary">—</Text>
        const color =
          o === 'compliant'
            ? 'success'
            : o === 'non_compliant'
              ? 'error'
              : o === 'undetermined'
                ? 'warning'
                : 'default'
        return <Tag color={color}>{fileComplianceOutcomeLabel(o)}</Tag>
      },
    },
    {
      title: '操作',
      key: 'op',
      width: 120,
      render: (_, r) =>
        r.status === 'completed' ? (
          <Link to={`/batch-normative-reference/${validId}/items/${r.id}`}>查看引用</Link>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ]

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Space align="center" size="large" wrap>
        <Link to="/batch-normative-reference" style={{ fontSize: 15 }}>
          返回规范性体检
        </Link>
        {validId ? (
          <Popconfirm
            title="确定删除本批次？"
            description="删除后不可恢复，所有子项与查新结果将一并删除。"
            onConfirm={() => void handleDeleteJob()}
          >
            <Button danger loading={deleting}>
              删除本批次
            </Button>
          </Popconfirm>
        ) : null}
      </Space>
      <Title level={3} style={{ margin: 0 }}>
        {displayBatchJobLabel(job?.label)}
      </Title>

      <Alert
        type="info"
        showIcon
        message="异步处理说明"
        description={
          <span style={{ fontSize: 15, lineHeight: 1.65 }}>
            任务由后台 Celery Worker 逐文件处理；未完成时会自动刷新。请确认 Broker 与 Worker 已启动，且批量 Dify 与
            MySQL 已按手册配置。
          </span>
        }
      />

      {error ? <Alert type="error" message={error} /> : null}

      {job ? (
        <>
          <Card size="small" loading={loading}>
            <Descriptions bordered column={2} labelStyle={{ fontSize: 15 }} contentStyle={{ fontSize: 15 }}>
              <Descriptions.Item label="状态">
                <Tag color={batchJobStatusMeta(job.status).color}>
                  {batchJobStatusMeta(job.status).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="任务名称">{displayBatchJobLabel(job.label)}</Descriptions.Item>
              <Descriptions.Item label="子项总数">
                {progress?.total ?? job.total_items}
              </Descriptions.Item>
              <Descriptions.Item label="已完成 / 失败">
                {progress ? (
                  <Progress
                    style={{ width: '100%', maxWidth: 420, margin: 0 }}
                    percent={progress.percent}
                    status={
                      isProcessing
                        ? 'active'
                        : progress.failed > 0 && progress.completed === 0
                          ? 'exception'
                          : progress.percent >= 100
                            ? 'success'
                            : undefined
                    }
                    format={() => {
                      const base =
                        progress.total > 0 ? `${progress.finished} / ${progress.total}` : '0 / 0'
                      const inFlight = progress.running + progress.pending
                      if (inFlight > 0) {
                        return `${base}（处理中 ${inFlight}）`
                      }
                      if (progress.failed > 0) {
                        return `${base}（失败 ${progress.failed}）`
                      }
                      return base
                    }}
                  />
                ) : (
                  `${job.completed_items} / ${job.failed_items}`
                )}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {formatBatchDateTime(job.created_at)}
              </Descriptions.Item>
              {job.error_summary ? (
                <Descriptions.Item label="错误摘要" span={2}>
                  {job.error_summary}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
            {compareJobs.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 14 }}>
                  指标对比记录：
                  {compareJobs.slice(0, 3).map((cj, idx) => (
                    <span key={cj.id}>
                      {idx > 0 ? '、' : ' '}
                      <Link to={`/batch-normative-reference/indicator-compare/${cj.id}`}>
                        #{cj.id}
                        {cj.label?.trim() ? ` ${cj.label.trim()}` : ''}
                      </Link>
                    </span>
                  ))}
                  {compareJobs.length > 3 ? (
                    <Link to="/batch-normative-reference/indicator-compare"> 查看全部</Link>
                  ) : null}
                </Text>
              </div>
            ) : null}
            <div style={{ marginTop: 16 }}>
              <Space wrap size="middle">
                <Tooltip
                  title={
                    <span style={{ fontSize: 13 }}>
                      下载完整 .xlsx（14 列）：「与现行主号不一致」行在「本条引用是否与现行一致」「状态」「需重点核对」列以红字加粗显示。
                    </span>
                  }
                >
                  <Button
                    type="primary"
                    size="large"
                    disabled={!job.items.some((i) => i.status === 'completed')}
                    onClick={() => {
                      void downloadBatchNormativeRefJobReferencesXlsx(job)
                    }}
                  >
                    导出本批次规范性引用结果
                  </Button>
                </Tooltip>
                <Tooltip
                  title={
                    <span style={{ fontSize: 13 }}>
                      与完整表相同行数据，但去掉「状态」「需重点核对」「说明/谱系」三列；不一致行仅在「本条引用是否与现行一致」列标红。
                    </span>
                  }
                >
                  <Button
                    size="large"
                    disabled={!job.items.some((i) => i.status === 'completed')}
                    onClick={() => {
                      void downloadBatchNormativeRefJobReferencesXlsxSimplified(job)
                    }}
                  >
                    导出简明表
                  </Button>
                </Tooltip>
                <Tooltip
                  title={
                    <span style={{ fontSize: 13 }}>
                      视频文案 txt：每期含文字段1（通报头）+ 文字段2（企业名单）+ 文字段3（不一致明细，与名单顺序一致）；每 10 家为一期，超出则分多期并标注分隔行。
                    </span>
                  }
                >
                  <Button
                    size="large"
                    disabled={!job.items.some((i) => i.status === 'completed')}
                    onClick={() => downloadBatchNormativeRefMismatchSummaryTxt(job)}
                  >
                    导出不一致引用清单
                  </Button>
                </Tooltip>
              </Space>
            </div>
          </Card>

          <Card
            title="文件列表"
            size="small"
            extra={
              <Button
                type="primary"
                disabled={selectedItemIds.length === 0}
                loading={startingCompare}
                onClick={() => void handleStartIndicatorCompare()}
              >
                对选中项发起指标对比
              </Button>
            }
          >
            <Table<BatchNormativeRefItemOut>
              rowKey="id"
              size="middle"
              loading={loading}
              columns={columns}
              dataSource={job.items}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedItemIds,
                onChange: (keys) => setSelectedItemIds(keys.map((k) => Number(k))),
                getCheckboxProps: (record) => ({
                  disabled: record.status !== 'completed',
                }),
              }}
            />
          </Card>
        </>
      ) : (
        !error && <Card loading={loading}>加载中…</Card>
      )}
    </Space>
  )
}
