import { ProTable } from '@ant-design/pro-components'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo } from 'react'
import type { TemplateConfigItem } from '@/types/template-archive'
import { useTemplateArchiveStore } from '@/stores/template-archive'

const MODULE_OPTIONS = [
  { label: '查重服务', value: 'duplicate-check' },
  { label: '查新服务', value: 'novelty-search' },
  { label: '评价', value: 'evaluation' },
  { label: '预警', value: 'alert' },
]

function typeTag(type: TemplateConfigItem['type']) {
  if (type === 'docx') return <Tag color="blue">DOCX</Tag>
  if (type === 'xlsx') return <Tag color="green">XLSX</Tag>
  if (type === 'pdf') return <Tag color="red">PDF</Tag>
  return <Tag>OTHER</Tag>
}

type PreviewFn = (title: string, payload: unknown, pdfUrl?: string) => void

export function TemplateConfigPanel({ onPreview }: { onPreview: PreviewFn }) {
  const [searchForm] = Form.useForm<{ keyword?: string }>()
  const [metaForm] = Form.useForm<{
    placeholders?: string[]
    relatedModules?: string[]
    desc?: string
  }>()

  const templates = useTemplateArchiveStore((s) => s.templates)
  const loading = useTemplateArchiveStore((s) => s.templatesLoading)
  const fetchTemplates = useTemplateArchiveStore((s) => s.fetchTemplates)
  const uploadTemplate = useTemplateArchiveStore((s) => s.uploadTemplate)
  const setTemplateStatus = useTemplateArchiveStore((s) => s.setTemplateStatus)
  const removeTemplate = useTemplateArchiveStore((s) => s.removeTemplate)

  useEffect(() => {
    void fetchTemplates()
  }, [fetchTemplates])

  const columns: ColumnsType<TemplateConfigItem> = useMemo(
    () => [
      { title: '模板名称', dataIndex: 'name', key: 'name', ellipsis: true },
      {
        title: '类型',
        dataIndex: 'type',
        key: 'type',
        width: 100,
        render: (t) => typeTag(t),
      },
      { title: '版本', dataIndex: 'version', key: 'version', width: 120 },
      { title: '占位符', dataIndex: 'placeholders', key: 'placeholders', ellipsis: true,
        render: (p?: string[]) => (p?.length ? p.join('、') : '—'),
      },
      {
        title: '关联模块',
        dataIndex: 'relatedModules',
        key: 'relatedModules',
        width: 200,
        render: (m?: string[]) =>
          (m || []).map((x) => (
            <Tag key={x}>{MODULE_OPTIONS.find((o) => o.value === x)?.label ?? x}</Tag>
          )),
      },
      { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 200 },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (s: TemplateConfigItem['status']) =>
          s === 'active' ? <Badge status="success" text="启用" /> : <Badge status="default" text="停用" />,
      },
      {
        title: '操作',
        key: 'actions',
        width: 240,
        render: (_, row) => (
          <Space size={8}>
            <Button
              type="link"
              onClick={() => onPreview(`模板详情：${row.name}`, row)}
            >
              预览
            </Button>
            <Button
              type="link"
              onClick={() => {
                const next = row.status === 'active' ? 'disabled' : 'active'
                void setTemplateStatus(row.id, next).then(() =>
                  message.success('状态已更新'),
                )
              }}
            >
              {row.status === 'active' ? '停用' : '启用'}
            </Button>
            <Button
              type="link"
              danger
              onClick={() => {
                Modal.confirm({
                  title: '确认删除该模板？',
                  okText: '删除',
                  cancelText: '取消',
                  onOk: () => void removeTemplate(row.id).then(() => message.success('已删除')),
                })
              }}
            >
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [onPreview, removeTemplate, setTemplateStatus],
  )

  return (
    <div className="tplarch-templates">
      <div className="tplarch-templates-top">
        <Card className="tplarch-card tplarch-card--inner" size="small">
          <div className="tplarch-card-header">
            <Typography.Title level={5} className="tplarch-section-title" style={{ margin: 0 }}>
              模板配置中心
            </Typography.Title>
            <Space>
              <Button
                onClick={() => {
                  metaForm.resetFields()
                  searchForm.resetFields()
                  void fetchTemplates()
                }}
                disabled={loading}
              >
                重置清空
              </Button>
              <Button
                type="primary"
                onClick={() => void fetchTemplates(searchForm.getFieldsValue())}
                loading={loading}
              >
                刷新列表
              </Button>
            </Space>
          </div>

          <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
            配置模板占位符与适用业务模块，上传后可用于生成报告与下载中心分发。
          </Typography.Paragraph>

          <div className="tplarch-config-grid">
            <div className="tplarch-config-left">
              <Typography.Text strong className="tplarch-subtitle">
                基本配置
              </Typography.Text>

              <Form
                form={metaForm}
                layout="vertical"
                initialValues={{ relatedModules: ['duplicate-check'] }}
              >
                <Row gutter={[24, 16]}>
                  <Col xs={24} lg={12}>
                    <Form.Item
                      name="placeholders"
                      label="数据占位符字段"
                      tooltip="与模板中预留的字段名一致，便于系统自动填充"
                    >
                      <Select
                        mode="tags"
                        placeholder="例如 {{client_name}}、{{report_date}}"
                        tokenSeparators={[',', '，', ' ']}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Form.Item
                      name="relatedModules"
                      label="关联业务模块"
                      rules={[
                        {
                          required: true,
                          type: 'array',
                          min: 1,
                          message: '请至少勾选一个业务模块',
                        },
                      ]}
                    >
                      <div className="tplarch-modules-box">
                        <Checkbox.Group options={MODULE_OPTIONS} className="tplarch-modules-group" />
                      </div>
                      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                        可多选；请勾选该模板实际会用于哪些业务场景。
                      </Typography.Text>
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="desc" label="模板说明（可选）">
                  <Input.TextArea
                    rows={4}
                    placeholder="简要说明模板用途、适用范围、注意事项等"
                    maxLength={500}
                    showCount
                  />
                </Form.Item>

                <Form.Item label="上传模板文件" style={{ marginBottom: 0 }}>
                  <div className="tplarch-upload">
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      支持 .doc / .docx / .pdf，单文件不超过 20MB。
                    </Typography.Text>
                    <Upload
                      maxCount={1}
                      accept=".doc,.docx,.pdf"
                      beforeUpload={(file) => {
                        const ok = file.size / 1024 / 1024 <= 20
                        if (!ok) {
                          message.error('文件过大，建议不超过 20MB。')
                          return Upload.LIST_IGNORE
                        }
                        const meta = metaForm.getFieldsValue()
                        void uploadTemplate(file as File, file.name, {
                          placeholders: meta.placeholders,
                          relatedModules: meta.relatedModules,
                          desc: meta.desc,
                        }).then((r) => {
                          if (r === 'api') message.success('上传成功')
                          else if (r === 'local')
                            message.warning('上传未接入后端：已写入本地临时条目（刷新后丢失）。')
                        })
                        return false
                      }}
                    >
                      <Button type="primary" size="large">
                        选择 Word/PDF 并上传
                      </Button>
                    </Upload>
                  </div>
                </Form.Item>

                <Divider style={{ margin: '14px 0 12px' }} plain>
                  关键字筛选
                </Divider>

                <Form form={searchForm} layout="vertical" requiredMark={false} style={{ marginBottom: 0 }}>
                  <div className="tplarch-filter-row">
                    <Form.Item name="keyword" label="关键字" style={{ marginBottom: 0, flex: 1 }}>
                      <Input placeholder="输入模板名称关键字" allowClear size="large" />
                    </Form.Item>
                    <div className="tplarch-filter-row-actions">
                      <Space size={12}>
                        <Button
                          type="primary"
                          size="large"
                          onClick={() => void fetchTemplates(searchForm.getFieldsValue())}
                          loading={loading}
                        >
                          查询
                        </Button>
                        <Button
                          size="large"
                          onClick={() => {
                            searchForm.resetFields()
                            void fetchTemplates()
                          }}
                        >
                          清空
                        </Button>
                      </Space>
                    </div>
                  </div>
                </Form>
              </Form>
            </div>

            <div className="tplarch-config-right">
              <div className="tplarch-help-card">
                <Typography.Text strong style={{ color: '#fff' }}>
                  规范性指南
                </Typography.Text>
                <Typography.Paragraph
                  style={{ color: 'rgba(255,255,255,0.85)', marginTop: 8, marginBottom: 0 }}
                >
                  推荐使用清晰的占位符命名，保持模板版本号可追溯；上传前请确认模板中预留字段与系统配置一致。
                </Typography.Paragraph>
                <div className="tplarch-help-foot">
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12 }}>
                    常用占位符：standardName / threshold / conclusion
                  </Typography.Text>
                </div>
              </div>

              <Card className="tplarch-card tplarch-card--inner" size="small">
                <Typography.Text strong className="tplarch-subtitle">
                  快捷指南
                </Typography.Text>
                <div className="tplarch-steps">
                  <div>填写占位符与关联模块</div>
                  <div>上传 Word/PDF 模板文件</div>
                  <div>在模板库中启用/停用并预览</div>
                </div>
              </Card>
            </div>
          </div>
        </Card>
      </div>

      <Card className="tplarch-card tplarch-card--inner" size="small" style={{ marginTop: 16 }}>
        <div className="tplarch-card-header">
          <Typography.Title level={5} className="tplarch-section-title" style={{ margin: 0 }}>
            现有模板库
          </Typography.Title>
          <Button onClick={() => void fetchTemplates(searchForm.getFieldsValue())} loading={loading}>
            刷新
          </Button>
        </div>
        <ProTable<TemplateConfigItem>
          rowKey="id"
          search={false}
          options={false}
          pagination={{ pageSize: 10 }}
          loading={loading}
          dataSource={templates}
          columns={columns as never}
        />
      </Card>
    </div>
  )
}
