import { Card, Typography, Progress } from "antd";
import type { StandardTypeStat } from "@/types/dashboard";

interface Props {
  data: StandardTypeStat[];
}

/** 按分类名称（实际 API 返回值）配色，同时兼容旧的英文 key */
const TYPE_META: Record<
  string,
  { label: string; gradient: [string, string] }
> = {
  // 中文分类名（后端实际返回）
  方法: { label: "方法", gradient: ["#6366f1", "#4f46e5"] },
  产品: { label: "产品", gradient: ["#10b981", "#059669"] },
  基础: { label: "基础", gradient: ["#f59e0b", "#d97706"] },
  安全: { label: "安全", gradient: ["#ef4444", "#dc2626"] },
  管理: { label: "管理", gradient: ["#3b82f6", "#2563eb"] },
  环保: { label: "环保", gradient: ["#14b8a6", "#0d9488"] },
  卫生: { label: "卫生", gradient: ["#8b5cf6", "#7c3aed"] },
  其他: { label: "其他", gradient: ["#9ca3af", "#6b7280"] },
  其它: { label: "其它", gradient: ["#9ca3af", "#6b7280"] },
  // 英文 key 兼容
  GB: { label: "国家标准", gradient: ["#6366f1", "#4f46e5"] },
  QB: { label: "企业标准", gradient: ["#10b981", "#059669"] },
  HB: { label: "行业标准", gradient: ["#f59e0b", "#d97706"] },
  TB: { label: "团体标准", gradient: ["#3b82f6", "#2563eb"] },
  DB: { label: "地方标准", gradient: ["#14b8a6", "#0d9488"] },
  ISO: { label: "国际标准", gradient: ["#8b5cf6", "#7c3aed"] },
  IOS: { label: "国际标准", gradient: ["#8b5cf6", "#7c3aed"] },
};

/** 动态分配颜色，确保没有匹配到 meta 的分类也有颜色 */
const FALLBACK_COLORS: [string, string][] = [
  ["#6366f1", "#4f46e5"],
  ["#10b981", "#059669"],
  ["#f59e0b", "#d97706"],
  ["#ef4444", "#dc2626"],
  ["#3b82f6", "#2563eb"],
  ["#14b8a6", "#0d9488"],
  ["#8b5cf6", "#7c3aed"],
  ["#f97316", "#ea580c"],
];

export default function StatsPieChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <Card
      title={
        <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
          标准类别分布
        </span>
      }
      style={{
        borderRadius: 16,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        border: "none",
      }}
      styles={{
        header: { borderBottom: "none", padding: "20px 24px 8px" },
        body: {
          padding: "8px 24px 20px",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        },
      }}
    >
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {sorted.map((item, idx) => {
          const meta = TYPE_META[item.type];
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          const [from, to] = meta?.gradient ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

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
    </Card>
  );
}
