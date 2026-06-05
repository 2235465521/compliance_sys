import { Card } from 'antd'
import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import type { StandardStateStat } from '@/types/dashboard'

interface Props {
  data: StandardStateStat[]
}

const STATE_COLOR_MAP: Record<string, string> = {
  现行: '#48bb78',
  废止: '#fc8181',
  即将实施: '#f6c90e',
}

/** 执行状态分布 — 环形图（ECharts，避免额外依赖 @ant-design/charts） */
export default function StatsDonutChart({ data }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const chart = echarts.init(el)
    const total = data.reduce((sum, d) => sum + d.value, 0)
    const legendFormatter = (name: string) => {
      const item = data.find((d) => d.state === name)
      if (!item) return name
      const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'
      return `${name}  ${item.value.toLocaleString()}（${pct}%）`
    }
    chart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} 项 ({d}%)' },
      legend: { bottom: 0, textStyle: { fontSize: 12 }, formatter: legendFormatter },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '46%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: { show: false },
          data: data.map((d) => ({
            name: d.state,
            value: d.value,
            itemStyle: { color: STATE_COLOR_MAP[d.state] ?? '#a0aec0' },
          })),
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: '38%',
          style: {
            text: '标准总量',
            fill: '#8c8c8c',
            fontSize: 14,
            fontWeight: 400,
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '46%',
          style: {
            text: total.toLocaleString(),
            fill: '#262626',
            fontSize: 26,
            fontWeight: 700,
          },
        },
      ],
    })
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
    }
  }, [data])

  return (
    <Card title="执行状态分布" style={{ borderRadius: 12, height: '100%' }} styles={{ header: { fontWeight: 600 } }}>
      <div ref={hostRef} style={{ height: 300 }} />
    </Card>
  )
}
