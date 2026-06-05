import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import {
  getIndexReview,
  submitIndexReview,
} from '@/services/standard-library'
import type { IndexItem } from '@/services/standard-library'

const { Text } = Typography

type ReviewItem = IndexItem & { _id: number; _removed?: boolean }

/** 递归展示 index_content 的 key-value */
function renderContent(val: unknown, depth = 0): React.ReactNode {
  if (val === null || val === undefined) return <span style={{ color: '#9ca3af' }}>—</span>
  if (typeof val !== 'object') return <span>{String(val)}</span>
  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      {Object.entries(val as Record<string, unknown>).map(([k, v]) => (
        <div key={k} style={{ lineHeight: 1.8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{k}：</Text>
          {typeof v === 'object' && v !== null
            ? renderContent(v, depth + 1)
            : <span style={{ fontSize: 13 }}>{String(v)}</span>}
        </div>
      ))}
    </div>
  )
}

interface Props {
  open: boolean
  stdCode: string
  onClose: () => void
  /** 审核成功提交后回调，传入最终状态 */
  onReviewed?: (stdCode: string, status: 'approved' | 'rejected') => void
}

export default function IndexReviewDrawer({ open, stdCode, onClose, onReviewed }: Props) {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [indexes, setIndexes] = useState<ReviewItem[]>([])
  const [reviewStatus, setReviewStatus] = useState<string | null>(null)

  /** 编辑弹窗 */
  const [editTarget, setEditTarget] = useState<ReviewItem | null>(null)
  const [editForm] = Form.useForm<{ index_name: string; index_type: string; index_content_json: string }>()

  /* 打开时拉数据 */
  useEffect(() => {
    if (!open || !stdCode) return
    setLoading(true)
    setIndexes([])
    setReviewStatus(null)
    getIndexReview(stdCode)
      .then((res) => {
        setIndexes(res.indexes.map((item, i) => ({ ...item, _id: i })))
        setReviewStatus(res.manualReviewStatus ?? null)
      })
      .catch((e: Error) => message.error(e.message || '加载审核数据失败'))
      .finally(() => setLoading(false))
  }, [open, stdCode])

  /* 标记去除 */
  const markRemoved = (id: number) =>
    setIndexes((prev) => prev.map((it) => it._id === id ? { ...it, _removed: true } : it))

  /* 取消去除 */
  const unmarkRemoved = (id: number) =>
    setIndexes((prev) => prev.map((it) => it._id === id ? { ...it, _removed: false } : it))

  /* 打开编辑 */
  const openEdit = (item: ReviewItem) => {
    setEditTarget(item)
    editForm.setFieldsValue({
      index_name: item.index_name,
      index_type: item.index_type,
      index_content_json: JSON.stringify(item.index_content, null, 2),
    })
  }

  /* 保存编辑 */
  const saveEdit = () => {
    editForm.validateFields().then((vals) => {
      let content: Record<string, unknown>
      try {
        content = JSON.parse(vals.index_content_json)
      } catch {
        message.error('index_content 不是合法 JSON，请检查格式')
        return
      }
      setIndexes((prev) =>
        prev.map((it) =>
          it._id === editTarget!._id
            ? { ...it, index_name: vals.index_name, index_type: vals.index_type, index_content: content }
            : it,
        ),
      )
      setEditTarget(null)
    })
  }

  /* 一键通过 */
  const handleApprove = async () => {
    const toSave = indexes
      .filter((it) => !it._removed)
      .map(({ _id: _i, _removed: _r, ...rest }) => rest as IndexItem)
    setSubmitting(true)
    try {
      await submitIndexReview(stdCode, { indexes: toSave, manualReviewStatus: 'approved' })
      message.success('审核完成，已保存')
      onReviewed?.(stdCode, 'approved')
      onClose()
    } catch (e) {
      message.error((e as Error).message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  /* 一键去除 */
  const handleReject = async () => {
    Modal.confirm({
      title: '确认一键去除？',
      content: '将以空数组提交，状态置为 rejected，该标准所有指标将被清除。',
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setSubmitting(true)
        try {
          await submitIndexReview(stdCode, { indexes: [], manualReviewStatus: 'rejected' })
          message.success('审核完成，已保存')
          onReviewed?.(stdCode, 'rejected')
          onClose()
        } catch (e) {
          message.error((e as Error).message || '提交失败')
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  const columns: ColumnsType<ReviewItem> = [
    {
      title: '指标名称',
      dataIndex: 'index_name',
      width: 200,
      render: (text: string, record) =>
        record._removed
          ? <Text delete type="secondary">{text}</Text>
          : <Text strong>{text}</Text>,
    },
    {
      title: '类型',
      dataIndex: 'index_type',
      width: 90,
      render: (text: string, record) =>
        record._removed
          ? <Tag color="default" style={{ textDecoration: 'line-through', opacity: 0.5 }}>{text}</Tag>
          : <Tag color="blue">{text}</Tag>,
    },
    {
      title: '指标内容',
      dataIndex: 'index_content',
      render: (content: Record<string, unknown>, record) =>
        record._removed
          ? <span style={{ color: '#d1d5db', fontSize: 12 }}>已去除</span>
          : renderContent(content),
    },
    {
      title: '操作',
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          {record._removed ? (
            <Button
              size="small"
              onClick={() => unmarkRemoved(record._id)}
            >
              撤销
            </Button>
          ) : (
            <>
              <Button
                size="small"
                type="text"
                icon={<CheckOutlined />}
                style={{ color: '#10b981' }}
                title="通过"
              />
              <Button
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                danger
                title="去除"
                onClick={() => markRemoved(record._id)}
              />
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                title="编辑"
                onClick={() => openEdit(record)}
              />
            </>
          )}
        </Space>
      ),
    },
  ]

  const keptCount = indexes.filter((it) => !it._removed).length

  return (
    <>
      <Drawer
        title={`指标审核 · ${stdCode}`}
        width={800}
        open={open}
        onClose={onClose}
        destroyOnClose
        extra={
          <Space>
            <Button
              danger
              onClick={handleReject}
              loading={submitting}
              disabled={loading}
            >
              一键去除
            </Button>
            <Button
              type="primary"
              onClick={handleApprove}
              loading={submitting}
              disabled={loading}
            >
              一键通过（保留 {keptCount} 条）
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading}>
          {reviewStatus === 'approved' && (
            <Alert
              type="success"
              showIcon
              message="该标准已通过审核"
              style={{ marginBottom: 16 }}
            />
          )}
          {reviewStatus === 'rejected' && (
            <Alert
              type="error"
              showIcon
              message="该标准已被标记为去除"
              style={{ marginBottom: 16 }}
            />
          )}

          <Table<ReviewItem>
            rowKey="_id"
            columns={columns}
            dataSource={indexes}
            pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
            size="small"
            scroll={{ x: 700 }}
            rowClassName={(r) => r._removed ? 'index-review-row-removed' : ''}
            locale={{ emptyText: '暂无指标数据' }}
          />
        </Spin>
      </Drawer>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑指标"
        open={!!editTarget}
        onOk={saveEdit}
        onCancel={() => setEditTarget(null)}
        okText="保存"
        cancelText="取消"
        width={520}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="index_name"
            label="指标名称"
            rules={[{ required: true, message: '请输入指标名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="index_type" label="指标类型">
            <Select
              options={[
                { value: '具体值', label: '具体值' },
                { value: '引用值', label: '引用值' },
                { value: '其他', label: '其他' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="index_content_json"
            label="指标内容（JSON）"
            rules={[{ required: true, message: '请输入 JSON' }]}
          >
            <Input.TextArea rows={6} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
