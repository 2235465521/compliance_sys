import { Card, Typography, Progress } from "antd";
import type { StandardTypeStat } from "@/types/dashboard";

interface Props {
  data: StandardTypeStat[];
}

const TYPE_META: Record<
  string,
  { label: string; color: string; gradient: [string, string] }
> = {
  GB: { label: "国家标准", color: "#005bb5", gradient: ["#005bb5", "#004c99"] }, // Dark classic blue
  QB: { label: "企业标准", color: "#4aa8ff", gradient: ["#4aa8ff", "#2d8eee"] }, // Light bright blue
  HB: { label: "行业标准", color: "#94a3b8", gradient: ["#94a3b8", "#64748b"] }, // Grey-blue
  TB: { label: "团体标准", color: "#c7d2fe", gradient: ["#c7d2fe", "#a5b4fc"] }, // Pale blue
  DB: { label: "地方标准", color: "#bfdbfe", gradient: ["#bfdbfe", "#93c5fd"] }, // Sky light blue
  ISO: {
    label: "国际标准",
    color: "#3b82f6",
    gradient: ["#3b82f6", "#2563eb"],
  },
  IOS: {
    label: "国际标准",
    color: "#3b82f6",
    gradient: ["#3b82f6", "#2563eb"],
  },
};

const DEFAULT_GRADIENT: [string, string] = ["#e2e8f0", "#cbd5e1"];

export default function StatsPieChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <Card
      title={
        <span style={{ fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
          标准类别分布{" "}
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            （std_category）
          </Typography.Text>
        </span>
      }
      style={{
        borderRadius: 16,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 20px -8px rgba(0,0,0,0.05)",
        border: "none",
      }}
      styles={{
        header: { borderBottom: "none", padding: "24px 24px 8px 24px" },
        body: {
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden", // 防止内容撑爆外层
        },
      }}
    >
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {sorted.map((item, idx) => {
          const meta = TYPE_META[item.type];
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          const [from, to] = meta?.gradient ?? DEFAULT_GRADIENT;

          return (
            <div
              key={item.type}
              style={{ marginBottom: idx < sorted.length - 1 ? 24 : 0 }}
            >
              {/* 标题与数据行 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Typography.Text
                  style={{ fontSize: 14, fontWeight: 500, color: "#475569" }}
                >
                  {meta?.label ?? item.type}
                </Typography.Text>
                <Typography.Text style={{ fontSize: 14, color: "#94a3b8", fontVariantNumeric: 'tabular-nums' }}>
                  {item.value.toLocaleString()} ({pct.toFixed(0)}%)
                </Typography.Text>
              </div>

              {/* 进度条 */}
              <Progress
                percent={pct}
                showInfo={false}
                strokeColor={{ from, to, direction: "to right" }}
                trailColor="#f1f5f9"
                strokeWidth={10}
                strokeLinecap="round"
                style={{ margin: 0 }}
              />
            </div>
          );
        })}
      </div>

      {/* 底部装饰区 (修复溢出与文字被遮挡问题) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: 20, // 减小与上方排行榜的间距
          paddingTop: 16,
          borderTop: '1px solid #f1f5f9', // 增加细边框以便视觉上锚定在底部
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", marginRight: 16 }}>
          {["CN", "ISO", "IEC"].map((text, i) => (
            <div
              key={text}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#f0f9ff",
                color: "#1e40af",
                fontSize: text.length > 2 ? 9 : 11, // ISO 字多时略缩小便于显示
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #ffffff",
                marginLeft: i > 0 ? -6 : 0, // 减少左移重叠避免遮挡文字
                zIndex: i, // 🌟 从左往右堆叠变高，确保后面的字不被前面遮住
              }}
            >
              {text}
            </div>
          ))}
        </div>
        <Typography.Text
          type="secondary"
          style={{ fontSize: 12, color: "#64748b" }}
        >
          主表字段 std_category 条数汇总
        </Typography.Text>
      </div>
    </Card>
  );
}
