import React, { useState, useEffect } from 'react'
import { Card, Input, Pagination, Spin, Space } from 'antd'
import { SearchOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { fetchStandardList } from '@/services/dashboard'
import type { StandardItem } from '@/types/dashboard'
import dayjs from 'dayjs'

export default function RealTimeUpdates() {
  const [data, setData] = useState<StandardItem[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  // 计算今天到 30 天后的日期字符串
  const today = dayjs().format('YYYY-MM-DD')
  const in30Days = dayjs().add(30, 'day').format('YYYY-MM-DD')

  const loadData = async (currentPage: number, currentSearch: string) => {
    setLoading(true)
    try {
      const res = await fetchStandardList({
        page: currentPage,
        page_size: 5,
        ex_state: '即将实施',
        search: currentSearch,
        // 把日期范围交给后端过滤，这样 count 才是真实的过滤后总数，分页才准确
        implement_time__gte: today,
        implement_time__lte: in30Days,
      })
      setData(res.results || [])
      setTotal(res.count ?? 0)
    } catch {
      setData([])
      // 翻页出界时不重置 total，保留上次正确的总数
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(page, search)
  }, [page, search])

  const handleSearch = (value: string) => {
    setPage(1)
    setSearch(value)
  }

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
        body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
      }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <ClockCircleOutlined style={{ color: '#3b82f6' }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>实时更新专区 (30天内更新)</span>
          </Space>
          <Input
            placeholder="搜索标准号或名称"
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear
            onPressEnter={(e) => handleSearch(e.currentTarget.value)}
            onChange={(e) => {
              if (e.target.value === '') handleSearch('')
            }}
            style={{ width: 220, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}
          />
        </div>
      }
    >
      <Spin spinning={loading} style={{ height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          {data.length > 0 ? (
            data.map((item, index) => {
              const daysLeft = item.implement_time
                ? dayjs(item.implement_time).diff(dayjs(), 'day')
                : -1
              const isUrgent = daysLeft >= 0 && daysLeft <= 15

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '16px 24px',
                    borderBottom: index < data.length - 1 ? '1px solid #f1f5f9' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      {item.bz_id} {item.bz_name}
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>
                      实施日期: {item.implement_time || '未知'}
                    </div>
                  </div>
                  <div>
                    {daysLeft >= 0 ? (
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 500,
                          background: isUrgent ? '#fff7ed' : '#f0fdf4',
                          color: isUrgent ? '#ea580c' : '#16a34a',
                          border: `1px solid ${isUrgent ? '#ffedd5' : '#dcfce3'}`,
                        }}
                      >
                        仅剩 {daysLeft} 天
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 500,
                          background: '#f1f5f9',
                          color: '#64748b',
                        }}
                      >
                        已实施
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              近期 30 天内暂无即将实施的标准
            </div>
          )}
        </div>
      </Spin>

      {/* 只有当 total > 0 时才显示分页 */}
      {total > 0 && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center' }}>
          <Pagination
            current={page}
            total={total}
            pageSize={5}
            onChange={(p) => setPage(p)}
            showSizeChanger={false}
            showQuickJumper
          />
        </div>
      )}
    </Card>
  )
}
