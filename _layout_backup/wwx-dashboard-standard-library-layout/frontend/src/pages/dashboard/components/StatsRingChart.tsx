import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { StandardStateStat } from "@/types/dashboard";

interface Props {
  data: StandardStateStat[];
}

const COLOR_MAP: Record<string, string> = {
  现行: "#10b981",
  废止: "#ef4444",
  即将实施: "#f59e0b",
};
const FALLBACK_COLOR = "#6366f1";

export default function StatsRingChart({ data }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const seriesData = data.filter((d) => d.value > 0);
    if (!seriesData.length) return;

    if (!chartRef.current) {
      chartRef.current = echarts.init(elRef.current);
    }

    chartRef.current.setOption(
      {
        tooltip: {
          trigger: "item",
          formatter: (p: { name: string; value: number; percent: number }) =>
            `${p.name}：${p.value.toLocaleString()}（${p.percent}%）`,
        },
        graphic: [],
        series: [
          {
            type: "pie",
            radius: ["52%", "72%"],
            center: ["38%", "50%"],
            avoidLabelOverlap: false,
            label: { show: false },
            labelLine: { show: false },
            itemStyle: {
              borderRadius: 4,
              borderColor: "#fff",
              borderWidth: 2,
            },
            data: seriesData.map((d) => ({
              name: d.state,
              value: d.value,
              itemStyle: { color: COLOR_MAP[d.state] ?? FALLBACK_COLOR },
            })),
          },
        ],
      },
      true,
    );

    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [data]);

  useEffect(
    () => () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    },
    [],
  );

  const total = data.reduce((s, d) => s + d.value, 0);

  const legendItems = [
    { state: "现行", color: "#10b981" },
    { state: "废止", color: "#ef4444" },
    { state: "即将实施", color: "#f59e0b" },
    { state: "其它", color: "#6366f1" },
  ];

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: "20px 20px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>
        状态分布
      </h2>
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* 环形图 */}
        <div ref={elRef} style={{ width: 160, height: 140, flexShrink: 0 }} />

        {/* 图例 */}
        <ul style={{ listStyle: "none", margin: "0 0 0 12px", padding: 0, flex: 1 }}>
          {legendItems.map(({ state, color }) => {
            const item = data.find((d) => d.state === state);
            const val = item?.value ?? 0;
            const pct = total > 0 ? ((val / total) * 100).toFixed(2) : "0.00";
            return (
              <li
                key={state}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, color: "#6b7280" }}>{state}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
