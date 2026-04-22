import React, { useState, useEffect } from 'react'
import { Card, Spin, Space } from 'antd'
import { WarningOutlined, InfoCircleFilled } from '@ant-design/icons'
import { fetchStandardList } from '@/services/dashboard'
import type { StandardItem } from '@/types/dashboard'
import dayjs from 'dayjs'

export default function RevocationWarnings() {
  const [data, setData] = useState<StandardItem[]>([])
  const [loading, setLoading] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      // 只查最近30天内废止（bz_release_date 范围）的标准
      const today = dayjs().format('YYYY-MM-DD')
      const thirtyDaysAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD')

      const res = await fetchStandardList({
        page: 1,
        page_size: 20,
        ex_state: '废止',
        // 通过发布日期限定"近期"废止：只要最近30天内废止发布的
        bz_release_date__gte: thirtyDaysAgo,
        bz_release_date__lte: today,
      })
      setData(res.results || [])
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <Card
      style={{
        borderRadius: 16,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 20px -8px rgba(0,0,0,0.05)',
        border: 'none',
      }}
      styles={{
        header: { borderBottom: '1px solid #f1f5f9', padding: '20px 24px' },
        body: { padding: '24px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
      }}
      title={
        <Space>
          <WarningOutlined style={{ color: '#eab308' }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>提醒专区 (近期废止警示)</span>
        </Space>
      }
    >
      <Spin spinning={loading} style={{ height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          {data.length === 0 ? (
            // 截图中的蓝色空状态框
            <div
              style={{
                padding: '20px 24px',
                background: '#eff6ff',
                borderRadius: 10,
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: '#1d4ed8',
              }}
            >
              <InfoCircleFilled style={{ fontSize: 16, color: '#3b82f6', flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>近期暂无标准废止</span>
            </div>
          ) : (
            data.map((item, index) => (
              <div
                key={item.id}
                style={{
                  padding: '14px 16px',
                  marginBottom: index < data.length - 1 ? 10 : 0,
                  background: '#fef2f2',
                  borderRadius: 8,
                  border: '1px solid #fecaca',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>
                  {item.bz_id} {item.bz_name}
                </div>
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  废止日期: {item.bz_release_date || '未知'} · 废止状态已生效
                </div>
              </div>
            ))
          )}
        </div>
      </Spin>
    </Card>
  )
}
