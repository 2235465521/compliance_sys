import { Col, Row, Spin, Typography, Button, Space } from "antd";
import {
  ReloadOutlined,
  DatabaseOutlined,
  AlertOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import KpiCard from "./components/KpiCard";
import StatsPieChart from "./components/StatsPieChart";
import StatsRingChart from "./components/StatsRingChart";
import StandardSearch from "./components/StandardSearch";
import DashboardAlerts from "./components/DashboardAlerts";
import { useDashboardData } from "./hooks/useDashboardData";

dayjs.locale("zh-cn");

export default function DashboardPage() {
  const { stats, loading, reload } = useDashboardData();

  const total = stats?.totalCount ?? 0;
  const activePct =
    total > 0 ? ((( stats?.activeCount ?? 0) / total) * 100).toFixed(1) : "0.0";

  const KPI_CONFIG = [
    {
      key: "totalCount" as const,
      title: "标准总量",
      icon: <DatabaseOutlined />,
      borderColor: "#6366f1",
      iconBg: "#eef2ff",
      iconColor: "#6366f1",
      subtitle: "库内标准总计",
    },
    {
      key: "activeCount" as const,
      title: "现行标准",
      icon: <SafetyCertificateOutlined />,
      borderColor: "#10b981",
      iconBg: "#ecfdf5",
      iconColor: "#10b981",
      subtitle: `占比 ${activePct}%`,
    },
    {
      key: "pendingCount" as const,
      title: "即将实施",
      icon: <ClockCircleOutlined />,
      borderColor: "#f59e0b",
      iconBg: "#fffbeb",
      iconColor: "#f59e0b",
      subtitle: "尚未生效标准",
      subtitleColor: "#f59e0b",
    },
    {
      key: "revokedCount" as const,
      title: "废止标准",
      icon: <StopOutlined />,
      borderColor: "#9ca3af",
      iconBg: "#f3f4f6",
      iconColor: "#6b7280",
      subtitle: "历史累计废止",
    },
    {
      key: "unreadWarnings" as const,
      title: "近期废止警示",
      icon: <AlertOutlined />,
      borderColor: "#ef4444",
      iconBg: "#fef2f2",
      iconColor: "#ef4444",
      subtitle: "30天内到期",
      subtitleColor: "#ef4444",
    },
  ];

  return (
    <div style={{ padding: "24px 28px", minHeight: "100%", background: "#f3f4f6" }}>
      {/* ── 页头 ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: "#111827" }}>
            工作台 · 仪表盘
          </Typography.Title>
          <Space style={{ marginTop: 4 }} size={6}>
            <CalendarOutlined style={{ color: "#9ca3af", fontSize: 13 }} />
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {dayjs().format("YYYY年MM月DD日")} · 进入页面或点击刷新加载最新统计
            </Typography.Text>
          </Space>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={reload}
          loading={loading}
          style={{ borderRadius: 8 }}
        >
          刷新数据
        </Button>
      </div>

      <Spin spinning={loading} size="large" tip="数据加载中...">
        {/* ── 第一行：5 张 KPI 卡片 ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {KPI_CONFIG.map(({ key, title, icon, borderColor, iconBg, iconColor, subtitle, subtitleColor }) => (
            <KpiCard
              key={key}
              title={title}
              value={stats?.[key] ?? 0}
              icon={icon}
              borderColor={borderColor}
              iconBg={iconBg}
              iconColor={iconColor}
              subtitle={subtitle}
              subtitleColor={subtitleColor}
            />
          ))}
        </div>

        {/* ── 第二行：类别分布（左）+ 状态分布&快速查询（右）── */}
        <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
          <Col xs={24} lg={14}>
            <StatsPieChart data={stats?.typeData ?? []} />
          </Col>
          <Col xs={24} lg={10}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
              <StatsRingChart data={stats?.stateData ?? []} />
              <div style={{ flex: 1 }}>
                <StandardSearch />
              </div>
            </div>
          </Col>
        </Row>

        {/* ── 第三行：废止预警双列 ── */}
        <DashboardAlerts
          loading={loading}
          asOf={stats?.abolitionHintsAsOf}
          upcoming={stats?.abolitionUpcoming ?? []}
          recent={stats?.abolitionRecent ?? []}
        />
      </Spin>
    </div>
  );
}
