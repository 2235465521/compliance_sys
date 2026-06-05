import { Alert, Button, Drawer, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getIndexReview, pollBatchIndexImport } from '@/services/standard-library'
import type { BatchIndexTask, IndexImportJob } from '@/services/standard-library'
import IndexReviewDrawer from './IndexReviewDrawer'

const { Text } = Typography

/* ── 文件条目状态渲染 ── */
function renderItemStatus(item: BatchIndexTask) {
  let tag: React.ReactElement
  switch (item.status) {
    case 'completed':  tag = <Tag color="success">已完成</Tag>;    break
    case 'skipped':    tag = <Tag color="warning">已跳过</Tag>;    break
    case 'failed':     tag = <Tag color="error">失败</Tag>;        break
    case 'running':
    case 'processing': tag = <Tag color="processing">处理中</Tag>; break
    default:           tag = <Tag>等待中</Tag>
  }
  return item.error_message
    ? <Tooltip title={item.error_message}>{tag}</Tooltip>
    : tag
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
      title: '原因',
      dataIndex: 'error_message',
      ellipsis: true,
      render: (msg: string | null) =>
        msg
          ? <Text type="warning" ellipsis={{ tooltip: msg }} style={{ fontSize: 12 }}>{msg}</Text>
          : '—',
    },
    {
      title: '操作',
      key: 'op',
      width: 90,
      render: (_, item) => {
        if (item.status !== 'completed' || !item.std_code) return null
        // 优先使用从审核接口拉取的真实状态，其次用任务接口返回的字段
        const reviewStatus = item.std_code in reviewStatusMap
          ? reviewStatusMap[item.std_code]
          : item.manual_review_status
        if (reviewStatus === 'approved' || reviewStatus === 'rejected') {
          return <Tag color="success">已审核</Tag>
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

interface Props {
  jobId: string | number | null
  onClose: () => void
}

export default function IndexImportJobDrawer({ jobId, onClose }: Props) {
  const [job, setJob]               = useState<IndexImportJob | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [reviewCode, setReviewCode] = useState<string | null>(null)
  /** std_code -> 真实审核状态（从 index-review 接口获取） */
  const [reviewStatusMap, setReviewStatusMap] = useState<Record<string, string | null>>({})
  const activeRef = useRef(false)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    activeRef.current = false
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  /** 批次完成后，并行拉取所有 completed 条目的真实审核状态 */
  const fetchReviewStatuses = useCallback(async (items: BatchIndexTask[]) => {
    const codes = [...new Set(
      items
        .filter((it) => it.status === 'completed' && it.std_code)
        .map((it) => it.std_code!)
    )]
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

  const startPolling = useCallback((id: string) => {
    activeRef.current = true
    const poll = async () => {
      if (!activeRef.current) return
      try {
        const result = await pollBatchIndexImport(id)
        setJob(result)
        setError(null)
        const finished = result.status === 'completed' || result.status === 'failed'
        if (finished) {
          // 批次结束后一次性拉取真实审核状态
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
  }, [fetchReviewStatuses])

  useEffect(() => {
    if (!jobId) { stopPolling(); setJob(null); setError(null); setReviewStatusMap({}); return }
    setReviewStatusMap({})
    startPolling(String(jobId))
    return () => stopPolling()
  }, [jobId, startPolling, stopPolling])

  /* ── 衍生数据 ── */
  const totalItems     = job?.total_items     ?? 0
  const completedItems = job?.completed_items ?? 0
  const failedItems    = job?.failed_items    ?? 0
  const doneCount      = completedItems + failedItems
  const pct            = totalItems > 0 ? Math.round(doneCount / totalItems * 100) : 0
  const isRunning      = job?.status === 'running' || job?.status === 'pending' || job?.status === 'processing' as string
  const isDone         = job?.status === 'completed' || job?.status === 'failed'

  const JOB_STATUS: Record<string, { label: string; color: string }> = {
    pending:    { label: '等待中', color: 'default'    },
    running:    { label: '处理中', color: 'processing' },
    processing: { label: '处理中', color: 'processing' },
    completed:  { label: '已完成', color: 'success'    },
    failed:     { label: '失败',   color: 'error'      },
  }
  const statusMeta = job ? (JOB_STATUS[job.status] ?? { label: job.status, color: 'default' }) : null

  return (
    <Drawer
      title={jobId ? `批次 #${jobId} 详情` : '批次详情'}
      width={780}
      open={!!jobId}
      onClose={onClose}
      destroyOnClose
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      {job && (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {/* 状态行 */}
          <Space wrap>
            {statusMeta && <Tag color={statusMeta.color}>{statusMeta.label}</Tag>}
            <Text type="secondary" style={{ fontSize: 13 }}>
              已处理&nbsp;
              <Text strong style={{ color: '#1677ff' }}>{doneCount}</Text>
              &nbsp;/&nbsp;{totalItems}&nbsp;个文件
              {failedItems > 0 && (
                <Text type="danger">&nbsp;（{failedItems} 个失败/跳过）</Text>
              )}
              {isRunning && (
                <Text type="secondary">&nbsp;· 每 3 秒自动刷新</Text>
              )}
            </Text>
          </Space>

          {/* 进度条 */}
          <Progress
            percent={pct}
            status={isDone ? (failedItems > 0 ? 'exception' : 'success') : 'active'}
            strokeColor={isDone && failedItems === 0 ? '#52c41a' : undefined}
          />

          {/* 汇总提示 */}
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

          {/* 文件条目表 */}
          <Table<BatchIndexTask>
            rowKey="id"
            columns={buildItemColumns(reviewStatusMap, (code) => setReviewCode(code))}
            dataSource={job.items ?? []}
            pagination={false}
            size="small"
            scroll={{ x: 760 }}
            locale={{ emptyText: '暂无文件记录' }}
          />
        </Space>
      )}

      {!job && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>加载中…</div>
      )}

      {/* 审核抽屉（嵌套在详情抽屉内） */}
      <IndexReviewDrawer
        open={!!reviewCode}
        stdCode={reviewCode ?? ''}
        onReviewed={(code, status) => {
          // 乐观更新 reviewStatusMap，保证当次不用等重新拉取
          setReviewStatusMap((prev) => ({ ...prev, [code]: status }))
        }}
        onClose={() => {
          setReviewCode(null)
        }}
      />
    </Drawer>
  )
}
