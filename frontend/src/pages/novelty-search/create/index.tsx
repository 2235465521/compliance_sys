import {
  BookOutlined,
  CloudUploadOutlined,
  FileTextOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { App, Alert, Button, Card, Col, Form, Input, Row, Space, Table, Tabs, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import type { RcFile } from 'antd/es/upload'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createTaskFromNational,
  createTaskFromUpload,
  queryStandardsByEnterpriseBzId,
} from '@/services/novelty-search'
import type { StandardItem } from '@/types/dashboard'

const MAX_FILE_MB = 50

type TabKey = 'upload' | 'national'

type NationalLatestRow = {
  key: string
  inputNo: string
  latestNo: string
}

function TitleAutoHint() {
  return (
    <Typography.Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
      任务标题将自动生成为「企标号 + {dayjs().format('YYYY-MM-DD')}」；未填企标号时为「查新任务 + 日期」。无需填写企业名称。
    </Typography.Paragraph>
  )
}

/** 与 store 内逻辑一致：顿号、逗号、分号分隔 */
function parseNationalStdNos(text: string): string[] {
  return text
    .split(/[、,，;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function mockNationalLatestVersion(inputNo: string): string {
  const t = inputNo.trim()
  if (!t) return t
  if (t.includes('2016')) return t.replace(/2016/g, '2020')
  if (t.includes('2008')) return t.replace(/2008/g, '2018')
  if (t.includes('1999')) return t.replace(/1999/g, '2009')
  return `${t}（现行）`
}

export default function NoveltyCreateTaskPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [tab, setTab] = useState<TabKey>('upload')
  const [uploadForm] = Form.useForm()
  const watchedEnterpriseStdNo = Form.useWatch('enterpriseStdNo', uploadForm)
  const [nationalForm] = Form.useForm<{ nationalStdNosText: string }>()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [nationalPreviewRows, setNationalPreviewRows] = useState<NationalLatestRow[]>([])
  const [uploadLookupLoading, setUploadLookupLoading] = useState(false)
  const [uploadLookupRows, setUploadLookupRows] = useState<StandardItem[]>([])
  const [uploadLookupSearched, setUploadLookupSearched] = useState(false)
  const [lastLookupEnterpriseStdNo, setLastLookupEnterpriseStdNo] = useState<string | null>(null)

  const uploadLookupResultFresh =
    uploadLookupSearched &&
    lastLookupEnterpriseStdNo != null &&
    lastLookupEnterpriseStdNo === (watchedEnterpriseStdNo ?? '').trim()

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

  const runUploadLibraryLookup = async () => {
    let enterpriseStdNo = ''
    try {
      const v = await uploadForm.validateFields(['enterpriseStdNo'])
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
        message.info('标准库中未检索到该企标号，您仍可上传标准文档后直接创建任务。')
      }
    } finally {
      setUploadLookupLoading(false)
    }
  }

  const onUploadSubmit = async () => {
    const v = await uploadForm.validateFields()
    const stdNo = v.enterpriseStdNo.trim()
    const f = fileList[0]
    const inLibrary = uploadLookupResultFresh && uploadLookupRows.length > 0
    if (!f?.name && !inLibrary) {
      message.warning('请上传标准文档（PDF / DOCX），或使用「查询」确认当前企标号在标准库中已有登记。')
      return
    }
    const fileName = f?.name ?? `标准库已登记-${uploadLookupRows[0].bz_id}.pdf`
    setSubmitting(true)
    try {
      const task = await createTaskFromUpload({
        enterpriseStdNo: stdNo,
        fileName,
      })
      goTask(task.id)
    } finally {
      setSubmitting(false)
    }
  }

  const runNationalLookup = () => {
    const text = nationalForm.getFieldValue('nationalStdNosText') ?? ''
    const parts = parseNationalStdNos(text)
    if (parts.length === 0) {
      message.warning('请先输入国标号，多个之间用顿号「、」分隔。')
      setNationalPreviewRows([])
      return
    }
    setNationalPreviewRows(
      parts.map((inputNo, i) => ({
        key: `n-${i}-${inputNo}`,
        inputNo,
        latestNo: mockNationalLatestVersion(inputNo),
      })),
    )
    message.success(`已解析 ${parts.length} 条国标并匹配演示「最新版」，可在表格中核对。`)
  }

  const onNationalSubmit = async () => {
    const v = await nationalForm.validateFields()
    const text = v.nationalStdNosText?.trim() ?? ''
    if (!text) {
      message.warning('请填写国标号')
      return
    }
    const parts = parseNationalStdNos(text)
    if (parts.length === 0) {
      message.warning('未识别到有效国标，请按格式用顿号「、」分隔。')
      return
    }
    if (nationalPreviewRows.length === 0) {
      message.warning('请先点击「查询最新版（演示）」生成结果表，确认无误后再创建任务。')
      return
    }
    setSubmitting(true)
    try {
      const task = await createTaskFromNational({
        nationalStdNosText: text,
      })
      goTask(task.id)
    } finally {
      setSubmitting(false)
    }
  }

  const uploadLibraryColumns: ColumnsType<StandardItem> = useMemo(
    () => [
      {
        title: '标准号',
        dataIndex: 'bz_id',
        key: 'bz_id',
        width: '28%',
        ellipsis: true,
      },
      {
        title: '标准名称',
        dataIndex: 'bz_name',
        key: 'bz_name',
        ellipsis: true,
      },
      {
        title: '状态',
        dataIndex: 'ex_state',
        key: 'ex_state',
        width: 100,
      },
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

  const nationalColumns: ColumnsType<NationalLatestRow> = useMemo(
    () => [
      {
        title: '输入的标准号',
        dataIndex: 'inputNo',
        key: 'inputNo',
        width: '42%',
        ellipsis: true,
      },
      {
        title: '现行最新版本（演示）',
        dataIndex: 'latestNo',
        key: 'latestNo',
        ellipsis: true,
        render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
      },
    ],
    [],
  )

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
          ；文件仅在浏览器本地校验大小与类型。「上传国标」下最新版为前端模拟，联调后请接标准库查新接口。
        </Typography.Paragraph>

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as TabKey)}
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
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
                    填写企标号后，可点击「查询」在标准库中快捷检索（
                    <Typography.Text code>GET /api/standards/?bz_id=…</Typography.Text>
                    ）；有则下方展示库内信息。也可直接上传标准文档，两种方式互不冲突——创建任务时只需「已上传文件」或「查询到库内记录」满足其一即可。
                  </Typography.Paragraph>
                  <Form.Item
                    label="企标号（快捷查询）"
                    required
                    extra="必填。可选：点击「查询」查看标准库是否已有登记；与是否上传文件无关。"
                  >
                    <Space.Compact style={{ width: '100%', maxWidth: 560 }}>
                      <Form.Item
                        name="enterpriseStdNo"
                        noStyle
                        rules={[{ required: true, message: '请输入企标号' }]}
                      >
                        <Input placeholder="请输入企标号" maxLength={80} showCount style={{ minWidth: 200 }} />
                      </Form.Item>
                      <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        loading={uploadLookupLoading}
                        onClick={() => void runUploadLibraryLookup()}
                      >
                        查询
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
                          locale={{ emptyText: '无数据' }}
                        />
                      ) : (
                        <Alert
                          type="info"
                          showIcon
                          message="标准库中未找到该企标号"
                          description="可直接上传标准文档后创建任务；若确信已在库中登记，请核对企标号是否与后台 StdBase.bz_id 一致并重新查询。"
                          style={{ marginBottom: 20 }}
                        />
                      )}
                    </>
                  )}

                  <Form.Item
                    label="标准文档"
                    extra="可选。若已查询到库内记录，可不传文件；否则请上传 PDF / DOCX。"
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
              key: 'national',
              label: (
                <Space size={6}>
                  <BookOutlined />
                  上传国标
                </Space>
              ),
              children: (
                <Form form={nationalForm} layout="vertical" initialValues={{ nationalStdNosText: '' }}>
                  <TitleAutoHint />
                  <Form.Item
                    name="nationalStdNosText"
                    label="国标号"
                    rules={[{ required: true, message: '请填写国标号' }]}
                    extra={
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        格式：多个国标号之间使用中文顿号「、」连接。示例：GB/T 601-2016、GB/T 602-2016、GB/T
                        603-2002。也支持英文逗号、分号作为分隔（演示容错）。
                      </Typography.Text>
                    }
                  >
                    <Input.TextArea
                      rows={3}
                      placeholder="例如：GB/T 601-2016、GB/T 602-2016"
                      style={{ fontSize: 14 }}
                    />
                  </Form.Item>
                  <Space wrap style={{ marginBottom: 16 }}>
                    <Button type="primary" icon={<SearchOutlined />} onClick={runNationalLookup}>
                      查询最新版（演示）
                    </Button>
                  </Space>
                  <Table<NationalLatestRow>
                    size="small"
                    rowKey="key"
                    columns={nationalColumns}
                    dataSource={nationalPreviewRows}
                    pagination={false}
                    locale={{
                      emptyText: '输入国标后点击「查询最新版（演示）」，此处展示每个标准号对应的现行最新版本（一行一项）。',
                    }}
                    style={{ marginBottom: 24 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <Button onClick={() => navigate('/novelty-search')}>取消</Button>
                    <Button type="primary" loading={submitting} onClick={() => void onNationalSubmit()}>
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
