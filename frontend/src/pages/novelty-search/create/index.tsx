import { CloudUploadOutlined, FileTextOutlined, FormOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, Form, Input, Row, Space, Tabs, Typography, Upload } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import type { RcFile } from 'antd/es/upload'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTaskFromForm, createTaskFromUpload } from '@/services/novelty-search'

const MAX_FILE_MB = 50

function TitleAutoHint() {
  return (
    <Typography.Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
      任务标题将自动生成为「企业名称 + {dayjs().format('YYYY-MM-DD')}」，无需填写。
    </Typography.Paragraph>
  )
}

export default function NoveltyCreateTaskPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [tab, setTab] = useState<'upload' | 'form'>('upload')
  const [uploadForm] = Form.useForm()
  const [manualForm] = Form.useForm()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [submitting, setSubmitting] = useState(false)

  const goTask = (id: string) => {
    message.success('任务已创建（演示）')
    navigate(`/novelty-search/tasks/${id}`)
  }

  const beforeUpload = (file: RcFile) => {
    const max = MAX_FILE_MB * 1024 * 1024
    if (file.size > max) {
      message.error(`单文件不超过 ${MAX_FILE_MB}MB`)
      return Upload.LIST_IGNORE
    }
    return false
  }

  const onUploadSubmit = async () => {
    const v = await uploadForm.validateFields()
    const f = fileList[0]
    if (!f?.name) {
      message.warning('请先选择标准文档（PDF / DOCX）')
      return
    }
    setSubmitting(true)
    try {
      const task = await createTaskFromUpload({
        enterpriseName: v.enterpriseName.trim(),
        enterpriseStdNo: v.enterpriseStdNo.trim(),
        fileName: f.name,
      })
      goTask(task.id)
    } finally {
      setSubmitting(false)
    }
  }

  const onFormSubmit = async () => {
    const v = await manualForm.validateFields()
    if (!v.stdNosText?.trim()) {
      message.warning('请至少填写一个标准号')
      return
    }
    setSubmitting(true)
    try {
      const task = await createTaskFromForm({
        enterpriseName: v.enterpriseName.trim(),
        enterpriseStdNo: v.enterpriseStdNo.trim(),
        stdNosText: v.stdNosText,
      })
      goTask(task.id)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 8 }}>
          新建任务
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          选择适合您的数据输入方式，系统将自动解析并生成查新报告。
        </Typography.Paragraph>
      </div>

      <Card bordered={false}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
          <Typography.Text type="warning">演示说明</Typography.Text>
          ：未调用真实{' '}
          <Typography.Text code>POST /api/analyze_qb_references_auto/</Typography.Text>
          ；文件仅在浏览器本地校验大小与类型。
        </Typography.Paragraph>

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as 'upload' | 'form')}
          items={[
            {
              key: 'upload',
              label: (
                <Space size={6}>
                  <FileTextOutlined />
                  上传企标
                </Space>
              ),
              children: (
                <Form form={uploadForm} layout="vertical">
                  <TitleAutoHint />
                  <Row gutter={24}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="enterpriseName"
                        label="企业名称"
                        rules={[{ required: true, message: '请输入完整企业名称' }]}
                        extra="用于报告归档与历史查询归属"
                      >
                        <Input placeholder="请输入完整企业名称" maxLength={120} showCount />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="enterpriseStdNo"
                        label="企标号"
                        rules={[{ required: true, message: '请输入企标号' }]}
                        extra="本企业标准编号，必填"
                      >
                        <Input placeholder="请输入企标号" maxLength={80} showCount />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item label="标准文档上传" required style={{ marginBottom: 8 }}>
                    <Upload.Dragger
                      name="file"
                      multiple={false}
                      maxCount={1}
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      fileList={fileList}
                      beforeUpload={beforeUpload}
                      onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
                      style={{
                        borderStyle: 'dashed',
                        borderColor: '#91caff',
                        background: '#f0f9ff',
                      }}
                    >
                      <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                        <CloudUploadOutlined style={{ fontSize: 48, color: '#1677ff' }} />
                      </p>
                      <p className="ant-upload-text" style={{ fontSize: 15 }}>
                        点击或将文件拖拽到这里上传
                      </p>
                      <p className="ant-upload-hint">
                        支持 PDF、DOCX 格式，单文件不超过 {MAX_FILE_MB}MB
                      </p>
                      <Space size="small" style={{ marginTop: 12 }}>
                        <Button size="small" type="dashed" disabled>
                          仅本地选择展示
                        </Button>
                        <Button size="small" type="dashed" disabled>
                          前端模拟验证
                        </Button>
                      </Space>
                    </Upload.Dragger>
                  </Form.Item>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                    <Button onClick={() => navigate('/novelty-search')}>取消</Button>
                    <Button type="primary" loading={submitting} onClick={() => void onUploadSubmit()}>
                      创建任务
                    </Button>
                  </div>
                </Form>
              ),
            },
            {
              key: 'form',
              label: (
                <Space size={6}>
                  <FormOutlined />
                  标准号录入
                </Space>
              ),
              children: (
                <Form form={manualForm} layout="vertical">
                  <TitleAutoHint />
                  <Row gutter={24}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="enterpriseName"
                        label="企业名称"
                        rules={[{ required: true, message: '请输入完整企业名称' }]}
                        extra="用于报告归档与历史查询归属"
                      >
                        <Input placeholder="请输入完整企业名称" maxLength={120} showCount />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="enterpriseStdNo"
                        label="企标号"
                        rules={[{ required: true, message: '请输入企标号' }]}
                        extra="本企业标准编号，必填"
                      >
                        <Input placeholder="请输入企标号" maxLength={80} showCount />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item
                    name="stdNosText"
                    label="引用标准号"
                    rules={[{ required: true, message: '请填写标准号' }]}
                    extra="支持换行、逗号或分号分隔多条。"
                  >
                    <Input.TextArea rows={6} placeholder={'例如：\nGB/T 1.1-2020\nGB 12345-2008'} />
                  </Form.Item>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <Button onClick={() => navigate('/novelty-search')}>取消</Button>
                    <Button type="primary" loading={submitting} onClick={() => void onFormSubmit()}>
                      创建任务
                    </Button>
                  </div>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  )
}
