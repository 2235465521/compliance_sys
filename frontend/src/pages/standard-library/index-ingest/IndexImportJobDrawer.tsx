import { Alert, App, Button, Drawer, Modal, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckCircleOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  approveAllIndexImportJob,
  getIndexReview,
  pollBatchIndexImport,
} from '@/services/standard-library'
import type {
  ApproveAllIndexImportFailure,
  ApproveAllIndexImportResult,
  BatchIndexTask,
  IndexImportJob,
} from '@/services/standard-library'
import IndexReviewDrawer from './IndexReviewDrawer'

const { Text } = Typography

const REVIEW_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'warning' },
  approved: { label: '已通过', color: 'success' },
  rejected: { label: '已去除', color: 'default' },
}

function getItemManualReviewStatus(
  item: BatchIndexTask,
  reviewStatusMap: Record<string, string | null>,
): string | null {
  if (item.std_code && item.std_code in reviewStatusMap) {
    return reviewStatusMap[item.std_code]
  }
  return item.manual_review_status ?? null
}

function countPendingApprove(
  items: BatchIndexTask[],
  reviewStatusMap: Record<string, string | null>,
): number {
  return items.filter((i) => {
    if (i.status !== 'completed' || !i.std_code) return false
    const s = getItemManualReviewStatus(i, reviewStatusMap)
    return !s || s === 'pending'
  }).length
}

function canEnableApproveAll(job: IndexImportJob | null): boolean {
  if (!job) return false
  if (job.status === 'completed') return true
  return (job.items ?? []).some((i) => i.status === 'completed')
}

function renderItemStatus(item: BatchIndexTask) {
  let tag: React.ReactElement
  switch (item.status) {
    case 'completed':
      tag = <Tag color="success">已完成</Tag>
      break
    case 'skipped':
      tag = <Tag color="warning">已跳过</Tag>
      break
    case 'failed':
      tag = <Tag color="error">失败</Tag>
      break
    case 'running':
    case 'processing':
      tag = <Tag color="processing">处理中</Tag>
      break
    default:
      tag = <Tag>等待中</Tag>
  }
  return item.error_message ? <Tooltip title={item.error_message}>{tag}</Tooltip> : tag
}

