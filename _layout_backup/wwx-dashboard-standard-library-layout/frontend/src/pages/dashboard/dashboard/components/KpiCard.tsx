import { Statistic } from "antd";
import type { ReactNode } from "react";

interface KpiCardProps {
  title: string;
  value: number;
  icon: ReactNode;
  borderColor: string;
  iconBg: string;
  iconColor: string;
  subtitle?: string;
  subtitleColor?: string;
}

export default function KpiCard({
  title,
  value,
  icon,
  borderColor,
  iconBg,
  iconColor,
  subtitle,
  subtitleColor = "#94a3b8",
}: KpiCardProps) {
  return (
    <div
      style={{
        background: iconBg,
        borderRadius: 16,
        borderLeft: `4px solid ${borderColor}`,
        padding: "20px 20px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
        cursor: "default",
        height: "100%",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.1)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow =
          "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* 顶部：标题 + 图标 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#6b7280" }}>
          {title}
        </span>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            color: iconColor,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>

      {/* 底部：数字 + 副标题 */}
      <div style={{ marginTop: 16 }}>
        <Statistic
          value={value}
          valueStyle={{
            fontSize: 32,
            fontWeight: 700,
            color: "#111827",
            lineHeight: 1.1,
          }}
        />
        {subtitle && (
          <div style={{ fontSize: 12, color: subtitleColor, marginTop: 6 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
