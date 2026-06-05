import { useState } from "react";
import { Card, Input, Tag, Space, message, Table } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { searchStandards } from "@/services/dashboard";
import type { BasicSearchResult } from "@/types/dashboard";

const STATE_COLOR_MAP: Record<string, string> = {
  现行: "success",
  废止: "default",
  即将实施: "warning",
};

/** 快捷查标准（支持标准号/名称模糊检索） */
export default function StandardSearch() {
  const [results, setResults] = useState<BasicSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      message.warning("请输入标准号或关键词");
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const rows = await searchStandards(trimmed);
      setResults(rows);
      if (rows.length === 0) {
        message.info("未找到匹配的标准");
      }
    } catch (e) {
      setResults([]);
      const err = e as Error & { status?: number };
      if (err.status === 404) message.error(err.message || "未找到匹配的标准");
      else if (err.status === 422) message.warning(err.message || "请输入标准号或关键词");
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
      width: 150,
      render: (text: string) => (
        <span style={{ fontWeight: 600, color: "#333", whiteSpace: "nowrap", fontSize: 13 }}>
          {text}
        </span>
      ),
    },
    {
      title: "标准名称",
      dataIndex: "bz_name",
      key: "bz_name",
      render: (text: string) => (
        <span style={{ color: "#333", fontSize: 13, lineHeight: 1.5 }}>
          {text}
        </span>
      ),
    },
    {
      title: "状态",
      dataIndex: "ex_state",
      key: "ex_state",
      width: 72,
      render: (text: string) => (
        <Tag color={STATE_COLOR_MAP[text] || "default"} bordered={false} style={{ fontSize: 12 }}>
          {text}
        </Tag>
      ),
    },
    {
      title: "实施日期",
      dataIndex: "implement_time",
      key: "implement_time",
      width: 100,
      render: (text: string) => (
        <span style={{ fontSize: 12, color: "#111827", fontWeight: 500, whiteSpace: "nowrap" }}>{text}</span>
      ),
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
        placeholder="标准号或名称关键词，如 GB/T 1.1、汽油"
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
          scroll={{ x: "max-content", y: 350 }}
          locale={{
            emptyText: "输入标准号片段或名称关键词后查询",
          }}
        />
      </div>
    </Card>
  );
}
