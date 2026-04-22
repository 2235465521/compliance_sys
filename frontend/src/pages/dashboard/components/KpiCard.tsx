import { Card, Statistic } from 'antd'
import type { ReactNode } from 'react'

interface KpiCardProps {
  title: string
  value: number
  icon: ReactNode
  gradient: string
}

/**
 * 仪表盘 KPI 数字卡片
 * 渐变背景 + 图标 + Statistic 数字
 */
export default function KpiCard({ title, value, icon, gradient }: KpiCardProps) {
  return (
    <Card
      style={{
        borderRadius: 12,
        border: 'none',
        background: gradient,
        boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        cursor: 'default',
      }}
      styles={{ body: { padding: '20px 24px' } }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow =
          '0 8px 28px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow =
          '0 4px 20px rgba(0,0,0,0.10)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 10,
              letterSpacing: '0.02em',
            }}
          >
            {title}
          </div>
          <Statistic
            value={value}
            valueStyle={{ color: '#fff', fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}
          />
        </div>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </Card>
  )
}
