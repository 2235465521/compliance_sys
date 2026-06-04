import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  App,
  Button,
  Col,
  Drawer,
  Empty,
  Input,
  Pagination,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import { AuditOutlined, ReloadOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons'
import { WarningCompareTable } from '@/pages/alert/components/WarningCompareTable'
import { WarningTaskConclusionBanner } from '@/pages/alert/components/WarningTaskConclusionBanner'
import {
  mapForwardWarningFromApi,
  mapMonitorEnterpriseItemFromApi,
  mapMonitorSummaryFromApi,
} from '@/pages/alert/utils/mapWarningsApi'
import { WARNING_TASK_CONCLUSION_META } from '@/pages/alert/utils/warningCompareLabels'
import {
  fetchMonitorEnterpriseDetail,
  fetchMonitorEnterprises,
  fetchMonitorSummary,
  triggerWarningsScan,
  WarningsApiError,
} from '@/services/warnings-api'
import type { ForwardWarningResult, MonitorEnterpriseItem, MonitorSummary } from '@/types/warnings'

const { Text } = Typography

type MonitorStatusFilter = 'all' | 'need_attention' | 'all_ok'

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
  /** 汇总数据更新时同步页头铃铛数量 */
  onSummaryUpdated?: (summary: MonitorSummary) => void
  /** 递增时自动筛选「需更新」（页头铃铛跳转） */
  focusNeedAttentionNonce?: number
}

export function MonitorTab({ onSummaryUpdated, focusNeedAttentionNonce = 0 }: MonitorTabProps) {
  const { message } = App.useApp()
  const [summary, setSummary] = useState<MonitorSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [items, setItems] = useState<MonitorEnterpriseItem[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<MonitorStatusFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<ForwardWarningResult | null>(null)
  const [selectedQb, setSelectedQb] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const api = await fetchMonitorSummary()
      const mapped = mapMonitorSummaryFromApi(api)
      setSummary(mapped)
      onSummaryUpdated?.(mapped)
    } catch (e) {
      setSummary(null)
      if (e instanceof WarningsApiError && e.status !== 404) {
        message.warning('监控汇总接口暂不可用，请确认后端已实现 /warnings/monitor/summary/')
      }
    } finally {
      setSummaryLoading(false)
    }
  }, [message, onSummaryUpdated])

  const applyStatusFilter = (next: MonitorStatusFilter) => {
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
    void loadSummary()
  }, [loadSummary])

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

  const runScan = async () => {
    try {
      const res = await triggerWarningsScan()
      message.success(res.message || '巡检已触发')
      void loadSummary()
      void loadList()
    } catch (e) {
      message.error(e instanceof WarningsApiError ? e.message : '巡检失败')
    }
  }

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
            <Button icon={<ReloadOutlined />} onClick={() => { void loadSummary(); void loadList() }}>
              刷新
            </Button>
            <Button icon={<AuditOutlined />} onClick={() => void runScan()}>
              主动巡检
            </Button>
          </Space>
        </Col>
      </Row>

      <Spin spinning={summaryLoading}>
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col xs={12} sm={6}>
            <MonitorStatCard active={statusFilter === 'all'} onClick={() => applyStatusFilter('all')}>
              <Statistic title="已评价企标" value={summary?.totalEvaluatedQb ?? '—'} />
            </MonitorStatCard>
          </Col>
          <Col xs={12} sm={6}>
            <MonitorStatCard
              active={statusFilter === 'need_attention'}
              onClick={() => applyStatusFilter('need_attention')}
              style={{ background: '#fff2f0' }}
            >
              <Statistic
                title="需更新"
                value={summary?.needAttentionCount ?? '—'}
                valueStyle={{ color: '#cf1322' }}
              />
            </MonitorStatCard>
          </Col>
          <Col xs={12} sm={6}>
            <MonitorStatCard
              active={statusFilter === 'all_ok'}
              onClick={() => applyStatusFilter('all_ok')}
              style={{ background: '#f6ffed' }}
            >
              <Statistic title="状态良好" value={summary?.allOkCount ?? '—'} valueStyle={{ color: '#389e0d' }} />
            </MonitorStatCard>
          </Col>
          <Col xs={12} sm={6}>
            <MonitorStatCard
              active={false}
              onClick={() => {
                void loadSummary()
                void loadList()
              }}
            >
              <Statistic
                title="最近巡检"
                value={
                  summary?.lastScanAt
                    ? new Date(summary.lastScanAt).toLocaleString('zh-CN', { hour12: false })
                    : '—'
                }
                valueStyle={{ fontSize: 14 }}
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                点击刷新汇总与列表
              </Text>
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
          style={{ width: 140 }}
          value={statusFilter}
          onChange={(v) => applyStatusFilter(v as MonitorStatusFilter)}
          options={[
            { value: 'all', label: '全部' },
            { value: 'need_attention', label: '需更新' },
            { value: 'all_ok', label: '状态良好' },
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
              const meta = WARNING_TASK_CONCLUSION_META[row.taskConclusion]
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
                        <Tag color={meta?.type === 'warning' ? 'orange' : 'green'}>
                          {meta?.label ?? row.taskConclusion}
                        </Tag>
                        {row.taskSummary ? (
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}>
                            {row.taskSummary}
                          </Text>
                        ) : null}
                      </div>
                    </div>
                    <Button type="link" onClick={() => void openDetail(row.qbCode)}>
                      查看比对 <RightOutlined />
                    </Button>
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
