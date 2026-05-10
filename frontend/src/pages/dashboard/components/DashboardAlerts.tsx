import { useMemo, useState } from "react";
import {
  Card,
  List,
  Tag,
  Alert,
  Spin,
  Typography,
  Input,
  Button,
  Space,
  Row,
  Col,
} from "antd";
import {
  WarningOutlined,
  NotificationOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  HourglassOutlined,
} from "@ant-design/icons";
import type { AbolitionHintItem } from "@/types/dashboard";

const { Text } = Typography;

const getDaysTagColor = (days: number) => {
  if (days <= 7) return "#cf1322";
  if (days <= 15) return "#fa8c16";
  return "#108ee9";
};

interface Props {
  loading: boolean;
  asOf?: string;
  upcoming: AbolitionHintItem[];
  recent: AbolitionHintItem[];
}

export default function DashboardAlerts({
  loading,
  asOf,
  upcoming,
  recent,
}: Props) {
  const [searchText, setSearchText] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const processedUpcoming = useMemo(() => {
    const keyword = searchText.toLowerCase();
    let filtered = upcoming.filter(
      (item) =>
        item.stdCode.toLowerCase().includes(keyword) ||
        item.stdName.toLowerCase().includes(keyword),
    );
    filtered = [...filtered].sort((a, b) =>
      sortOrder === "asc"
        ? a.daysFromToday - b.daysFromToday
        : b.daysFromToday - a.daysFromToday,
    );
    return filtered;
  }, [upcoming, searchText, sortOrder]);

  const asOfSuffix = asOf ? ` · 基准日 ${asOf}` : "";

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        <Card
          title={
            <Space>
              <HourglassOutlined
                style={{ color: "#1890ff", marginRight: 8 }}
              />
              <span style={{ fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
                废止日期临近（未过期）
              </span>
            </Space>
          }
          style={{
            height: "100%",
            borderRadius: 16,
            boxShadow: "0 4px 20px -8px rgba(0,0,0,0.05)",
            border: "none",
          }}
          styles={{
            header: { borderBottom: "1px solid #f1f5f9", padding: "20px 24px" },
            body: { padding: "24px" },
          }}
          extra={
            <Space>
              <Input
                placeholder="搜索标准号或名称"
                prefix={<SearchOutlined />}
                allowClear
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 200, borderRadius: 8 }}
              />
              <Button
                type="text"
                icon={
                  sortOrder === "asc" ? (
                    <SortAscendingOutlined />
                  ) : (
                    <SortDescendingOutlined />
                  )
                }
                onClick={() =>
                  setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                }
                title={
                  sortOrder === "asc"
                    ? "当前：最近废止日优先（点击切换）"
                    : "当前：较晚废止日优先（点击切换）"
                }
              />
            </Space>
          }
        >
          <Spin spinning={loading}>
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
              废止日在基准日当天及之后的窗口内列出{asOfSuffix}
            </Typography.Text>
            <List
              itemLayout="horizontal"
              dataSource={processedUpcoming}
              pagination={{
                pageSize: 3,
                size: "small",
                hideOnSinglePage: true,
                showSizeChanger: false,
                showQuickJumper: true,
              }}
              renderItem={(item) => (
                <List.Item
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    padding: "16px 0",
                  }}
                >
                  <List.Item.Meta
                    title={
                      <Text strong style={{ fontSize: 15, color: "#334155" }}>
                        {item.stdCode} {item.stdName}
                      </Text>
                    }
                    description={
                      <span style={{ color: "#94a3b8" }}>
                        状态：{item.stdStatus} · 废止日 {item.abolitionDate}
                      </span>
                    }
                  />
                  <div>
                    <Tag
                      color={getDaysTagColor(item.daysFromToday)}
                      style={{
                        fontSize: "14px",
                        padding: "4px 10px",
                        borderRadius: 6,
                        marginRight: 0,
                      }}
                    >
                      距废止还有 {item.daysFromToday} 天
                    </Tag>
                  </div>
                </List.Item>
              )}
              locale={{
                emptyText: (
                  <div style={{ padding: "40px", color: "#94a3b8" }}>
                    当前窗口内暂无即将到达废止日的标准
                  </div>
                ),
              }}
            />
          </Spin>
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        <Card
          title={
            <Space>
              <WarningOutlined style={{ color: "#faad14", marginRight: 8 }} />
              <span style={{ fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
                近期已废止
              </span>
            </Space>
          }
          style={{
            height: "100%",
            borderRadius: 16,
            boxShadow: "0 4px 20px -8px rgba(0,0,0,0.05)",
            border: "none",
          }}
          styles={{
            header: { borderBottom: "1px solid #f1f5f9", padding: "20px 24px" },
            body: { padding: "24px" },
          }}
        >
          <Spin spinning={loading}>
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
              abolition_date 早于基准日且在 recent 天内{asOfSuffix}
            </Typography.Text>
            <List
              dataSource={recent}
              pagination={{
                pageSize: 2,
                size: "small",
                hideOnSinglePage: true,
                showSizeChanger: false,
                showQuickJumper: true,
              }}
              renderItem={(item) => (
                <List.Item
                  style={{ borderBottom: "none", padding: "0 0 12px 0" }}
                >
                  <Alert
                    message={`${item.stdCode} · ${item.stdName}`}
                    description={
                      <span>
                        废止日 {item.abolitionDate}（已过去{" "}
                        {Math.abs(item.daysFromToday)} 天）
                      </span>
                    }
                    type="error"
                    showIcon
                    icon={<NotificationOutlined />}
                    action={<Tag color="error">已废止</Tag>}
                    style={{ width: "100%", borderRadius: 8 }}
                  />
                </List.Item>
              )}
              locale={{
                emptyText: (
                  <div
                    style={{
                      padding: "24px",
                      background: "#eff6ff",
                      borderRadius: 10,
                      border: "1px solid #bfdbfe",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "#1d4ed8",
                    }}
                  >
                    <NotificationOutlined
                      style={{ fontSize: 16, color: "#3b82f6" }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>
                      近期窗口内暂无已废止记录
                    </span>
                  </div>
                ),
              }}
            />
          </Spin>
        </Card>
      </Col>
    </Row>
  );
}
