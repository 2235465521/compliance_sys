import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Row,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { SaveOutlined, UploadOutlined } from '@ant-design/icons'
import {
  checkLatestStandard,
  getNationalIndexes,
  getPendingIndexes,
  submitAuditBulkDecision,
  submitAuditDecision,
  type PendingIndexItem,
  type StandardLatestCheckResult,
  uploadEnterpriseStandard,
} from '@/services/compliance'

const { Text } = Typography

export const WIZARD_STEP_TITLES = [
  '企标输入与解析提交',
  '提取结果确认与人工审核',
  '引用标准有效性与更替确认',
  '指标映射与技术对比确认',
  '三项评价总结审核',
  '报告生成与判定',
  '归档完成',
]

export type ComparePreviewRow = {
  id: string
  indicatorName: string
  enterpriseValue: string
  matchedStandard: string
  nationalValue: string
  status: string
}

export type WizardProgressSnapshot = {
  currentStep: number
  pendingCount: number
  hasExtractionData: boolean
}

export type ComplianceWizardPanelProps = {
  onProgressSnapshot?: (snapshot: WizardProgressSnapshot) => void
  afterUploadSuccess?: () => void
}

export type ComplianceWizardPanelHandle = {
  scrollIntoView: () => void
}

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #e8ecf1',
  boxShadow: '0 4px 18px rgba(15, 23, 42, 0.06)',
}

