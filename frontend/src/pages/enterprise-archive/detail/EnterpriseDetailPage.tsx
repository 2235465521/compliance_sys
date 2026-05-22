import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Descriptions, Drawer, Empty, Form, Input, Select, Space, Tag, Typography } from 'antd'
import { useCallback, useState } from 'react'
import dayjs from 'dayjs'
import { useNavigate, useParams } from 'react-router-dom'
import QibiaoEditorCard from '@/pages/enterprise-archive/components/QibiaoEditorCard'
import { appendEmptyQibiao, deleteEnterprise, removeQibiaoItem, updateEnterprise } from '@/services/enterprise-archive'
import { useEnterpriseArchiveStore } from '@/stores/enterprise-archive'
import type { EnterpriseStatus } from '@/types/enterprise-archive'

const STATUS_OPTIONS: { value: EnterpriseStatus; label: string }[] = [
  { value: 'active', label: '在营' },
  { value: 'inactive', label: '停用' },
  { value: 'suspending', label: '暂停' },
]

const STATUS_TAG: Record<EnterpriseStatus, { text: string; color: 'success' | 'default' | 'warning' }> = {
  active: { text: '在营', color: 'success' },
  inactive: { text: '停用', color: 'default' },
  suspending: { text: '暂停', color: 'warning' },
}

export default function EnterpriseDetailPage() {
  const { enterpriseId } = useParams<{ enterpriseId: string }>()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const [editOpen, setEditOpen] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)

  const enterprise = useEnterpriseArchiveStore(
    useCallback(
      (s) => (enterpriseId ? s.enterprises.find((e) => e.id === enterpriseId) : undefined),
      [enterpriseId],
    ),
  )

  const onEditOpen = () => {
    if (!enterprise) return
    form.setFieldsValue({
      name: enterprise.name,
      creditCode: enterprise.creditCode,
      status: enterprise.status,
      address: enterprise.address,
      contactName: enterprise.contactName,
      contactPhone: enterprise.contactPhone,
      contactEmail: enterprise.contactEmail,
      remark: enterprise.remark,
    })
    setEditOpen(true)
  }

  const onSave = async () => {
    if (!enterpriseId) return
    const v = await form.validateFields()
    setSaving(true)
    try {
      await updateEnterprise(enterpriseId, v)
      message.success('已保存（演示）')
      setEditOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const onDelete = () => {
    if (!enterpriseId) return
    modal.confirm({
      title: '确认删除该企业的演示档案？',
      content: '此操作为 Mock，真实环境以接口权限与业务规则为准，删除后不可从后端恢复。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await deleteEnterprise(enterpriseId)
        message.success('已删除（演示）')
        navigate('/enterprise-archive')
      },
    })
  }

  const onAddQibiao = async () => {
    if (!enterpriseId) return
    setAdding(true)
    try {
      await appendEmptyQibiao(enterpriseId)
      message.success('已添加企标（演示）')
    } finally {
      setAdding(false)
    }
  }

  const onRemoveQibiao = async (qibiaoId: string) => {
    if (!enterpriseId) return
    await removeQibiaoItem(enterpriseId, qibiaoId)
    message.success('已删除该企标（演示）')
  }

  if (!enterpriseId) {
    return <Empty description="缺少企业 ID" />
  }

  if (!enterprise) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="企业不存在或已删除">
          <Button type="primary" onClick={() => navigate('/enterprise-archive')}>
            返回企业列表
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="演示环境"
        description="企业主档与下方各企标/指标为前端 Mock；对接后端后请替换为真实 API。敏感操作以接口鉴权与 403 为最终依据。"
      />

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/enterprise-archive')}>
              返回列表
            </Button>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {enterprise.name}
            </Typography.Title>
            <Tag color={STATUS_TAG[enterprise.status].color}>{STATUS_TAG[enterprise.status].text}</Tag>
          </Space>
          <Space>
            <Button icon={<EditOutlined />} onClick={onEditOpen}>
              编辑主档
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={onDelete}>
              删除企业
            </Button>
          </Space>
        </Space>

        <Card size="small" bordered title="公司基础信息">
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 2 }} labelStyle={{ width: 120 }}>
            <Descriptions.Item label="企业 ID">{enterprise.id}</Descriptions.Item>
            <Descriptions.Item label="统一社会信用代码">{enterprise.creditCode}</Descriptions.Item>
            <Descriptions.Item label="注册地址" span={2}>
              {enterprise.address}
            </Descriptions.Item>
            <Descriptions.Item label="联系人">{enterprise.contactName}</Descriptions.Item>
            <Descriptions.Item label="电话">{enterprise.contactPhone}</Descriptions.Item>
            <Descriptions.Item label="邮箱" span={2}>
              {enterprise.contactEmail}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {dayjs(enterprise.createdAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="最近更新">
              {dayjs(enterprise.updatedAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              {enterprise.remark || '—'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <div>
          <Space align="center" style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
            <Typography.Title level={5} style={{ margin: 0 }}>
              本企业企标与指标
            </Typography.Title>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={adding}
              onClick={() => void onAddQibiao()}
            >
              添加企标
            </Button>
          </Space>
          {enterprise.qibiaoList.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无企标，请点击「添加企标」">
              <Button type="primary" loading={adding} onClick={() => void onAddQibiao()}>
                添加企标
              </Button>
            </Empty>
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {enterprise.qibiaoList.map((q) => (
                <QibiaoEditorCard
                  key={q.id}
                  enterpriseId={enterprise.id}
                  qibiao={q}
                  onAfterSave={() => {
                    /* zustand 已更新，无需额外处理 */
                  }}
                  onRemove={(qid) => void onRemoveQibiao(qid)}
                />
              ))}
            </Space>
          )}
        </div>
      </Space>

      <Drawer
        title="编辑公司主档"
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={480}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setEditOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void onSave()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="企业名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="creditCode"
            label="统一社会信用代码"
            rules={[
              { required: true },
              { len: 18, message: '须为 18 位' },
            ]}
          >
            <Input maxLength={18} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="address" label="注册地址" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactName" label="联系人" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactPhone" label="联系电话" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactEmail" label="邮箱" rules={[{ required: true }, { type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
