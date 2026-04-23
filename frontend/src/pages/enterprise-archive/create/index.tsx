import { App, Button, Card, Col, Form, Input, Row, Select, Space, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEnterprise } from '@/services/enterprise-archive'
import type { EnterpriseStatus } from '@/types/enterprise-archive'

const STATUS_OPTIONS: { value: EnterpriseStatus; label: string }[] = [
  { value: 'active', label: '在营' },
  { value: 'inactive', label: '停用' },
  { value: 'suspending', label: '暂停' },
]

export default function EnterpriseCreatePage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const onFinish = async () => {
    const v = await form.validateFields()
    setSubmitting(true)
    try {
      const e = await createEnterprise({
        name: v.name,
        creditCode: v.creditCode,
        status: v.status,
        address: v.address,
        contactName: v.contactName,
        contactPhone: v.contactPhone,
        contactEmail: v.contactEmail,
        remark: v.remark,
      })
      message.success('已创建（演示）')
      navigate(`/enterprise-archive/${e.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} style={{ marginBottom: 8 }}>
          新建企业
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          填写企业主档信息；真实环境可能以导入为主，字段以后端为准。
        </Typography.Paragraph>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ status: 'active' as EnterpriseStatus }}
        onFinish={() => void onFinish()}
      >
        <Card title="基本信息" bordered={false} style={{ marginBottom: 0 }}>
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="企业名称" rules={[{ required: true, message: '请输入企业名称' }]}>
                <Input placeholder="企业全称" maxLength={200} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="creditCode"
                label="统一社会信用代码"
                rules={[
                  { required: true, message: '请输入统一社会信用代码' },
                  { pattern: /^[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}$/, message: '需为 18 位社会信用代码' },
                ]}
              >
                <Input placeholder="18 位社会信用代码" maxLength={18} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="address" label="注册地址" rules={[{ required: true, message: '请输入地址' }]}>
                <Input placeholder="注册地址" maxLength={300} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title="联系信息" bordered={false} style={{ marginTop: 16 }}>
          <Row gutter={24}>
            <Col xs={24} md={8}>
              <Form.Item name="contactName" label="联系人" rules={[{ required: true, message: '请输入联系人' }]}>
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="contactPhone"
                label="联系电话"
                rules={[
                  { required: true, message: '请输入电话' },
                  { pattern: /^1\d{10}$|^0\d{2,3}-?\d{7,8}$/, message: '请填写座机或手机号' },
                ]}
              >
                <Input placeholder="手机或区号+座机" maxLength={20} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="contactEmail"
                label="联系邮箱"
                rules={[
                  { required: true, message: '请输入邮箱' },
                  { type: 'email', message: '邮箱格式不正确' },
                ]}
              >
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={3} maxLength={500} showCount placeholder="可填写合作说明等" />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Form>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <Button onClick={() => navigate('/enterprise-archive')}>取消</Button>
        <Button type="primary" loading={submitting} onClick={() => void onFinish()}>
          保存
        </Button>
      </div>
    </Space>
  )
}
