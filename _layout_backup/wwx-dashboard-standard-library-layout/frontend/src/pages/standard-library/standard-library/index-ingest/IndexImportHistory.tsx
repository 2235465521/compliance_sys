import {
  Button,
  Input,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AuditOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useState } from 'react'
import { getIndexImportHistory } from '@/services/standard-library'
import type { IndexImportHistoryItem } from '@/services/standard-library'
import IndexReviewDrawer from './IndexReviewDrawer'

const { Text } = Typography

/** 兼容 camelCase 和 snake_case，统一映射到 camelCase */
function normalizeItem(raw: Record<string, unknown>): IndexImportHistoryItem {
  const g = (a: string, b: string) => raw[a] ?? raw[b]
  return {
    id: raw.id as number,
    stdCode: (g('stdCode', 'std_code') ?? '') as string,
    originalFilename: (g('originalFilename', 'original_filename') ?? '') as string,
    importStatus: (g('importStatus', 'import_status') ?? '') as string,
    indexesCount: (g('indexesCount', 'indexes_count') ?? 0) as number,
    manualReviewStatus: (g('manualReviewStatus', 'manual_review_status') ?? null) as string | null,
    errorMessage: (g('errorMessage', 'error_message') ?? null) as string | null,
    createdAt: (g('createdAt', 'created_at') ?? '') as string,
    updatedAt: (g('updatedAt', 'updated_at') ?? '') as string,
  }
}

const IMPORT_STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: '已完成', color: 'success' },
  failed:    { label: '失败',   color: 'error'   },
  skipped:   { label: '已跳过', color: 'orange'  },
}

const REVIEW_STATUS_META: Record<string, { label: string; color: string }> = {
  pending:  { label: '待审核', color: 'warning' },
  approved: { label: '已通过', color: 'success' },
  rejected: { label: '已去除', color: 'default' },
}

const PAGE_SIZE = 20

export default function IndexImportHistory() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<IndexImportHistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterCode, setFilterCode] = useState('')
  const [searchInput, setSearchInput] = useState('')

  /** 审核抽屉 */
  const [reviewStdCode, setReviewStdCode] = useState<string | null>(null)

  const load = useCallback(
    async (p: number, code: string) => {
      setLoading(true)
      try {
        const res = await getIndexImportHistory({
          page: p,
          pageSize: PAGE_SIZE,
          stdCode: code || undefined,
        })
        setData((res.results as unknown as Record<string, unknown>[]).map(normalizeItem))
        setTotal(res.count)
      } catch (e) {
        message.error((e as Error).message || '加载历史记录失败')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void load(page, filterCode)
  }, [load, page, filterCode])

  const handleSearch = () => {
    setPage(1)
    setFilterCode(searchInput.trim())
  }

  const handleReset = () => {
    setSearchInput('')
    setPage(1)
    setFilterCode('')
  }

  const columns: ColumnsType<IndexImportHistoryItem> = [
    {
      title: '国标号',
      dataIndex: 'stdCode',
      width: 160,
      render: (text: string) => <Text strong>{text || '—'}</Text>,
    },
    {
      title: '原始文件名',
      dataIndex: 'originalFilename',
      ellipsis: true,
      render: (text: string) => <Text type="secondary" style={{ fontSize: 13 }}>{text}</Text>,
    },
    {
      title: '入库状态',
      dataIndex: 'importStatus',
      width: 100,
      render: (s: string) => {
        const m = IMPORT_STATUS_META[s] ?? { label: s, color: 'default' }
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    {
      title: '指标数',
      dataIndex: 'indexesCount',
      width: 80,
      align: 'right' as const,
      render: (n: number) => (
        <span style={{ fontWeight: 600, color: '#1677ff' }}>{n}</span>
      ),
    },
    {
      title: '审核状态',
      dataIndex: 'manualReviewStatus',
      width: 100,
      render: (s: string | null) => {
        if (!s) return <Tag color="default">—</Tag>
        const m = REVIEW_STATUS_META[s] ?? { label: s, color: 'default' }
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    {
      title: '入库时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => (
        <Text style={{ fontSize: 13, color: '#6b7280' }}>{t}</Text>
      ),
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      ellipsis: true,
      render: (msg: string | null) =>
        msg ? (
          <Text type="danger" ellipsis={{ tooltip: msg }} style={{ fontSize: 12 }}>
            {msg}
          </Text>
        ) : (
          '—'
        ),
    },
    {
      title: '操作',
      width: 110,
      render: (_, r) => {
        if (r.importStatus !== 'completed' || !r.stdCode) return null
        return (
          <Button
            size="small"
            type="link"
            icon={<AuditOutlined />}
            onClick={() => setReviewStdCode(r.stdCode)}
          >
            {r.manualReviewStatus === 'pending' ? '去审核' : '查看审核'}
          </Button>
        )
      },
    },
  ]

  return (
    <>
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Input
          placeholder="按国标号筛选，例如 GB 1002-2024"
          allowClear
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 280 }}
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
        />
        <Button type="primary" onClick={handleSearch}>
          搜索
        </Button>
        <Button onClick={handleReset}>重置</Button>
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void load(page, filterCode)}
          style={{ marginLeft: 'auto' }}
        >
          刷新
        </Button>
      </div>

      <Table<IndexImportHistoryItem>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => setPage(p),
          showSizeChanger: false,
        }}
        locale={{ emptyText: '暂无入库历史' }}
      />

      <IndexReviewDrawer
        open={!!reviewStdCode}
        stdCode={reviewStdCode ?? ''}
        onClose={() => {
          setReviewStdCode(null)
          void load(page, filterCode)
        }}
      />
    </>
  )
}
