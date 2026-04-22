import { Card } from "antd";
import { Pie } from "@ant-design/charts";
import type { StandardStateStat } from "@/types/dashboard";

interface Props {
  data: StandardStateStat[];
}

const STATE_COLOR_MAP: Record<string, string> = {
  现行: "#48bb78",
  废止: "#fc8181",
  即将实施: "#f6c90e",
};

/** 执行状态分布 — 环形图 */
export default function StatsDonutChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const chartData = data.map((d) => ({ type: d.state, value: d.value }));

  const config = {
    appendPadding: 10,
    data: chartData,
    angleField: "value",
    colorField: "type",
    radius: 0.82,
    innerRadius: 0.62,
    color: chartData.map((d) => STATE_COLOR_MAP[d.type] ?? "#a0aec0"),
    label: {
      type: "inner" as const,
      offset: "-30%",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: (datum: any) => `${(datum.percent * 100).toFixed(1)}%`,
      style: {
        fill: "#4b1fc2ff",
        fontSize: 12,
        fontWeight: 600,
        textShadow: "0 1px 2px rgba(33, 45, 151, 0.3)",
      },
    },
    statistic: {
      title: {
        content: "标准总量",
        style: { fontSize: "14px", color: "#8c8c8c", fontWeight: 400 },
      },
      content: {
        content: total.toLocaleString(),
        style: {
          fontSize: "26px",
          fontWeight: "700",
          color: "#262626",
        },
      },
    },
    legend: {
      position: "bottom" as const,
      itemName: { style: { fontSize: 12 } },
    },
    interactions: [
      { type: "element-selected" },
      { type: "element-active" },
      { type: "pie-statistic-active" },
    ],
    tooltip: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (datum: any) => ({
        name: datum.type,
        value: `${datum.value} 项`,
      }),
    },
  };

  return (
    <Card
      title="执行状态分布"
      style={{ borderRadius: 12, height: "100%" }}
      styles={{ header: { fontWeight: 600 } }}
    >
      <Pie {...config} height={300} />
    </Card>
  );
}
