import { CloudUploadOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons'
import { App, Alert, Button, Card, Form, Input, Space, Table, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import type { RcFile } from 'antd/es/upload'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createTaskFromUpload,
  NoveltySearchApiError,
  queryStandardsByEnterpriseBzId,
} from '@/services/novelty-search'
import type { StandardItem } from '@/types/dashboard'

const MAX_FILE_MB = 50

export default function NoveltyCreateTaskPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const watchedEnterpriseStdNo = Form.useWatch('enterpriseStdNo', form)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploadLookupLoading, setUploadLookupLoading] = useState(false)
  const [uploadLookupRows, setUploadLookupRows] = useState<StandardItem[]>([])
  const [uploadLookupSearched, setUploadLookupSearched] = useState(false)
  const [lastLookupEnterpriseStdNo, setLastLookupEnterpriseStdNo] = useState<string | null>(null)

  const uploadLookupResultFresh =
    uploadLookupSearched &&
    lastLookupEnterpriseStdNo != null &&
    lastLookupEnterpriseStdNo === (watchedEnterpriseStdNo ?? '').trim()

  const goTask = (id: string) => {
    message.success('任务已创建，请确认专用表后执行查新比对')
    navigate(`/novelty-search/tasks/${id}`)
  }

  const handleCreateError = (e: unknown) => {
    if (e instanceof NoveltySearchApiError) {
      const msg = e.message
      if (e.status === 422 || msg.includes('empty_history') || msg.includes('无合规') || msg.includes('无历史')) {
        message.error(
          msg.includes('empty_history') || msg.includes('无')
            ? msg
            : '该企标暂无合规/批量评价历史，请先在合规模块或批量评价中完成评价后再查新。',
        )
        return
      }
      if (e.status === 503) {
        message.error(msg || '服务依赖 MySQL 未就绪，请联系管理员')
        return
      }
      message.error(msg)
      return
    }
    message.error(e instanceof Error ? e.message : '创建失败')
  }

  const beforeUpload = (file: RcFile) => {
    const max = MAX_FILE_MB * 1024 * 1024
    if (file.size > max) {
      message.error(`单文件不超过 ${MAX_FILE_MB}MB`)
      return Upload.LIST_IGNORE
    }
    return false
  }

  const runUploadLibraryLookup = async () => {
    let enterpriseStdNo = ''
    try {
      const v = await form.validateFields(['enterpriseStdNo'])
      enterpriseStdNo = v.enterpriseStdNo?.trim() ?? ''
    } catch {
      return
    }
    setUploadLookupLoading(true)
    try {
      const rows = await queryStandardsByEnterpriseBzId(enterpriseStdNo)
      setUploadLookupRows(rows)
      setUploadLookupSearched(true)
      setLastLookupEnterpriseStdNo(enterpriseStdNo)
      if (rows.length > 0) {
        message.success(`在标准库中找到 ${rows.length} 条与「${enterpriseStdNo}」相关的记录。`)
      } else {
        message.info('标准库中未检索到该企标号；若已有合规/批量评价记录，仍可直接创建查新任务。')
      }
    } finally {
      setUploadLookupLoading(false)
    }
  }

  const onSubmit = async () => {
    const v = await form.validateFields()
    const stdNo = v.enterpriseStdNo.trim()
    const f = fileList[0]
    setSubmitting(true)
    try {
      const task = await createTaskFromUpload({
        enterpriseStdNo: stdNo,
        file: f?.originFileObj as RcFile | undefined,
      })
      goTask(task.id)
    } catch (e) {
      handleCreateError(e)
    } finally {
      setSubmitting(false)
    }
  }

  const uploadLibraryColumns: ColumnsType<StandardItem> = useMemo(
    () => [
      { title: '标准号', dataIndex: 'bz_id', key: 'bz_id', width: '28%', ellipsis: true },
      { title: '标准名称', dataIndex: 'bz_name', key: 'bz_name', ellipsis: true },
      { title: '状态', dataIndex: 'ex_state', key: 'ex_state', width: 100 },
      {
        title: '实施日期',
        dataIndex: 'implement_time',
        key: 'implement_time',
        width: 120,
        render: (t: string | undefined) => t ?? '—',
      },
    ],
    [],
  )

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 8 }}>
          新建查新任务
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          输入企标号后，系统将从历史合规评价与批量评价中汇聚规范性引用，生成专用表供确认与三列查新比对。
        </Typography.Paragraph>
      </div>

      <Card bordered={false}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
          接口：<Typography.Text code>POST /api/v1/novelty-search/tasks</Typography.Text>
          （multipart，必填 <Typography.Text code>subject_code</Typography.Text>
          ）。创建成功后状态为「待确认专用表」，无需轮询。
        </Typography.Paragraph>

        <Form form={form} layout="vertical">
          <Form.Item
            label="企标号"
            required
            extra="必填。需该企标在系统中已有合规 Step3 完成或批量评价 completed 记录。"
          >
            <Space.Compact style={{ width: '100%', maxWidth: 560 }}>
              <Form.Item name="enterpriseStdNo" noStyle rules={[{ required: true, message: '请输入企标号' }]}>
                <Input placeholder="请输入企标号" maxLength={80} showCount style={{ minWidth: 200 }} />
              </Form.Item>
              <Button
                type="default"
                icon={<SearchOutlined />}
                loading={uploadLookupLoading}
                onClick={() => void runUploadLibraryLookup()}
              >
                查标准库
              </Button>
            </Space.Compact>
          </Form.Item>

          {uploadLookupResultFresh && (
            <>
              {uploadLookupRows.length > 0 ? (
                <Table<StandardItem>
                  size="small"
                  rowKey={(r) => String(r.id)}
                  columns={uploadLibraryColumns}
                  dataSource={uploadLookupRows}
                  pagination={uploadLookupRows.length > 8 ? { pageSize: 8 } : false}
                  style={{ marginBottom: 20 }}
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="标准库中未找到该企标号"
                  description="不影响查新任务创建；汇聚数据来自合规/批量评价，与标准库登记无关。"
                  style={{ marginBottom: 20 }}
                />
              )}
            </>
          )}

          <Form.Item
            label="企标文档（可选）"
            extra="PDF/DOCX 仅由后端存档，当前不会触发 PDF 解析。"
            style={{ marginBottom: 8 }}
          >
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
                点击或将文件拖拽到这里上传（可选）
              </p>
              <p className="ant-upload-hint">
                支持 PDF、DOCX，单文件不超过 {MAX_FILE_MB}MB
              </p>
            </Upload.Dragger>
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <Button onClick={() => navigate('/novelty-search')}>取消</Button>
            <Button type="primary" loading={submitting} icon={<FileTextOutlined />} onClick={() => void onSubmit()}>
              创建任务
            </Button>
          </div>
        </Form>
      </Card>
    </Space>
  )
}
