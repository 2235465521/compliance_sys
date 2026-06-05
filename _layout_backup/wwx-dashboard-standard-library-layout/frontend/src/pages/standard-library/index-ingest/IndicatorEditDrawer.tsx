import {
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
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { getIndexReview, submitIndexReview } from '@/services/standard-library'
import type { IndexItem } from '@/services/standard-library'

const { Text } = Typography

type EditItem = IndexItem & { _id: number }

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
}

export default function IndicatorEditDrawer({ open, stdCode, onClose }: Props) {
  const [loading, setLoading]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [items, setItems]         = useState<EditItem[]>([])
  const [savedStatus, setSavedStatus] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<EditItem | null>(null)
  const [editForm] = Form.useForm<{
    index_name: string
    index_type: string
    index_content_json: string
  }>()

  useEffect(() => {
    if (!open || !stdCode) return
    setLoading(true)
    setItems([])
    getIndexReview(stdCode)
      .then((res) => {
        setItems(res.indexes.map((it, i) => ({ ...it, _id: i })))
        setSavedStatus(res.manualReviewStatus ?? null)
      })
      .catch((e: Error) => message.error(e.message || '加载指标数据失败'))
      .finally(() => setLoading(false))
  }, [open, stdCode])

  const openEdit = (item: EditItem) => {
    setEditTarget(item)
    editForm.setFieldsValue({
      index_name: item.index_name,
      index_type: item.index_type,
      index_content_json: JSON.stringify(item.index_content, null, 2),
    })
  }

  const saveEdit = () => {
    editForm.validateFields().then((vals) => {
      let content: Record<string, unknown>
      try {
        content = JSON.parse(vals.index_content_json)
      } catch {
        message.error('index_content 不是合法 JSON，请检查格式')
        return
      }
      setItems((prev) =>
        prev.map((it) =>
          it._id === editTarget!._id
            ? { ...it, index_name: vals.index_name, index_type: vals.index_type, index_content: content }
            : it,
        ),
      )
      setEditTarget(null)
    })
  }

  const handleDelete = (id: number) => {
    setItems((prev) => prev.filter((it) => it._id !== id))
  }

  const handleSave = async () => {
    const toSave = items.map(({ _id: _i, ...rest }) => rest as IndexItem)
    setSubmitting(true)
    try {
      await submitIndexReview(stdCode, {
        indexes: toSave,
        manualReviewStatus: (savedStatus as 'approved' | 'rejected') ?? 'approved',
      })
      message.success('保存成功')
      onClose()
    } catch (e) {
      message.error((e as Error).message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnsType<EditItem> = [
    {
      title: '指标名称',
      dataIndex: 'index_name',
      width: 200,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '类型',
      dataIndex: 'index_type',
      width: 90,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '指标内容',
      dataIndex: 'index_content',
      render: (content: Record<string, unknown>) => renderContent(content),
    },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            title="编辑"
            onClick={() => openEdit(record)}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            title="删除"
            onClick={() => handleDelete(record._id)}
          />
        </Space>
      ),
    },
  ]

  return (
    <>
      <Drawer
        title={`编辑指标 · ${stdCode}`}
        width={800}
        open={open}
        onClose={onClose}
        destroyOnClose
        extra={
          <Button
            type="primary"
            loading={submitting}
            disabled={loading}
            onClick={handleSave}
          >
            确认保存
          </Button>
        }
      >
        <Spin spinning={loading}>
          <Table<EditItem>
            rowKey="_id"
            columns={columns}
            dataSource={items}
            pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
            size="small"
            scroll={{ x: 700 }}
            locale={{ emptyText: '暂无指标数据' }}
          />
        </Spin>
      </Drawer>

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
