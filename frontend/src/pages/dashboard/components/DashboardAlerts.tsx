import { useState, useEffect, useMemo } from "react";
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
  ClockCircleOutlined,
  NotificationOutlined,
  WarningOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from "@ant-design/icons";
import request from "@/services/request";

const { Text } = Typography;

export default function DashboardAlerts() {
  const [loading, setLoading] = useState(true);
  const [upcomingData, setUpcomingData] = useState<any[]>([]);
  const [abolishedData, setAbolishedData] = useState<any[]>([]);

  const [searchText, setSearchText] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");

  useEffect(() => {
    request
      .get("/standards/dashboard-alerts/")
      .then((res) => {
        const data = res.data?.data || (res as any).data;
        if (data) {
          setUpcomingData(data.upcoming || []);
          setAbolishedData(data.abolished || []);
        }
      })
      .catch((err) => {
        console.error("Dashboard alerts fetch failed:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  const getDaysTagColor = (days: number) => {
    if (days <= 7) return "#cf1322";
    if (days <= 15) return "#fa8c16";
    return "#108ee9";
  };

  const processedUpcomingData = useMemo(() => {
    let filtered = upcomingData.filter((item) => {
      const keyword = searchText.toLowerCase();
      const bzId = (item.bz_id || "").toLowerCase();
      const bzName = (item.bz_name || "").toLowerCase();
      return bzId.includes(keyword) || bzName.includes(keyword);
    });

    return filtered.sort((a, b) => {
      if (sortOrder === "asc") {
        return a.days_left - b.days_left;
      } else {
        return b.days_left - a.days_left;
      }
    });
  }, [upcomingData, searchText, sortOrder]);

  return (
    <Row gutter={[16, 16]}>
      {/* 左侧：实时更新专区 */}
      <Col xs={24} lg={16}>
        <Card
          title={
            <Space>
              <ClockCircleOutlined
                style={{ color: "#1890ff", marginRight: 8 }}
              />
              <span style={{ fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
                实时更新 (30天内即将实施)
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
                    ? "当前: 紧急优先 (点击切换)"
                    : "当前: 宽松优先 (点击切换)"
                }
              />
            </Space>
          }
        >
          <Spin spinning={loading}>
            <List
              itemLayout="horizontal"
              dataSource={processedUpcomingData}
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
                        {item.bz_id} {item.bz_name}
                      </Text>
                    }
                    description={
                      <span style={{ color: "#94a3b8" }}>
                        实施日期: {item.implement_time}
                      </span>
                    }
                  />
                  <div>
                    <Tag
                      color={getDaysTagColor(item.days_left)}
                      style={{
                        fontSize: "14px",
                        padding: "4px 10px",
                        borderRadius: 6,
                        marginRight: 0,
                      }}
                    >
                      仅剩 {item.days_left} 天
                    </Tag>
                  </div>
                </List.Item>
              )}
              locale={{
                emptyText: (
                  <div style={{ padding: "40px", color: "#94a3b8" }}>
                    近期暂无即将实施的标准
                  </div>
                ),
              }}
            />
          </Spin>
        </Card>
      </Col>

      {/* 右侧：提醒专区 */}
      <Col xs={24} lg={8}>
        <Card
          title={
            <Space>
              <WarningOutlined style={{ color: "#faad14", marginRight: 8 }} />
              <span style={{ fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
                近期废止警示
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
            <List
              dataSource={abolishedData}
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
                    message="标准废止提醒"
                    description={item.message}
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
                      近期暂无标准废止
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
