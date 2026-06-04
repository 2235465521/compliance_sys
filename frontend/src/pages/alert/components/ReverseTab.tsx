import { useState } from 'react'
import { App, Button, Empty, Input, Space, Spin, Tag, Typography } from 'antd'
import { SearchOutlined, WarningOutlined } from '@ant-design/icons'
import { WarningTaskConclusionBanner } from '@/pages/alert/components/WarningTaskConclusionBanner'
import { ReverseSearchEmptyGraphic } from '@/pages/alert/components/alertGraphics'
import { mapReverseWarningFromApi } from '@/pages/alert/utils/mapWarningsApi'
import { fetchReverseWarning, WarningsApiError } from '@/services/warnings-api'
import type { ReverseWarningResult } from '@/types/warnings'

const { Text } = Typography

export function ReverseTab() {
  const { message } = App.useApp()
  const [bzId, setBzId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReverseWarningResult | null>(null)

  const search = async () => {
    const term = bzId.trim()
    if (!term) {
      message.warning('请输入国标编号')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const api = await fetchReverseWarning(term)
      setResult(mapReverseWarningFromApi(api, term))
    } catch (e) {
      message.error(e instanceof WarningsApiError ? e.message : '反向预警查询失败')
    } finally {
      setLoading(false)
    }
  }

  const panelStyle = {
    background: '#fff',
    borderRadius: 20,
    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
    padding: '28px 28px 24px',
    border: '1px solid rgba(15, 23, 42, 0.06)',
  } as const

  return (
    <div style={{ marginTop: 4 }}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Input
            size="large"
            placeholder="请输入国标编号，例如：GB/T 9989.3-2015"
            value={bzId}
            onChange={(e) => setBzId(e.target.value)}
            onPressEnter={() => void search()}
            prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
            style={{ flex: '1 1 280px', borderRadius: 999 }}
          />
          <Button
            type="primary"
            size="large"
            loading={loading}
            onClick={() => void search()}
            style={{ minWidth: 168, height: 46, borderRadius: 999 }}
          >
            查询关联企标
          </Button>
        </div>

        <div
          style={{
            marginTop: 22,
            background: '#f0f2f5',
            borderRadius: 16,
            padding: loading || result ? 20 : '40px 24px',
            minHeight: 320,
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>正在分析…</div>
            </div>
          ) : !result ? (
            <div style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
              <ReverseSearchEmptyGraphic />
              <div style={{ fontSize: 17, fontWeight: 700 }}>暂无查询结果</div>
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                输入国标号，检索合规/批量评价中引用该国标的企标并判断是否要修改
              </Text>
            </div>
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <WarningTaskConclusionBanner
                taskConclusion={result.taskConclusion}
                taskSummary={result.taskSummary}
              />

              <div
                style={{
                  border: '1px solid #ffd591',
                  background: '#fff7e6',
                  borderRadius: 8,
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <WarningOutlined style={{ fontSize: 20, color: '#d46b08' }} />
                  <Text strong style={{ color: '#d46b08' }}>
                    国标查新结果
                  </Text>
                  {result.gbNovelty.gbUpdated ? (
                    <Tag color="orange">已更新</Tag>
                  ) : (
                    <Tag color="green">无更新</Tag>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      查询标准
                    </Text>
                    <div>
                      <Text strong>{result.gbNovelty.inputBz}</Text>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      最新标准
                    </Text>
                    <div>
                      <Text strong style={{ color: '#722ed1' }}>
                        {result.gbNovelty.latestBz}
                      </Text>
                    </div>
                  </div>
                  {result.gbNovelty.statusLabel ? (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        状态
                      </Text>
                      <div>{result.gbNovelty.statusLabel}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <Text strong>涉及企标更替信息</Text>
              {result.enterprises.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无关联企标" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {result.enterprises.map((ent) => (
                    <div
                      key={ent.qbCode}
                      style={{
                        border: ent.needModify ? '1px solid #ffa39e' : '1px solid #bae7ff',
                        background: ent.needModify ? '#fff1f0' : '#e6f7ff',
                        borderRadius: 8,
                        padding: '14px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <Text strong style={{ fontSize: 15 }}>
                          {ent.qbCode}
                        </Text>
                        <Tag color={ent.needModify ? 'error' : 'success'}>{ent.conclusionLabel}</Tag>
                      </div>
                      {ent.enterpriseName ? (
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          {ent.enterpriseName}
                        </Text>
                      ) : null}
                      {ent.summary ? (
                        <Text style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
                          {ent.summary}
                        </Text>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Space>
          )}
        </div>
      </div>
    </div>
  )
}
