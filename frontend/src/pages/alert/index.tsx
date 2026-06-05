import { useCallback, useEffect, useState } from 'react'
import { Badge, Card, Tabs, Typography } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { ForwardTab } from '@/pages/alert/components/ForwardTab'
import { MonitorTab } from '@/pages/alert/components/MonitorTab'
import { ReverseTab } from '@/pages/alert/components/ReverseTab'
import { mapMonitorSummaryFromApi } from '@/pages/alert/utils/mapWarningsApi'
import { fetchMonitorSummary } from '@/services/warnings-api'
import type { MonitorSummary } from '@/types/warnings'

const { Title, Text } = Typography

export default function AlertPage() {
  const [activeTab, setActiveTab] = useState('forward-alert')
  const [monitorSummary, setMonitorSummary] = useState<MonitorSummary | null>(null)
  const [monitorSummaryLoading, setMonitorSummaryLoading] = useState(false)
  const [monitorFocusNonce, setMonitorFocusNonce] = useState(0)

  const needAttentionCount = monitorSummary?.needAttentionCount ?? 0

  /** 页头铃铛与监控 Tab 共用一次汇总请求，避免重复打 /monitor/summary/ */
  const refreshMonitorSummary = useCallback(async () => {
    setMonitorSummaryLoading(true)
    try {
      const api = await fetchMonitorSummary()
      setMonitorSummary(mapMonitorSummaryFromApi(api))
    } catch {
      /* 汇总接口未就绪时保持上次数据 */
    } finally {
      setMonitorSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshMonitorSummary()
  }, [refreshMonitorSummary])

  const openMonitorNeedAttention = () => {
    setActiveTab('monitor')
    setMonitorFocusNonce((n) => n + 1)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '20px 28px 40px',
        background:
          'linear-gradient(180deg, #e8f0fe 0%, #f0f5ff 18%, #f5f5f5 45%, #fafafa 100%)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 1600, margin: '0 auto' }}>
        <Card
          bordered={false}
          style={{
            marginBottom: 20,
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.06)',
          }}
          styles={{ body: { padding: 0 } }}
        >
          <div
            style={{
              padding: '22px 24px 20px',
              background: 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 42%, #faf5ff 100%)',
              borderBottom: '1px solid rgba(22, 119, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'linear-gradient(145deg, #1677ff 0%, #4096ff 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 22,
                }}
              >
                <BellOutlined />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <Title level={3} style={{ margin: 0 }}>
                    预警系统
                  </Title>
                  <Badge
                    count={needAttentionCount}
                    overflowCount={99}
                    showZero={false}
                    size="small"
                    offset={[6, -4]}
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={
                        needAttentionCount > 0
                          ? `${needAttentionCount} 个企标需更新，点击查看`
                          : '打开实时监控'
                      }
                      title={
                        needAttentionCount > 0
                          ? `${needAttentionCount} 个企标需更新`
                          : '实时监控'
                      }
                      onClick={openMonitorNeedAttention}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openMonitorNeedAttention()
                        }
                      }}
                      style={{ cursor: 'pointer', color: '#faad14', fontSize: 22 }}
                    >
                      <BellOutlined />
                    </span>
                  </Badge>
                </div>
                <Text type="secondary" style={{ fontSize: 14 }}>
                  正向预警 · 反向预警 · 实时监控
                </Text>
              </div>
            </div>
          </div>
        </Card>

        <Card
          style={{
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
          }}
          styles={{ body: { paddingTop: 12, paddingBottom: 24 } }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            destroyOnHidden
            tabBarStyle={{ marginBottom: 16, fontWeight: 500 }}
            items={[
              { key: 'forward-alert', label: '正向预警', children: <ForwardTab /> },
              { key: 'reverse-alert', label: '反向预警', children: <ReverseTab /> },
              {
                key: 'monitor',
                label: '实时监控',
                children: (
                  <MonitorTab
                    focusNeedAttentionNonce={monitorFocusNonce}
                    summary={monitorSummary}
                    summaryLoading={monitorSummaryLoading}
                    onRefreshSummary={refreshMonitorSummary}
                    onSummaryChange={setMonitorSummary}
                  />
                ),
              },
            ]}
          />
        </Card>
      </div>
    </div>
  )
}
