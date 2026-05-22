import { MinusCircleOutlined, SaveOutlined } from '@ant-design/icons'
import { App, Button, Card, Divider, Form, Input, Space, Typography } from 'antd'
import { useEffect } from 'react'
import { updateEnterprise } from '@/services/enterprise-archive'
import { useEnterpriseArchiveStore } from '@/stores/enterprise-archive'
import type { EnterpriseQibiao } from '@/types/enterprise-archive'

function newIndId() {
  return `ind-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

type FormShape = {
  stdNo: string
  title: string
  basicNote: string
  indicators: { id?: string; name: string; value: string }[]
}

type Props = {
  enterpriseId: string
  qibiao: EnterpriseQibiao
  onAfterSave: () => void
  onRemove: (qibiaoId: string) => void
}

export default function QibiaoEditorCard({ enterpriseId, qibiao, onAfterSave, onRemove }: Props) {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormShape>()

  useEffect(() => {
    form.setFieldsValue({
      stdNo: qibiao.stdNo,
      title: qibiao.title,
      basicNote: qibiao.basicNote,
      indicators: qibiao.indicators.map((i) => ({ id: i.id, name: i.name, value: i.value })),
    })
  }, [form, qibiao])

  const onFinish = async (v: FormShape) => {
    const ent = useEnterpriseArchiveStore.getState().getById(enterpriseId)
    if (!ent) return
    const nextIndicators = (v.indicators ?? [])
      .filter((row) => (row.name?.trim() || row.value?.trim()) !== undefined)
      .map((row) => ({
        id: row.id?.trim() || newIndId(),
        name: (row.name ?? '').trim() || '未命名指标',
        value: (row.value ?? '').trim(),
      }))
    const next: EnterpriseQibiao = {
      ...qibiao,
      stdNo: (v.stdNo ?? '').trim(),
      title: (v.title ?? '').trim(),
      basicNote: (v.basicNote ?? '').trim(),
      indicators: nextIndicators,
      updatedAt: new Date().toISOString(),
    }
    const qibiaoList = ent.qibiaoList.map((q) => (q.id === qibiao.id ? next : q))
    try {
      await updateEnterprise(enterpriseId, { qibiaoList })
      message.success('本企标已保存（演示）')
      onAfterSave()
    } catch {
      message.error('保存失败（演示）')
    }
  }

  const onRemoveClick = () => {
    modal.confirm({
      title: '删除此企标？',
      content: '演示数据将立即从本企业档案中移除，真实环境以接口与权限为准。',
      okType: 'danger',
      onOk: () => onRemove(qibiao.id),
    })
  }

  return (
    <Card
      size="small"
      style={{ background: '#fafafa' }}
      title={
        <Space>
          <Typography.Text strong>企标</Typography.Text>
          <Typography.Text type="secondary">{qibiao.stdNo || '（未填企标号）'}</Typography.Text>
        </Space>
      }
      extra={
        <Space>
          <Button type="text" size="small" danger onClick={onRemoveClick}>
            删除企标
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          基础信息
        </Typography.Text>
        <Form.Item
          name="stdNo"
          label="企标号"
          rules={[{ required: true, message: '请填写企标号' }]}
        >
          <Input placeholder="如 Q/XXX 0001S-2020" allowClear maxLength={80} />
        </Form.Item>
        <Form.Item
          name="title"
          label="标准/产品名称"
          rules={[{ required: true, message: '请填写名称' }]}
        >
          <Input placeholder="本企标对应的产品或标准名称" allowClear maxLength={200} />
        </Form.Item>
        <Form.Item name="basicNote" label="其他基础说明（可含范围、术语等）">
          <Input.TextArea rows={3} placeholder="从正文提取或手工整理的说明，可自由编辑" maxLength={2000} showCount />
        </Form.Item>

        <Divider style={{ margin: '12px 0' }}>指标信息（可编辑、可增删行）</Divider>
        <Form.List name="indicators">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Space
                  key={field.key}
                  style={{ display: 'flex', marginBottom: 8, alignItems: 'start', flexWrap: 'wrap' }}
                >
                  <Form.Item name={[field.name, 'id']} hidden>
                    <Input type="hidden" />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'name']}
                    label="指标名称"
                    style={{ minWidth: 200, marginBottom: 0 }}
                  >
                    <Input placeholder="如 额定电压" />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'value']}
                    label="指标值/要求"
                    style={{ minWidth: 240, marginBottom: 0 }}
                  >
                    <Input placeholder="如 220V、±5% 等" />
                  </Form.Item>
                  <Form.Item label=" " colon={false} style={{ marginBottom: 0 }}>
                    <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                  </Form.Item>
                </Space>
              ))}
              <Form.Item>
                <Button
                  type="dashed"
                  onClick={() => add({ id: newIndId(), name: '', value: '' })}
                  block
                >
                  添加指标行
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
          <Button type="primary" icon={<SaveOutlined />} htmlType="submit">
            保存本企标
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}
