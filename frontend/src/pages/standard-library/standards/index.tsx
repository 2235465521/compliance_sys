import { ProTable } from '@ant-design/pro-components'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { UploadFile, UploadProps } from 'antd/es/upload/interface'
import zhCN from 'antd/locale/zh_CN'
import { SL_PAGE_SUBTITLE, SL_PAGE_TITLE } from '@/pages/standard-library/pageHeaderStyles'

/** 分页区文案（与全局 zhCN 一致并显式写出，避免 ProTable 内层未吃到 ConfigProvider） */
const paginationLocaleZh = {
  ...zhCN.Pagination,
  items_per_page: '条/页',
  jump_to: '跳至',
  jump_to_confirm: '确定',
  page: '页',
  prev_page: '上一页',
  next_page: '下一页',
  prev_5: '向前 5 页',
  next_5: '向后 5 页',
  prev_3: '向前 3 页',
  next_3: '向后 3 页',
  page_size: '每页条数',
}
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import * as echarts from 'echarts'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  fetchDetailInfo,
  fetchStatistics,
  importStandardMetadataBatch,
  listStandards,
} from '@/services/standard-library'
import type { StatisticsPayload, StdBaseRow } from '@/types/standard-library'

const { Title, Text } = Typography

function stateAgg(stats: StatisticsPayload | null) {
  const states = stats?.states ?? {}
  const total = Object.values(states).reduce((a, v) => a + (Number(v) || 0), 0)
  const n = (k: string) => Number(states[k] ?? 0) || 0
  const pct = (c: number) => (total > 0 ? ((c / total) * 100).toFixed(1) : '0.0')
  return {
    total,
    current: n('现行'),
    obsolete: n('废止'),
    upcoming: n('即将实施'),
    pct,
  }
}

function recordToPieData(rec: Record<string, number> | undefined) {
  if (!rec) return []
  return Object.entries(rec).map(([name, value]) => ({ name, value: Number(value) || 0 }))
}

/** 执行状态环形图（紧凑） */
function RegistryStatusRing({ stats, loading }: { stats: StatisticsPayload | null; loading: boolean }) {
  const elRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!stats || loading || !elRef.current) return
    const seriesData = recordToPieData(stats.states).filter((d) => d.value > 0)
    if (!chartRef.current) chartRef.current = echarts.init(elRef.current)
    const colorMap: Record<string, string> = {
      现行: '#52c41a',
      废止: '#ff4d4f',
      即将实施: '#fa8c16',
    }
    chartRef.current.setOption(
      {
        color: seriesData.map((d) => colorMap[d.name] ?? '#1677ff'),
        tooltip: { trigger: 'item', formatter: '{b}: {c}（{d}%）' },
        legend: {
          orient: 'vertical',
          right: '4%',
          top: 'middle',
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { fontSize: 12, color: 'rgba(0,0,0,0.65)' },
        },
        series: [
          {
            type: 'pie',
            radius: ['52%', '74%'],
            center: ['38%', '50%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
            label: {
              show: true,
              position: 'outside',
              formatter: '{b}\n{d}%',
              fontSize: 11,
              color: 'rgba(0,0,0,0.75)',
            },
            labelLine: { length: 10, length2: 8, smooth: true },
            data: seriesData.map((d) => ({
              ...d,
              itemStyle: { color: colorMap[d.name] ?? '#1677ff' },
            })),
          },
        ],
      },
      true,
    )
    const onResize = () => chartRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [stats, loading])

  useEffect(
    () => () => {
      chartRef.current?.dispose()
      chartRef.current = null
    },
    [],
  )

  if (loading && !stats) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    )
  }
  if (!stats || !recordToPieData(stats.states).some((d) => d.value > 0)) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无状态分布" />
      </div>
    )
  }
  return <div ref={elRef} style={{ width: '100%', height: 176 }} />
}