function buildItemColumns(
  reviewStatusMap: Record<string, string | null>,
  onReview: (stdCode: string) => void,
): ColumnsType<BatchIndexTask> {
  return [
    {
      title: '文件名',
      dataIndex: 'original_filename',
      ellipsis: true,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, item) => renderItemStatus(item),
    },
    {
      title: '国标号',
      dataIndex: 'std_code',
      width: 160,
      render: (v: string | null) => v || '—',
    },
    {
      title: '指标条数',
      dataIndex: 'indexes_count',
      width: 90,
      align: 'right' as const,
      render: (n: number | null) =>
        n != null ? <Text style={{ color: '#52c41a', fontWeight: 600 }}>{n}</Text> : '—',
    },
    {
      title: '审核状态',
      key: 'manualReviewStatus',
      width: 96,
      render: (_, item) => {
        if (item.status !== 'completed' || !item.std_code) return '—'
        const s = getItemManualReviewStatus(item, reviewStatusMap)
        if (!s) return <Tag color="default">待审核</Tag>
        const m = REVIEW_STATUS_META[s] ?? { label: s, color: 'default' }
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    {
      title: '原因',
      dataIndex: 'error_message',
      ellipsis: true,
      render: (msg: string | null) =>
        msg ? (
          <Text type="warning" ellipsis={{ tooltip: msg }} style={{ fontSize: 12 }}>
            {msg}
          </Text>
        ) : (
          '—'
        ),
    },
    {
      title: '操作',
      key: 'op',
      width: 90,
      render: (_, item) => {
        if (item.status !== 'completed' || !item.std_code) return null
        const reviewStatus = getItemManualReviewStatus(item, reviewStatusMap)
        if (reviewStatus === 'approved' || reviewStatus === 'rejected') {
          return (
            <Button type="link" size="small" onClick={() => onReview(item.std_code!)}>
              查看审核
            </Button>
          )
        }
        return (
          <Button type="link" size="small" onClick={() => onReview(item.std_code!)}>
            去审核
          </Button>
        )
      },
    },
  ]
}

function formatFailureLines(entries: ApproveAllIndexImportFailure[]): string[] {
  return entries.map((e) => {
    const code = e.std_code ?? e.stdCode ?? '—'
    const file = e.original_filename ?? e.originalFilename
    const reason = e.reason ?? e.message ?? '未知原因'
    return file ? `${code}（${file}）：${reason}` : `${code}：${reason}`
  })
}

interface Props {
  jobId: string | number | null
  onClose: () => void
}

export default function IndexImportJobDrawer({ jobId, onClose }: Props) {
  const { message, modal } = App.useApp()
  const [job, setJob] = useState<IndexImportJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewCode, setReviewCode] = useState<string | null>(null)
  const [approveAllLoading, setApproveAllLoading] = useState(false)
  const [reviewStatusMap, setReviewStatusMap] = useState<Record<string, string | null>>({})
  const activeRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    activeRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const fetchReviewStatuses = useCallback(async (items: BatchIndexTask[]) => {
    const codes = [
      ...new Set(
        items.filter((it) => it.status === 'completed' && it.std_code).map((it) => it.std_code!),
      ),
    ]
    if (codes.length === 0) return
    const results = await Promise.allSettled(codes.map((c) => getIndexReview(c)))
    const map: Record<string, string | null> = {}
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        map[codes[i]] = r.value.manualReviewStatus ?? null
      }
    })
    setReviewStatusMap((prev) => ({ ...prev, ...map }))
  }, [])

  const refreshJobDetail = useCallback(
    async (id: string) => {
      const result = await pollBatchIndexImport(id)
      setJob(result)
      setError(null)
      const fromItems: Record<string, string | null> = {}
      for (const it of result.items ?? []) {
        if (it.std_code && it.manual_review_status) {
          fromItems[it.std_code] = it.manual_review_status
        }
      }
      if (Object.keys(fromItems).length > 0) {
        setReviewStatusMap((prev) => ({ ...prev, ...fromItems }))
      }
      if (result.status === 'completed' || result.status === 'failed') {
        await fetchReviewStatuses(result.items ?? [])
      }
      return result
    },
    [fetchReviewStatuses],
  )

  const startPolling = useCallback(
    (id: string) => {
      activeRef.current = true
      const poll = async () => {
        if (!activeRef.current) return
        try {
          const result = await pollBatchIndexImport(id)
          setJob(result)
          setError(null)
          const finished = result.status === 'completed' || result.status === 'failed'
          if (finished) {
            void fetchReviewStatuses(result.items ?? [])
          } else if (activeRef.current) {
            timerRef.current = setTimeout(() => void poll(), 3000)
          }
        } catch (e) {
          setError((e as Error).message || '获取详情失败')
          if (activeRef.current) {
            timerRef.current = setTimeout(() => void poll(), 5000)
          }
        }
      }
      void poll()
    },
    [fetchReviewStatuses],
  )

  useEffect(() => {
    if (!jobId) {
      stopPolling()
      setJob(null)
      setError(null)
      setReviewStatusMap({})
      return
    }
    setReviewStatusMap({})
    startPolling(String(jobId))
    return () => stopPolling()
  }, [jobId, startPolling, stopPolling])

  const showApproveFailures = useCallback(
    (result: ApproveAllIndexImportResult) => {
      const failedLines = formatFailureLines(result.failed ?? [])
      const skippedLines = formatFailureLines(result.skipped ?? [])
      if (failedLines.length === 0 && skippedLines.length === 0) return
      modal.warning({
        title: '部分文件未能批量通过',
        width: 560,
        content: (
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            {failedLines.length > 0 && (
              <>
                <Text strong>失败（{failedLines.length}）</Text>
                <ul style={{ margin: '8px 0 12px', paddingLeft: 20 }}>
                  {failedLines.map((line) => (
                    <li key={line} style={{ fontSize: 13 }}>
                      {line}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {skippedLines.length > 0 && (
              <>
                <Text strong>跳过（{skippedLines.length}）</Text>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                  {skippedLines.map((line) => (
                    <li key={line} style={{ fontSize: 13 }}>
                      {line}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ),
      })
    },
    [modal],
  )

  const totalItems = job?.total_items ?? 0
  const completedItems = job?.completed_items ?? 0
  const failedItems = job?.failed_items ?? 0
  const doneCount = completedItems + failedItems
  const pct = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0
  const isRunning =
    job?.status === 'running' ||
    job?.status === 'pending' ||
    (job?.status === 'processing' as string)
  const isDone = job?.status === 'completed' || job?.status === 'failed'

  const items = job?.items ?? []
  const pendingApproveCount = useMemo(
    () => countPendingApprove(items, reviewStatusMap),
    [items, reviewStatusMap],
  )
  const approveAllEnabled =
    canEnableApproveAll(job) &&
    pendingApproveCount > 0 &&
    !approveAllLoading &&
    !isRunning

  const handleApproveAll = useCallback(() => {
    if (!jobId || !job) return
    modal.confirm({
      title: '批量审核通过',
      content: `将把本批次 ${pendingApproveCount} 个待审文件标为审核通过，是否继续？`,
      okText: '继续',
      cancelText: '取消',
      onOk: async () => {
        setApproveAllLoading(true)
        try {
          const result = await approveAllIndexImportJob(jobId, {
            onlyPending: true,
            manualReviewStatus: 'approved',
          })
          await refreshJobDetail(String(jobId))
          message.success(
            `已通过 ${result.approvedCount} 个，跳过 ${result.skippedCount} 个`,
          )
          showApproveFailures(result)
        } catch (e) {
          message.error((e as Error).message || '批量审核通过失败')
        } finally {
          setApproveAllLoading(false)
        }
      },
    })
  }, [
    job,
    jobId,
    message,
    modal,
    pendingApproveCount,
    refreshJobDetail,
    showApproveFailures,
  ])

  const JOB_STATUS: Record<string, { label: string; color: string }> = {
    pending: { label: '等待中', color: 'default' },
    running: { label: '处理中', color: 'processing' },
    processing: { label: '处理中', color: 'processing' },
    completed: { label: '已完成', color: 'success' },
    failed: { label: '失败', color: 'error' },
  }
  const statusMeta = job ? (JOB_STATUS[job.status] ?? { label: job.status, color: 'default' }) : null

  return (
    <Drawer
      title={jobId ? `批次 #${jobId} 详情` : '批次详情'}
      width={820}
      open={!!jobId}
      onClose={onClose}
      destroyOnClose
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      {job && (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Space wrap>
            {statusMeta && <Tag color={statusMeta.color}>{statusMeta.label}</Tag>}
            <Text type="secondary" style={{ fontSize: 13 }}>
              已处理&nbsp;
              <Text strong style={{ color: '#1677ff' }}>
                {doneCount}
              </Text>
              &nbsp;/&nbsp;{totalItems}&nbsp;个文件
              {failedItems > 0 && (
                <Text type="danger">&nbsp;（{failedItems} 个失败/跳过）</Text>
              )}
              {isRunning && <Text type="secondary">&nbsp;· 每 3 秒自动刷新</Text>}
            </Text>
          </Space>

          <Progress
            percent={pct}
            status={isDone ? (failedItems > 0 ? 'exception' : 'success') : 'active'}
            strokeColor={isDone && failedItems === 0 ? '#52c41a' : undefined}
          />

          {isDone && failedItems === 0 && (
            <Alert type="success" showIcon message={`所有 ${totalItems} 个文件均已成功入库`} />
          )}
          {isDone && failedItems > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`${completedItems} 个成功，${failedItems} 个失败/跳过，详情见下表`}
            />
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <Text type="secondary" style={{ fontSize: 13 }}>
              待审文件：
              <Text strong style={{ color: pendingApproveCount > 0 ? '#d48806' : undefined }}>
                {pendingApproveCount}
              </Text>
              &nbsp;个
              {pendingApproveCount === 0 && canEnableApproveAll(job) && (
                <Text type="secondary">&nbsp;（均已审核或无待审条目）</Text>
              )}
            </Text>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={approveAllLoading}
              disabled={!approveAllEnabled}
              onClick={handleApproveAll}
            >
              批量审核通过
            </Button>
          </div>

          <Table<BatchIndexTask>
            rowKey="id"
            columns={buildItemColumns(reviewStatusMap, (code) => setReviewCode(code))}
            dataSource={items}
            pagination={false}
            size="small"
            scroll={{ x: 800 }}
            locale={{ emptyText: '暂无文件记录' }}
          />
        </Space>
      )}

      {!job && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>加载中…</div>
      )}

      <IndexReviewDrawer
        open={!!reviewCode}
        stdCode={reviewCode ?? ''}
        onReviewed={(code, status) => {
          setReviewStatusMap((prev) => ({ ...prev, [code]: status }))
        }}
        onClose={() => {
          setReviewCode(null)
        }}
      />
    </Drawer>
  )
}
