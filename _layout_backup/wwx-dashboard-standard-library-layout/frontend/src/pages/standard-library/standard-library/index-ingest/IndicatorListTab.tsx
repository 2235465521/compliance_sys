import { Button, Input, Popconfirm, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useState } from 'react'
import { deleteIndicatorItem, getIndicatorList } from '@/services/standard-library'
import type { IndicatorItem } from '@/services/standard-library'
import IndicatorEditDrawer from './IndicatorEditDrawer'

const { Text } = Typography

const PAGE_SIZE = 20

const REVIEW_STATUS_META: Record<string, { label: string; color: string }> = {
  pending:  { label: '待审核', color: 'warning' },
  approved: { label: '已通过', color: 'success' },
  rejected: { label: '已拒绝', color: 'error'   },
}

export default function IndicatorListTab() {
  const [data, setData]         = useState<IndicatorItem[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [filterCode, setFilterCode]   = useState('')
  const [reviewCode, setReviewCode]   = useState<string | null>(null)

  const load = useCallback(async (p: number, code: string) => {
    setLoading(true)
    try {
      const res = await getIndicatorList({ stdCode: code || undefined, page: p, pageSize: PAGE_SIZE })
      setData(res.results)
      setTotal(res.count)
    } catch (e) {
      message.error((e as Error).message || '获取指标列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(page, filterCode) }, [load, page, filterCode])

  const handleSearch = () => {
    setPage(1)
    setFilterCode(searchInput.trim())
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteIndicatorItem(id)
      message.success('已删除')
      void load(page, filterCode)
    } catch (e) {
      message.error((e as Error).message || '删除失败')
    }
  }

  const columns: ColumnsType<IndicatorItem> = [
    {
      title: '国标号',
      dataIndex: 'std_code',
      width: 180,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: '指标条数',
      key: 'indexCount',
      width: 100,
      align: 'right' as const,
      render: (_, r) => (
        <Text style={{ color: '#1677ff', fontWeight: 600 }}>
          {r.indexes?.length ?? 0}
        </Text>
      ),
    },
    {
      title: '审核状态',
      dataIndex: 'manual_review_status',
      width: 120,
      render: (s: string | null) => {
        const key = s ?? 'pending'
        const m = REVIEW_STATUS_META[key] ?? { label: key, color: 'default' }
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    {
      title: '操作',
      key: 'op',
      width: 160,
      render: (_, r) => (
        <Space size="middle">
          <Button type="link" size="small" onClick={() => setReviewCode(r.std_code)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除该指标记录？"
            description="删除后不可恢复。"
            onConfirm={() => void handleDelete(r.id)}
          >
            <Button type="link" danger size="small">删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        {/* 搜索栏 */}
        <Space wrap>
          <Input
            placeholder="按国标号搜索，如 GB 1002"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              if (!e.target.value) {
                setPage(1)
                setFilterCode('')
              }
            }}
            onPressEnter={handleSearch}
            style={{ width: 260 }}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            搜索
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load(page, filterCode)}
            loading={loading}
          >
            刷新
          </Button>
        </Space>

        {/* 指标列表 */}
        <Table<IndicatorItem>
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 600 }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setPage(p),
          }}
          locale={{ emptyText: '暂无指标记录' }}
        />
      </Space>

      {/* 编辑抽屉 */}
      <IndicatorEditDrawer
        open={!!reviewCode}
        stdCode={reviewCode ?? ''}
        onClose={() => {
          setReviewCode(null)
          void load(page, filterCode)
        }}
      />
    </>
  )
}