/** 仪表盘指标块：渐变底、图标角标、轻悬停（主流 B 端常见样式） */
function RegistryMetricTile(props: {
  title: string
  value: number
  sub: string
  accent: string
  icon: ReactNode
}) {
  const { title, value, sub, accent, icon } = props
  return (
    <div
      style={{
        borderRadius: 16,
        padding: '20px 22px',
        height: '100%',
        minHeight: 148,
        background: `linear-gradient(155deg, ${accent}14 0%, rgba(255,255,255,0.92) 42%, #fff 100%)`,
        border: '1px solid rgba(5,5,5,0.06)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <Flex justify="space-between" align="flex-start" gap={12}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 13, letterSpacing: 0.2 }}>
            {title}
          </Text>
          <div style={{ fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' as const }}>
            <Statistic
              value={value}
              valueStyle={{
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1.2,
                marginTop: 6,
                marginBottom: 4,
                color: 'rgba(0,0,0,0.88)',
              }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {sub}
          </Text>
        </div>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            background: `${accent}22`,
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </Flex>
    </div>
  )
}

function renderExStateTag(state: string | undefined) {
  if (!state) return <Tag>—</Tag>
  if (state === '现行') return <Tag color="success">现行</Tag>
  if (state === '废止') return <Tag color="error">废止</Tag>
  if (state === '即将实施') return <Tag color="warning">即将实施</Tag>
  return <Tag>{state}</Tag>
}

/** 列表「类别」列：后端字段名不统一，取常见键 */
function pickCategory(row: StdBaseRow): string {
  const v =
    row.bz_type ??
    row.standard_type ??
    row.type_name ??
    (typeof row.category === 'string' ? row.category : undefined) ??
    row['bz_category']
  if (v != null && String(v).trim()) return String(v)
  return '—'
}

export default function StandardLibraryRegistryPage() {
  const actionRef = useRef<ActionType>(null)
  /** 避免 setState 与 reload 同帧时 request 读到旧的 keyword / ex_state */
  const listQueryRef = useRef<{ keyword: string; exState: string | undefined }>({ keyword: '', exState: undefined })

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailBzId, setDetailBzId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  const [stats, setStats] = useState<StatisticsPayload | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [searchInput, setSearchInput] = useState('')
  const [listExState, setListExState] = useState<string | undefined>(undefined)

  const [batchFileList, setBatchFileList] = useState<UploadFile[]>([])
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [singleModalOpen, setSingleModalOpen] = useState(false)

  const openDetail = useCallback(async (bzId: string) => {
    setDetailBzId(bzId)
    setDrawerOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const d = await fetchDetailInfo(bzId)
      setDetail(d)
    } catch (e) {
      message.error((e as Error).message)
      setDrawerOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const data = await fetchStatistics()
      setStats(data)
    } catch (e) {
      message.warning((e as Error).message)
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const uploadProps: UploadProps = {
    multiple: true,
    accept: '.xlsx,.xls,.csv,.zip',
    fileList: batchFileList,
    beforeUpload: (file) => {
      setBatchFileList((prev) => [...prev, { uid: file.uid, name: file.name, originFileObj: file }])
      return false
    },
    onRemove: (file) => {
      setBatchFileList((prev) => prev.filter((f) => f.uid !== file.uid))
    },
  }

  const submitBatchImport = async () => {
    const files = batchFileList.map((f) => f.originFileObj).filter(Boolean) as File[]
    if (files.length === 0) {
      message.warning('请先选择要入库的文件')
      return
    }
    setBatchSubmitting(true)
    try {
      await importStandardMetadataBatch(files)
      message.success('批量入库请求已提交')
      setBatchFileList([])
      setBatchModalOpen(false)
      void loadStats()
      actionRef.current?.reload()
    } catch (e) {
      const err = e as Error & { response?: { status?: number } }
      const hint =
        err.response?.status === 404
          ? '批量入库接口尚未在后端实现或路径不一致，请联调后再试。'
          : err.message || '请求失败'
      message.error(hint)
    } finally {
      setBatchSubmitting(false)
    }
  }

  const agg = stateAgg(stats)

  const columns: ProColumns<StdBaseRow>[] = [
    {
      title: '标准号',
      dataIndex: 'bz_id',
      copyable: true,
      ellipsis: true,
      width: 200,
    },
    {
      title: '名称',
      dataIndex: 'bz_name',
      ellipsis: true,
    },
    {
      title: '类别',
      key: 'category',
      width: 120,
      ellipsis: true,
      search: false,
      render: (_, row) => <Text ellipsis={{ tooltip: pickCategory(row) }}>{pickCategory(row)}</Text>,
    },
    {
      title: '执行状态',
      dataIndex: 'ex_state',
      width: 110,
      search: false,
      render: (_, row) => renderExStateTag(row.ex_state),
    },
    {
      title: '发布日期',
      dataIndex: 'release_date',
      width: 120,
      search: false,
    },
    {
      title: '实施日期',
      dataIndex: 'implement_time',
      width: 120,
      search: false,
    },
    {
      title: '操作',
      valueType: 'option',
      width: 88,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" disabled={!record.bz_id} onClick={() => openDetail(record.bz_id!)}>
          详情
        </Button>
      ),
    },
  ]

  return (
    <div style={{ width: '100%' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={SL_PAGE_TITLE}>
            标准入库与查询
          </Title>
          <Text style={SL_PAGE_SUBTITLE}>总览库内标准数量与执行状态，支持检索、筛选与元数据入库（布局参考工作台仪表盘）。</Text>
        </div>

        <Row gutter={[16, 16]} align="stretch">
          <Col xs={24} sm={12} lg={4}>
            <RegistryMetricTile
              title="总标准数（按状态汇总）"
              value={agg.total}
              sub="统计来自当前库内计数接口"
              accent="#1677ff"
              icon={<DatabaseOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <RegistryMetricTile
              title="现行"
              value={agg.current}
              sub={`约占 ${agg.pct(agg.current)}%`}
              accent="#52c41a"
              icon={<CheckCircleOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <RegistryMetricTile
              title="废止"
              value={agg.obsolete}
              sub={`约占 ${agg.pct(agg.obsolete)}%`}
              accent="#ff4d4f"
              icon={<StopOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <RegistryMetricTile
              title="即将实施"
              value={agg.upcoming}
              sub={`约占 ${agg.pct(agg.upcoming)}%`}
              accent="#fa8c16"
              icon={<ClockCircleOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card
              bordered={false}
              title={<span style={{ fontWeight: 600 }}>状态分布</span>}
              extra={
                <Button type="text" size="small" icon={<ReloadOutlined />} loading={statsLoading} onClick={() => void loadStats()}>
                  刷新
                </Button>
              }
              style={{
                borderRadius: 16,
                minHeight: 148,
                background: 'linear-gradient(155deg, rgba(22,119,255,0.06) 0%, #fff 55%)',
                border: '1px solid rgba(5,5,5,0.06)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              styles={{ body: { padding: '8px 12px 4px' } }}
            >
              <RegistryStatusRing stats={stats} loading={statsLoading} />
            </Card>
          </Col>
        </Row>

        <Card
          bordered={false}
          style={{
            borderRadius: 12,
            boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02), 0 2px 4px 0 rgba(0,0,0,0.02)',
          }}
          styles={{ body: { padding: 0 } }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(5,5,5,0.06)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setSingleModalOpen(true)}>
                单条入库
              </Button>
              <Button icon={<CloudUploadOutlined />} onClick={() => setBatchModalOpen(true)}>
                批量入库
              </Button>
            </Space>
            <Space wrap style={{ justifyContent: 'flex-end' }}>
              <Select
                allowClear
                placeholder="执行状态"
                style={{ width: 140 }}
                value={listExState}
                onChange={(v) => {
                  listQueryRef.current.exState = v
                  setListExState(v)
                  actionRef.current?.reload()
                }}
                options={[
                  { label: '现行', value: '现行' },
                  { label: '废止', value: '废止' },
                  { label: '即将实施', value: '即将实施' },
                ]}
              />
              <Input.Search
                allowClear
                placeholder="搜索标准号、名称…"
                style={{ width: 320, maxWidth: '100%' }}
                value={searchInput}
                onChange={(e) => {
                  const v = e.target.value
                  setSearchInput(v)
                  if (!v) {
                    listQueryRef.current.keyword = ''
                    actionRef.current?.reload()
                  }
                }}
                onSearch={(v) => {
                  const t = v.trim()
                  listQueryRef.current.keyword = t
                  setSearchInput(v)
                  actionRef.current?.reload()
                }}
              />
              <Button
                icon={<FilterOutlined />}
                onClick={() => message.info('已支持按执行状态下拉筛选；更多条件可在后续版本扩展。')}
              >
                筛选说明
              </Button>
              <Button onClick={() => message.info('导出功能暂未实现')}>导出</Button>
            </Space>
          </div>

          <ProTable<StdBaseRow>
            actionRef={actionRef}
            rowKey={(r, i) => String(r.id ?? r.bz_id ?? i)}
            columns={columns}
            search={false}
            options={{ reload: true, density: true, setting: true }}
            pagination={{
              locale: paginationLocaleZh,
              defaultPageSize: 20,
              pageSizeOptions: [10, 20, 50, 100],
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `显示第 ${range[0]}–${range[1]} 条，共 ${total} 条记录`,
            }}
            dateFormatter="string"
            cardProps={{ bodyStyle: { padding: '0 20px 20px' } }}
            request={async (params) => {
              try {
                const res = await listStandards({
                  page: params.current,
                  pageSize: params.pageSize,
                  search: listQueryRef.current.keyword || undefined,
                  ex_state: listQueryRef.current.exState,
                })
                return {
                  data: res.results,
                  total: res.count,
                  success: true,
                }
              } catch (e) {
                message.error((e as Error).message || '加载失败')
                return { data: [], total: 0, success: false }
              }
            }}
          />
        </Card>
      </Space>

      <Modal
        title="单条入库"
        open={singleModalOpen}
        onCancel={() => setSingleModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setSingleModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <Text type="secondary">
          逐条录入标准元数据需后端提供创建接口；当前为占位入口，正式联调后可在此放置表单并对接保存接口。
        </Text>
      </Modal>

      <Modal
        title="批量入库"
        open={batchModalOpen}
        onCancel={() => setBatchModalOpen(false)}
        width={560}
        footer={[
          <Button key="c" onClick={() => setBatchModalOpen(false)}>
            取消
          </Button>,
          <Button key="s" type="primary" loading={batchSubmitting} onClick={() => void submitBatchImport()}>
            提交批量入库
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text type="secondary">
            支持多文件（Excel、CSV、压缩包等，以后端约定为准）。接口：<Text code>POST /api/standards/metadata-batch-import/</Text>
          </Text>
          <Upload.Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <CloudUploadOutlined style={{ fontSize: 40, color: '#1677ff' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此处（可多选）</p>
            <p className="ant-upload-hint">选择完成后点击「提交批量入库」。</p>
          </Upload.Dragger>
        </Space>
      </Modal>

      <Drawer
        title={detailBzId ? `标准详情 · ${detailBzId}` : '标准详情'}
        width={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
      >
        {detailLoading ? (
          <span style={{ color: 'rgba(0,0,0,0.45)' }}>加载中…</span>
        ) : detail ? (
          <Descriptions column={1} bordered size="small">
            {Object.entries(detail).map(([k, v]) => (
              <Descriptions.Item key={k} label={k}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        ) : null}
      </Drawer>
    </div>
  )
}
