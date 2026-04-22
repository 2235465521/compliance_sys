import { Col, Row, Spin, Typography, Button, Space, Divider } from 'antd'
import {
  ReloadOutlined,
  FileExcelOutlined,
  DatabaseOutlined,
  AlertOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  CalendarOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import KpiCard from './components/KpiCard'
import StatsPieChart from './components/StatsPieChart'
import StandardSearch from './components/StandardSearch'
import RealTimeUpdates from './components/RealTimeUpdates'
import RevocationWarnings from './components/RevocationWarnings'
import QuickActions from './components/QuickActions'
import { useDashboardData } from './hooks/useDashboardData'

dayjs.locale('zh-cn')

/** KPI 卡片配置 */
const KPI_CONFIG = [
  {
    key: 'totalCount' as const,
    title: '标准总量',
    icon: <DatabaseOutlined />,
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    key: 'activeCount' as const,
    title: '现行标准',
    icon: <SafetyCertificateOutlined />,
    gradient: 'linear-gradient(135deg, #56d082 0%, #38a169 100%)',
  },
  {
    key: 'pendingCount' as const,
    title: '即将实施',
    icon: <ClockCircleOutlined />,
    gradient: 'linear-gradient(135deg, #f6ad55 0%, #dd6b20 100%)',
  },
  {
    key: 'revokedCount' as const,
    title: '废止标准',
    icon: <StopOutlined />,
    gradient: 'linear-gradient(135deg, #a0aec0 0%, #4a5568 100%)',
  },
  {
    key: 'unreadWarnings' as const,
    title: '未读预警',
    icon: <AlertOutlined />,
    gradient: 'linear-gradient(135deg, #fc8181 0%, #c53030 100%)',
  },
]

export default function DashboardPage() {
  const { stats, loading, reload } = useDashboardData()

  return (
    <div
      style={{
        padding: '24px 28px',
        minHeight: '100%',
        background: '#f5f7fa',
      }}
    >
      {/* ── 页头区 ──────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
        }}
      >
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#1a202c' }}>
            工作台 · 仪表盘
          </Typography.Title>
          <Space style={{ marginTop: 4 }} size={6}>
            <CalendarOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {dayjs().format('YYYY年MM月DD日')} · 数据实时概览
            </Typography.Text>
          </Space>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={reload}
            loading={loading}
            style={{ borderRadius: 8 }}
          >
            刷新数据
          </Button>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            style={{ borderRadius: 8 }}
          >
            导出报告
          </Button>
        </Space>
      </div>

      <Spin spinning={loading} size="large" tip="数据加载中...">
        {/* ── 顶部胶囊导航栏 ────────────────────────────────────── */}
        <QuickActions />

        {/* ── KPI 卡片行（flex 5 等宽）──────────────────────── */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          {KPI_CONFIG.map(({ key, title, icon, gradient }) => (
            <div key={key} style={{ flex: '1 1 160px', minWidth: 150 }}>
              <KpiCard
                title={title}
                value={stats?.[key] ?? 0}
                icon={icon}
                gradient={gradient}
              />
            </div>
          ))}
        </div>

        <Row gutter={[16, 16]}>
          {/* ── 图表区 ──────────────────────────────────────── */}
          <Col xs={24} lg={8}>
            <StatsPieChart data={stats?.typeData ?? []} />
          </Col>
          <Col xs={24} lg={16}>
            <StandardSearch />
          </Col>

          {/* ── 底部实时更新与提醒专区 ──────────────────────────── */}
          <Col xs={24} lg={16}>
            <RealTimeUpdates />
          </Col>
          <Col xs={24} lg={8}>
            <RevocationWarnings />
          </Col>
        </Row>

        <Divider style={{ margin: '16px 0 8px' }} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          数据来源：标准化信息服务平台后端 · 每次进入页面自动刷新 · 预警标记已读后实时同步
        </Typography.Text>
      </Spin>
    </div>
  )
}
