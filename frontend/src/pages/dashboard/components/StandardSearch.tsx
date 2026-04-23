import { useState, useEffect } from "react";
import { Card, Input, Tag, Space, Button, message, Table } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { searchStandards } from "@/services/dashboard";
// 注意：如果你的 BasicSearchResult 类型没有 release_date 和 implement_time，
// 记得去 '@/types/dashboard' 里补上这两个字段哦！
import type { BasicSearchResult } from "@/types/dashboard";

const STATE_COLOR_MAP: Record<string, string> = {
  现行: "success",
  废止: "default", // 废止通常用灰色
  即将实施: "warning",
};

/** 快捷查标准组件 */
export default function StandardSearch() {
  const [results, setResults] = useState<BasicSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (value: string) => {
    const trimmed = value.trim();
    // 如果想要为空时不查询，可以加上这个判断；或者后端支持空查全表
    // if (!trimmed) return setResults([]);

    setLoading(true);
    try {
      const data = await searchStandards(trimmed);
      setResults(data);
    } catch (error) {
      message.error("获取标准数据失败");
    } finally {
      setLoading(false);
    }
  };

  // 🌟 核心修复 1：组件挂载时，默认搜一个宽泛的词（如 'GB'），让表格一上来就有数据！
  useEffect(() => {
    handleSearch("GB");
  }, []);

  const handleDownload = (bz_id: string) => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
    window.open(
      `${baseUrl}/standards/download-doc/?bz_id=${encodeURIComponent(bz_id)}`,
      "_blank",
    );
    message.success(`正在准备下载标准：${bz_id}`);
  };

  // 🌟 核心修复 2：配置与截图完全一致的 Table 表头列
  const columns = [
    {
      title: "标准号",
      dataIndex: "bz_id",
      key: "bz_id",
      width: 160, // 👈 给定足够宽度，强行撑开
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
      ellipsis: true, // 名称过长自动省略号
      render: (text: string) => (
        <span style={{ color: "#64748b" }}>{text}</span>
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
    },
    {
      title: "操作",
      key: "action",
      render: (_: any, record: BasicSearchResult) => (
        <Button
          type="link"
          size="small"
          onClick={() => handleDownload(record.bz_id)}
          style={{ padding: 0 }}
        >
          下载文本
        </Button>
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
        placeholder="请输入标准号或标准名称模糊查询..."
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
        {/* 🌟 使用标准的 Table 组件，并简化 Pagination 配置以适应极窄卡片 */}
        <Table
          columns={columns}
          dataSource={results}
          rowKey="bz_id"
          loading={loading}
          size="small"
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: false, // 🌟 核心修复：关闭多余部件，强行减少宽度！
            showQuickJumper: false, // 🌟 核心修复：关闭多余部件，强行减少宽度！
            showLessItems: true, // 🌟 核心修复：减少显示的页码数量，防止在第4/5页时撑爆导致折行
            showTotal: (total) => `共 ${total} 条`,
            position: ["bottomCenter"], // 🌟 核心修复：居中对齐能让两端变化平缓，消除剧烈跳变感
          }}
          scroll={{ y: 350 }} // 开启内部滚动，防止撑爆卡片高度
          locale={{ emptyText: "请输入标准号进行检索" }}
        />
      </div>
    </Card>
  );
}