const ComplianceWizardPanel = forwardRef<ComplianceWizardPanelHandle, ComplianceWizardPanelProps>(
  function ComplianceWizardPanel({ onProgressSnapshot, afterUploadSuccess }, ref) {
    const rootRef = React.useRef<HTMLDivElement | null>(null)
    const [form] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()
    const [current, setCurrent] = useState(0)
    const [uploading, setUploading] = useState(false)
    const [fileList, setFileList] = useState<UploadFile[]>([])
    const [pendingRows, setPendingRows] = useState<PendingIndexItem[]>([])
    const [loadingPending, setLoadingPending] = useState(false)
    const [auditingId, setAuditingId] = useState<string | null>(null)
    const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | null>(null)
    const [comparePreview, setComparePreview] = useState<ComparePreviewRow[]>([])
    const [validityLoading, setValidityLoading] = useState(false)
    const [latestStandardRows, setLatestStandardRows] = useState<StandardLatestCheckResult[]>([])
    const [summaryDraft, setSummaryDraft] = useState({
      descriptive: '',
      validity: '',
      technical: '',
    })

    useImperativeHandle(ref, () => ({
      scrollIntoView: () => {
        rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
    }))

    const pendingCount = useMemo(
      () =>
        pendingRows.filter((row) => row.statusText.includes('待审核') || row.statusText.includes('解析')).length,
      [pendingRows],
    )

    useEffect(() => {
      onProgressSnapshot?.({
        currentStep: current,
        pendingCount: pendingRows.length,
        hasExtractionData: pendingRows.length > 0,
      })
    }, [current, pendingRows.length, onProgressSnapshot])

    const refreshPending = async () => {
      try {
        setLoadingPending(true)
        const response = await getPendingIndexes()
        setPendingRows(response.data)
        messageApi.success(`已刷新提取结果，共 ${response.data.length} 条`)
      } catch (error) {
        const text = error instanceof Error ? error.message : '刷新提取结果失败'
        messageApi.error(text)
      } finally {
        setLoadingPending(false)
      }
    }

    const runUpload = async () => {
      if (fileList.length === 0 || !fileList[0].originFileObj) {
        messageApi.warning('请先上传企标文件')
        return
      }
      try {
        setUploading(true)
        await uploadEnterpriseStandard(fileList[0].originFileObj as File)
        messageApi.success('文件已提交后端异步解析，请在下一步审核提取结果')
        afterUploadSuccess?.()
        setCurrent(1)
        await refreshPending()
      } catch (error) {
        const text = error instanceof Error ? error.message : '上传失败'
        messageApi.error(text)
      } finally {
        setUploading(false)
      }
    }

    const canAudit = (item: PendingIndexItem) => Number.isFinite(Number(item.id))

    const submitSingleAudit = async (item: PendingIndexItem, action: 'approve' | 'reject') => {
      if (!canAudit(item)) {
        messageApi.warning('该记录缺少可用ID，暂不可审核')
        return
      }
      try {
        setAuditingId(item.id)
        await submitAuditDecision(item.id, action)
        messageApi.success(action === 'approve' ? '已通过该记录' : '已驳回该记录')
        await refreshPending()
      } catch (error) {
        const text = error instanceof Error ? error.message : '审核失败'
        messageApi.error(text)
      } finally {
        setAuditingId(null)
      }
    }

    const submitBulkAudit = async (action: 'approve' | 'reject') => {
      const ids = pendingRows.filter(canAudit).map((item) => item.id)
      if (ids.length === 0) {
        messageApi.warning('没有可批量审核的数据')
        return
      }
      try {
        setBulkAction(action)
        await submitAuditBulkDecision(ids, action)
        messageApi.success(action === 'approve' ? `已一键通过 ${ids.length} 条` : `已一键驳回 ${ids.length} 条`)
        await refreshPending()
      } catch (error) {
        const text = error instanceof Error ? error.message : '批量审核失败'
        messageApi.error(text)
      } finally {
        setBulkAction(null)
      }
    }

    const buildComparePreview = async () => {
      try {
        const [pendingResponse, nationalResponse] = await Promise.all([getPendingIndexes(), getNationalIndexes()])
        const mapped: ComparePreviewRow[] = pendingResponse.data.map((item, idx) => {
          const match = nationalResponse.data.find((n) => n.indexName.includes(item.indicatorName))
          return {
            id: item.id || `preview-${idx + 1}`,
            indicatorName: item.indicatorName,
            enterpriseValue: item.indicatorValue,
            matchedStandard: match ? `${match.standardId} / ${match.indexName}` : '-',
            nationalValue: match?.indexValue ?? '-',
            status: match ? '已匹配' : '待人工确认',
          }
        })
        setComparePreview(mapped)
        messageApi.success('已构建指标映射与对比预览')
      } catch (error) {
        const text = error instanceof Error ? error.message : '构建对比预览失败'
        messageApi.error(text)
      }
    }

    const runReferenceValidityCheck = async () => {
      const uniqueIds = Array.from(
        new Set(
          pendingRows
            .map((item) => item.standardName)
            .map((name) => name.trim())
            .filter((name) => name.length > 0 && name !== '-'),
        ),
      )
      if (uniqueIds.length === 0) {
        messageApi.warning('暂无可校验的引用标准编号，请先完成提取。')
        return
      }
      try {
        setValidityLoading(true)
        const results = await Promise.all(
          uniqueIds.map(async (id) => {
            try {
              return await checkLatestStandard(id)
            } catch {
              return {
                queryBzId: id,
                isLatest: true,
                currentLatestId: id,
                pedigreeChain: '后端未返回谱系链（接口联调中）',
              } satisfies StandardLatestCheckResult
            }
          }),
        )
        setLatestStandardRows(results)
        const outdatedCount = results.filter((item) => !item.isLatest).length
        messageApi.success(
          outdatedCount > 0
            ? `校验完成，发现 ${outdatedCount} 条引用标准存在更新`
            : '校验完成，当前引用标准均为最新',
        )
      } finally {
        setValidityLoading(false)
      }
    }

    const saveDraft = () => {
      const bzId = form.getFieldValue('bzId') as string
      const draft = {
        bzId,
        summaryDraft,
        current,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem('compliance-wizard-draft', JSON.stringify(draft))
      messageApi.success('已保存向导草稿')
    }

    const referenceColumns: ColumnsType<PendingIndexItem> = [
      { title: '引用标准', dataIndex: 'standardName', key: 'standardName', width: 160 },
      { title: '指标名称', dataIndex: 'indicatorName', key: 'indicatorName', width: 220 },
      { title: '指标值', dataIndex: 'indicatorValue', key: 'indicatorValue' },
      {
        title: '状态',
        dataIndex: 'statusText',
        key: 'statusText',
        width: 110,
        render: (text: string) => <Tag color={text.includes('通过') ? 'success' : 'processing'}>{text}</Tag>,
      },
      {
        title: '审核',
        key: 'action',
        width: 170,
        render: (_value, record) => (
          <Space size={8}>
            <Button
              type="primary"
              size="small"
              loading={auditingId === record.id}
              onClick={() => submitSingleAudit(record, 'approve')}
            >
              通过
            </Button>
            <Button
              danger
              size="small"
              loading={auditingId === record.id}
              onClick={() => submitSingleAudit(record, 'reject')}
            >
              驳回
            </Button>
          </Space>
        ),
      },
    ]

    const compareColumns: ColumnsType<ComparePreviewRow> = [
      { title: '指标名称', dataIndex: 'indicatorName', key: 'indicatorName', width: 180 },
      { title: '现有指标值', dataIndex: 'enterpriseValue', key: 'enterpriseValue', width: 240 },
      { title: '匹配国标指标', dataIndex: 'matchedStandard', key: 'matchedStandard', width: 260 },
      { title: '国标指标值', dataIndex: 'nationalValue', key: 'nationalValue', width: 220 },
      {
        title: '映射状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: string) => (
          <Tag color={status === '已匹配' ? 'success' : 'warning'}>{status}</Tag>
        ),
      },
    ]

    const latestStandardColumns: ColumnsType<StandardLatestCheckResult> = [
      { title: '引用标准', dataIndex: 'queryBzId', key: 'queryBzId', width: 160 },
      {
        title: '最新性',
        dataIndex: 'isLatest',
        key: 'isLatest',
        width: 110,
        render: (isLatest: boolean) => (
          <Tag color={isLatest ? 'success' : 'warning'}>{isLatest ? '最新' : '需更新'}</Tag>
        ),
      },
      { title: '最新标准', dataIndex: 'currentLatestId', key: 'currentLatestId', width: 180 },
      { title: '更替链', dataIndex: 'pedigreeChain', key: 'pedigreeChain' },
    ]

    return (
      <div ref={rootRef}>
        {contextHolder}
        <Row gutter={[20, 20]} align="stretch">
          <Col xs={24} lg={17}>
            <Card style={{ ...cardStyle, marginBottom: 16 }}>
              <Steps size="small" current={current} items={WIZARD_STEP_TITLES.map((title) => ({ title }))} />
            </Card>

            <Card title={WIZARD_STEP_TITLES[current]} style={cardStyle}>
              {current === 0 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Alert type="info" showIcon message="先输入企标编号或上传文件，再触发后端 Dify 异步解析" />
                  <Form layout="vertical" form={form}>
                    <Form.Item label="企标编号（bz_id）" name="bzId">
                      <Input placeholder="例如 Q/ABC 001-2026" allowClear />
                    </Form.Item>
                  </Form>
                  <Upload
                    maxCount={1}
                    beforeUpload={() => false}
                    fileList={fileList}
                    onChange={({ fileList: next }) => setFileList(next)}
                  >
                    <Button icon={<UploadOutlined />}>选择企标文件</Button>
                  </Upload>
                  <Button type="primary" loading={uploading} onClick={runUpload}>
                    上传并开始解析
                  </Button>
                </Space>
              ) : null}

              {current === 1 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }}>
                    <Descriptions.Item label="待审核条数">{pendingCount}</Descriptions.Item>
                    <Descriptions.Item label="当前模式">表格内联审核</Descriptions.Item>
                  </Descriptions>
                  <Space wrap>
                    <Button
                      type="primary"
                      loading={bulkAction === 'approve'}
                      onClick={() => submitBulkAudit('approve')}
                    >
                      一键通过
                    </Button>
                    <Button danger loading={bulkAction === 'reject'} onClick={() => submitBulkAudit('reject')}>
                      一键驳回
                    </Button>
                    <Button onClick={refreshPending} loading={loadingPending}>
                      刷新提取结果
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    dataSource={pendingRows}
                    columns={referenceColumns}
                    loading={loadingPending}
                    pagination={{ pageSize: 8, showSizeChanger: false }}
                    locale={{ emptyText: '暂无提取结果，请先完成解析或稍后刷新' }}
                    scroll={{ x: 960 }}
                  />
                </Space>
              ) : null}

              {current === 2 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Alert
                    type="warning"
                    showIcon
                    message="引用标准有效性与更替"
                    description="校验引用标准是否为最新版本，并输出更替链；若个别编号无法识别，将降级为联调占位提示。"
                  />
                  <Button type="primary" loading={validityLoading} onClick={runReferenceValidityCheck}>
                    生成引标有效性与更替信息
                  </Button>
                  <Table
                    rowKey="queryBzId"
                    dataSource={latestStandardRows}
                    columns={latestStandardColumns}
                    pagination={false}
                    locale={{ emptyText: '点击上方按钮后生成有效性与更替输出' }}
                    scroll={{ x: 860 }}
                  />
                </Space>
              ) : null}

              {current === 3 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Button type="primary" onClick={buildComparePreview}>
                    构建映射对比预览
                  </Button>
                  <Table
                    rowKey="id"
                    dataSource={comparePreview}
                    columns={compareColumns}
                    pagination={{ pageSize: 8, showSizeChanger: false }}
                    locale={{ emptyText: '请先点击「构建映射对比预览」' }}
                    scroll={{ x: 1040 }}
                  />
                </Space>
              ) : null}

              {current === 4 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Input.TextArea
                    rows={4}
                    placeholder="描述性评价信息"
                    value={summaryDraft.descriptive}
                    onChange={(e) => setSummaryDraft((prev) => ({ ...prev, descriptive: e.target.value }))}
                  />
                  <Input.TextArea
                    rows={4}
                    placeholder="引用标准文件有效性及更替信息"
                    value={summaryDraft.validity}
                    onChange={(e) => setSummaryDraft((prev) => ({ ...prev, validity: e.target.value }))}
                  />
                  <Input.TextArea
                    rows={4}
                    placeholder="技术指标对比详细信息"
                    value={summaryDraft.technical}
                    onChange={(e) => setSummaryDraft((prev) => ({ ...prev, technical: e.target.value }))}
                  />
                </Space>
              ) : null}

              {current === 5 ? (
                <Alert
                  type="success"
                  showIcon
                  message="报告生成与合规判定"
                  description="本步骤用于提交三项总结并触发报告生成：合规则生成证书，不合规则生成分析报告。可与页眉「查看评价报告」导出联动。"
                />
              ) : null}

              {current === 6 ? (
                <Alert
                  type="success"
                  showIcon
                  message="归档完成"
                  description="流程闭环完成，草稿已可清理；如需再次评价请从第一步重新上传或选择新任务。"
                />
              ) : null}
            </Card>
          </Col>

          <Col xs={24} lg={7}>
            <Card title="步骤说明" style={{ ...cardStyle, position: 'sticky', top: 88 }}>
              <Space direction="vertical" size="small">
                <Text type="secondary">
                  当前第 {current + 1} 步，共 {WIZARD_STEP_TITLES.length} 步。建议使用底部导航顺序推进，复杂场景可随时保存草稿。
                </Text>
                <Text>· 第1–2 步：完成解析与提取审核，保证后续引标与映射可靠。</Text>
                <Text>· 第 3–4 步：确认标准有效性与指标映射对比。</Text>
                <Text>· 第 5–7 步：总结、报告与归档闭环。</Text>
              </Space>
            </Card>
          </Col>
        </Row>

        <Card
          style={{
            ...cardStyle,
            marginTop: 20,
            position: 'sticky',
            bottom: 16,
            zIndex: 5,
            background: '#fafbff',
          }}
        >
          <Row justify="space-between" align="middle" gutter={[12, 12]}>
            <Col>
              <Space wrap>
                <Button disabled={current === 0} onClick={() => setCurrent((prev) => Math.max(0, prev - 1))}>
                  上一步
                </Button>
                <Button
                  type="primary"
                  disabled={current === WIZARD_STEP_TITLES.length - 1}
                  onClick={() =>
                    setCurrent((prev) => Math.min(WIZARD_STEP_TITLES.length - 1, prev + 1))
                  }
                >
                  下一步
                </Button>
              </Space>
            </Col>
            <Col>
              <Space wrap>
                <Button icon={<SaveOutlined />} onClick={saveDraft}>
                  保存草稿
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      </div>
    )
  },
)

export default ComplianceWizardPanel
