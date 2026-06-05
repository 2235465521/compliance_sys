import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Alert,
  App,
  Button,
  Col,
  Drawer,
  Empty,
  Input,
  Pagination,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import {
  AuditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useMonitorScanPolling } from '@/pages/alert/hooks/useMonitorScanPolling'
import { monitorScanPhaseLabel } from '@/pages/alert/utils/monitorScanLabels'
import { WarningCompareTable } from '@/pages/alert/components/WarningCompareTable'
import { WarningTaskConclusionBanner } from '@/pages/alert/components/WarningTaskConclusionBanner'
import {
  mapForwardWarningFromApi,
  mapMonitorEnterpriseItemFromApi,
} from '@/pages/alert/utils/mapWarningsApi'
import {
  canOpenMonitorDetail,
  monitorStatusLabel,
  MONITOR_STATUS_TAG_META,
} from '@/pages/alert/utils/monitorStatusLabels'
import {
  fetchMonitorEnterpriseDetail,
  fetchMonitorEnterprises,
  WarningsApiError,
} from '@/services/warnings-api'
import type {
  ForwardWarningResult,
  MonitorEnterpriseItem,
  MonitorListStatus,
  MonitorSummary,
} from '@/types/warnings'

const { Text } = Typography

function MonitorStatCard({
  active,
  onClick,
  children,
  style,
}: {
  active: boolean
  onClick?: () => void
  children: ReactNode
  style?: React.CSSProperties
}) {
  const interactive = Boolean(onClick)
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      style={{
        padding: 16,
        borderRadius: 10,
        border: active ? '2px solid #1677ff' : '1px solid #f0f0f0',
        background: '#fff',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: active ? '0 4px 12px rgba(22, 119, 255, 0.12)' : undefined,
        height: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export type MonitorTabProps = {
  /** 由预警页统一拉取，避免与页头铃铛重复请求 */
  summary: MonitorSummary | null
  summaryLoading: boolean
  onRefreshSummary: () => Promise<void>
  /** 轮询 summary 时回写（含 active_scan），不触发全页 loading */
  onSummaryChange: (summary: MonitorSummary) => void
  /** 递增时自动筛选「需更新」（页头铃铛跳转） */
  focusNeedAttentionNonce?: number
}

export function MonitorTab({
  summary,
  summaryLoading,
  onRefreshSummary,
  onSummaryChange,
  focusNeedAttentionNonce = 0,
}: MonitorTabProps) {
  const { message } = App.useApp()
  const [items, setItems] = useState<MonitorEnterpriseItem[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<MonitorListStatus>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<ForwardWarningResult | null>(null)
  const [selectedQb, setSelectedQb] = useState<string | null>(null)

  const applyStatusFilter = (next: MonitorListStatus) => {
    setStatusFilter(next)
    setPage(1)
  }

  useEffect(() => {
    if (focusNeedAttentionNonce > 0) {
      applyStatusFilter('need_attention')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅响应铃铛跳转 nonce
  }, [focusNeedAttentionNonce])

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const res = await fetchMonitorEnterprises({
        page,
        page_size: pageSize,
        keyword: keyword.trim() || undefined,
        status: statusFilter,
      })
      setItems((res.items ?? []).map(mapMonitorEnterpriseItemFromApi))
      setTotal(res.total ?? 0)
    } catch (e) {
      setItems([])
      setTotal(0)
      message.error(e instanceof WarningsApiError ? e.message : '加载监控列表失败')
    } finally {
      setListLoading(false)
    }
  }, [keyword, message, page, pageSize, statusFilter])

  const runQuery = () => {
    if (page === 1) void loadList()
    else setPage(1)
  }

  useEffect(() => {
    void loadList()
  }, [loadList])

  const openDetail = async (qb: string) => {
    setSelectedQb(qb)
    setDrawerOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const api = await fetchMonitorEnterpriseDetail(qb)
      setDetail(mapForwardWarningFromApi(api))
    } catch (e) {
      message.error(e instanceof WarningsApiError ? e.message : '加载详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const { runScan, pauseScan, resumeScan, scanInProgress, activeScan } = useMonitorScanPolling({
    summary,
    onSummaryChange,
    onRefreshList: loadList,
    message,
  })

  const live = activeScan
  const displayNeedAttention = live?.needAttentionCount ?? summary?.needAttentionCount
  const displayAllOk = live?.allOkCount ?? summary?.allOkCount
  const displayNoEval = live?.noEvalRecordCount ?? summary?.noEvalRecordCount
  const displayNotScanned = live?.notScannedCount ?? summary?.notScannedCount
  const progressPercent =
    live && live.totalCount > 0
      ? Math.min(100, Math.round((live.processedCount / live.totalCount) * 100))
      : 0
  const phaseLabel = monitorScanPhaseLabel(live?.phase)
  const scanStuckAtZero =
    live &&
    live.processedCount === 0 &&
    live.status === 'running' &&
    (live.pauseRequested || !live.currentQbCode)

  return (
    <div style={{ marginTop: 4 }}>
      <Row justify="space-between" align="middle" gutter={[16, 12]} style={{ marginBottom: 16 }}>
        <Col flex="1" style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            对已有合规或批量评价记录的企标全量巡检；点击统计卡片筛选列表，点击条目查看五列比对明细。
          </Text>
        </Col>
        <Col>
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void onRefreshSummary()
                void loadList()
              }}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<AuditOutlined />}
              loading={scanInProgress && activeScan?.status === 'running'}
              disabled={scanInProgress}
              onClick={() => void runScan()}
            >
              主动巡检
            </Button>
            {activeScan?.status === 'running' ? (
              <Button icon={<PauseCircleOutlined />} onClick={() => void pauseScan()}>
                暂停
              </Button>
            ) : null}
            {activeScan?.status === 'paused' ? (
              <Button icon={<PlayCircleOutlined />} onClick={() => void resumeScan()}>
                继续
              </Button>
            ) : null}
          </Space>
        </Col>
      </Row>

      {activeScan ? (
        <div
          style={{
            marginBottom: 16,
            padding: '14px 16px',
            borderRadius: 10,
            background: '#f0f5ff',
            border: '1px solid #adc6ff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <Text strong>
              {activeScan.status === 'paused' ? '巡检已暂停' : '全库巡检进行中'}
              {activeScan.pauseRequested && activeScan.status === 'running' ? '（暂停请求处理中）' : ''}
            </Text>
            <Text type="secondary">
              {activeScan.processedCount} / {activeScan.totalCount}
            </Text>
          </div>
          <Progress percent={progressPercent} status={activeScan.status === 'paused' ? 'exception' : 'active'} />
          {activeScan.currentQbCode ? (
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
              正在巡检：{activeScan.currentQbCode}
            </Text>
          ) : null}
          {phaseLabel ? (
            <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
              {phaseLabel}
            </Text>
          ) : null}
          {scanStuckAtZero ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              message={
                live.pauseRequested
                  ? '已请求暂停，进度尚未开始'
                  : '巡检进度长时间为 0'
              }
              description={
                live.pauseRequested ? (
                  <>
                    当前任务处于「暂停请求处理中」，在尚未处理任何企标前进度会保持 0/总数。若需继续巡检，请点击
                    <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => void resumeScan()}>
                      继续
                    </Button>
                    ；若需重新全量巡检，请先让后端结束当前任务（或联系后端清理 job {live.jobId}）。
                  </>
                ) : (
                  <>
                    请确认后端已启动 Celery worker（<Text code>celery -A config.celery worker</Text>
                    ），且任务队列正常；单条企标查新较慢，启动后约 5～10 秒内 processed_count 应开始递增。
                  </>
                )
              }
            />
          ) : null}
        </div>
      ) : null}

      <Spin spinning={summaryLoading}>
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
          <Col xs={12} sm={8} lg={4}>
            <MonitorStatCard active={statusFilter === 'all'} onClick={() => applyStatusFilter('all')}>
              <Statistic title="已评价企标总数" value={summary?.totalEvaluatedQb ?? '—'} />
            </MonitorStatCard>
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <MonitorStatCard
              active={statusFilter === 'need_attention'}
              onClick={() => applyStatusFilter('need_attention')}
              style={{ background: '#fff2f0' }}
            >
              <Statistic
                title="需更新"
                value={displayNeedAttention ?? '—'}
                valueStyle={{ color: '#cf1322' }}
              />
            </MonitorStatCard>
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <MonitorStatCard
              active={statusFilter === 'all_ok'}
              onClick={() => applyStatusFilter('all_ok')}
              style={{ background: '#f6ffed' }}
            >
              <Statistic title="状态良好" value={displayAllOk ?? '—'} valueStyle={{ color: '#389e0d' }} />
            </MonitorStatCard>
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <MonitorStatCard
              active={statusFilter === 'no_eval_record'}
              onClick={() => applyStatusFilter('no_eval_record')}
              style={{ background: '#fafafa' }}
            >
              <Statistic title="无评价记录" value={displayNoEval ?? '—'} />
            </MonitorStatCard>
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <MonitorStatCard
              active={statusFilter === 'not_scanned'}
              onClick={() => applyStatusFilter('not_scanned')}
              style={{ background: '#e6f4ff' }}
            >
              <Statistic
                title="尚未巡检"
                value={displayNotScanned ?? '—'}
                valueStyle={{ color: '#0958d9' }}
              />
            </MonitorStatCard>
          </Col>
        </Row>
      </Spin>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Input
          allowClear
          style={{ minWidth: 220, maxWidth: 400, flex: '1 1 220px' }}
          placeholder="企标号或企业关键词"
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={runQuery}
        />
        <Select
          style={{ width: 168 }}
          value={statusFilter}
          onChange={(v) => applyStatusFilter(v as MonitorListStatus)}
          options={[
            { value: 'all', label: '全部' },
            { value: 'need_attention', label: '需更新' },
            { value: 'all_ok', label: '状态良好' },
            { value: 'no_eval_record', label: '无评价记录' },
            { value: 'not_scanned', label: '尚未巡检' },
          ]}
        />
        <Button type="primary" onClick={runQuery}>
          查询
        </Button>
      </div>

      {listLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description="暂无监控数据（请确认后端监控接口已就绪）" />
      ) : (
        <>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {items.map((row) => {
              const statusMeta = MONITOR_STATUS_TAG_META[row.monitorStatus]
              const showDetail = canOpenMonitorDetail(row.monitorStatus)
              return (
                <div
                  key={row.qbCode}
                  style={{
                    background: '#fff',
                    borderRadius: 10,
                    border: '1px solid #f0f0f0',
                    padding: '16px 18px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <Text strong>{row.qbCode}</Text>
                      {row.enterpriseName ? (
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          {row.enterpriseName}
                        </Text>
                      ) : null}
                      <div style={{ marginTop: 8 }}>
                        <Tag color={statusMeta?.color ?? 'default'}>
                          {monitorStatusLabel(row.monitorStatus)}
                        </Tag>
                        {row.taskSummary ? (
                          <Text
                            type="secondary"
                            style={{
                              marginLeft: 8,
                              fontSize: 13,
                              display: showDetail ? 'inline' : 'block',
                              marginTop: showDetail ? 0 : 6,
                            }}
                          >
                            {row.taskSummary}
                          </Text>
                        ) : null}
                      </div>
                    </div>
                    {showDetail ? (
                      <Button type="link" onClick={() => void openDetail(row.qbCode)}>
                        查看比对 <RightOutlined />
                      </Button>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        暂无比对明细
                      </Text>
                    )}
                  </div>
                </div>
              )
            })}
          </Space>
          <Pagination
            style={{ marginTop: 20, textAlign: 'right' }}
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            onChange={(p, ps) => {
              setPage(p)
              setPageSize(ps)
            }}
          />
        </>
      )}

      <Drawer
        title={selectedQb ? `企标预警明细 · ${selectedQb}` : '企标预警明细'}
        width={1200}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
      >
        {detailLoading ? (
          <Spin style={{ display: 'block', margin: '48px auto' }} />
        ) : detail ? (
          <>
            <WarningTaskConclusionBanner
              taskConclusion={detail.taskConclusion}
              taskSummary={detail.taskSummary}
              qbCode={detail.qbCode}
              enterpriseName={detail.enterpriseName}
            />
            <WarningCompareTable dataSource={detail.compareRows} />
          </>
        ) : (
          <Empty description="暂无明细" />
        )}
      </Drawer>
    </div>
  )
}
