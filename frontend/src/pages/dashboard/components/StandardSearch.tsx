import { useState } from "react";
import { Card, Input, Tag, Space, message, Table } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { fetchDashboardQuickLookup } from "@/services/dashboard";
import type { BasicSearchResult } from "@/types/dashboard";

const STATE_COLOR_MAP: Record<string, string> = {
  现行: "success",
  废止: "default",
  即将实施: "warning",
};

/** 快捷查标准（按标准号精确查询 dashboard quick-lookup） */
export default function StandardSearch() {
  const [results, setResults] = useState<BasicSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      message.warning("请输入标准号");
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const row = await fetchDashboardQuickLookup(trimmed);
      setResults([row]);
    } catch (e) {
      setResults([]);
      const err = e as Error & { status?: number };
      if (err.status === 404) message.error(err.message || "未找到该标准");
      else if (err.status === 422) message.warning(err.message || "请输入标准号");
      else message.error(err.message || "查询失败");
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: "标准号",
      dataIndex: "bz_id",
      key: "bz_id",
      width: 160,
      render: (text: string) => (
        <span style={{ fontWeight: 600, color: "#333", whiteSpace: "nowrap" }}>
          {text}
        </span>
      ),
    },
    {
      title: "标准名称",
      dataIndex: "bz_name",
      key: "bz_name",
      minWidth: 220,
      render: (text: string) => (
        <span
          style={{
            color: "#64748b",
            display: "block",
            whiteSpace: "normal",
            wordBreak: "break-word",
            lineHeight: 1.55,
          }}
        >
          {text}
        </span>
      ),
    },
    {
      title: "执行状态",
      dataIndex: "ex_state",
      key: "ex_state",
      render: (text: string) => (
        <Tag color={STATE_COLOR_MAP[text] || "default"} bordered={false}>
          {text}
        </Tag>
      ),
    },
    {
      title: "发布时间",
      dataIndex: "release_date",
      key: "release_date",
    },
    {
      title: "实施时间",
      dataIndex: "implement_time",
      key: "implement_time",
      width: 120,
    },
  ];

  return (
    <Card
      title={
        <Space>
          <SearchOutlined style={{ color: "#1890ff" }} />
          <span>快捷查标准</span>
        </Space>
      }
      style={{
        borderRadius: 12,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
      styles={{
        header: { fontWeight: 600 },
        body: {
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: "20px",
        },
      }}
    >
      <Input.Search
        placeholder="请输入完整标准号，例如 GB/T 1.1-2020"
        allowClear
        enterButton="查询"
        size="large"
        onSearch={handleSearch}
        loading={loading}
        style={{ marginBottom: 16 }}
      />

      <div
        style={{ flex: 1, overflowY: "hidden" }}
        className="standard-search-table-container"
      >
        <Table
          columns={columns}
          dataSource={results}
          rowKey={(r) => String(r.bz_id)}
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ y: 350 }}
          locale={{
            emptyText: "输入完整标准号后点击查询",
          }}
        />
      </div>
    </Card>
  );
}
