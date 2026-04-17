import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Progress,
  Row,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import { EyeOutlined, UploadOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { useNavigate } from 'react-router-dom'
import {
  exportComplianceReport,
  getComplianceTasks,
  getNationalIndexes,
  getPendingIndexes,
  postInsertIndexes,
  uploadEnterpriseStandard,
  type NationalIndexItem,
} from '@/services/compliance'
import { useDifyNotifications } from '@/pages/compliance/hooks/useDifyNotifications'
import type { ComplianceTask } from '@/types/compliance'
import ComplianceWizardPanel, {
  type ComplianceWizardPanelHandle,
  type WizardProgressSnapshot,
} from '@/pages/compliance/ComplianceWizardPanel'

const { Text } = Typography

const extractIndicatorsFromUnknown = (input: unknown) => {
  const results: Array<{ id: string; indexName: string; indexValue: string }> = []
  let seq = 0

  const walk = (node: unknown) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return
    const obj = node as Record<string, unknown>

    const name = obj.index_name ?? obj.indicator_name ?? obj.name ?? obj.metric_name
    const value = obj.index_context ?? obj.indicator_value ?? obj.value ?? obj.content
    if (typeof name === 'string' && value !== undefined) {
      seq += 1
      results.push({
        id: String(obj.id ?? `qb-auto-${seq}`),
        indexName: String(name),
        indexValue: String(value),
      })
    }

    const nestedCandidates = [
      obj.indexes,
      obj.indicators,
      obj.evaluation_results,
      obj.results,
      obj.data,
      obj.payload,
      obj.content,
    ]
    nestedCandidates.forEach(walk)
  }

  walk(input)
  return results
}

const toNumericId = (id: string): number => {
  const n = Number(id)
  return Number.isFinite(n) ? n : -1
}

const CompliancePage: React.FC = () => {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<ComplianceTask[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploadVisible, setUploadVisible] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([])
  const [reportVisible, setReportVisible] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportBzId, setReportBzId] = useState('')
  const [enterpriseIndicators, setEnterpriseIndicators] = useState<
    Array<{ id: string; indexName: string; indexValue: string }>
  >([])
  const [parsePhase, setParsePhase] = useState<'idle' | 'submitted' | 'indexes_ready'>('idle')
  const [uploadBaselineIndexId, setUploadBaselineIndexId] = useState<number | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [messageApi, messageContextHolder] = message.useMessage()
  const [wizardSnapshot, setWizardSnapshot] = useState<WizardProgressSnapshot>({
    currentStep: 0,
    pendingCount: 0,
    hasExtractionData: false,
  })
  const wizardPanelRef = useRef<ComplianceWizardPanelHandle>(null)
  const messageApiRef = useRef(messageApi)
  messageApiRef.current = messageApi

  const clearPostUploadPoll = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const loadTasks = useCallback(async () => {
    try {
      setError(null)
      const response = await getComplianceTasks()
      setTasks(response.data)
    } catch (requestError) {
      const messageText =
        requestError instanceof Error
          ? requestError.message
          : '任务列表加载失败，请检查后端服务是否可用。'
      setError(messageText)
      console.error(requestError)
    }
  }, [])

  const loadExtractedIndicatorsFromPending = useCallback(async () => {
    const response = await getPendingIndexes()
    const extracted = response.data.map((item, idx) => ({
      id: item.id || `pending-${idx}`,
      indexName: item.indicatorName,
      indexValue: item.indicatorValue,
    }))
    setEnterpriseIndicators(extracted)
    return extracted
  }, [])

  const refreshExtractedData = useCallback(async () => {
    try {
      return await loadExtractedIndicatorsFromPending()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '刷新提取数据失败'
      messageApiRef.current.error(messageText)
      return undefined
    }
  }, [loadExtractedIndicatorsFromPending])

  const loadExtractedIndicatorsFromIndexesTable = useCallback(async (baselineId: number) => {
    const response = await getNationalIndexes()
    const latestRows: NationalIndexItem[] = response.data
    const extracted = latestRows
      .filter((item) => toNumericId(item.id) > baselineId)
      .map((item) => ({
        id: item.id,
        indexName: item.indexName,
        indexValue: item.indexValue,
      }))

    if (extracted.length > 0) {
      setEnterpriseIndicators(extracted)
    }
    return extracted
  }, [])

  useEffect(() => {
    void loadTasks()
    void refreshExtractedData()
  }, [loadTasks, refreshExtractedData])

  const schedulePostUploadPoll = useCallback(
    (attempt: number) => {
      clearPostUploadPoll()
      if (attempt >= 24) {
        messageApiRef.current.warning('后端解析超时：暂未拉到提取指标，请联系后端检查 Celery/Dify 任务。')
        return
      }
      pollTimerRef.current = setTimeout(() => {
        void (async () => {
          const extracted = await refreshExtractedData()
          if (uploadBaselineIndexId !== null && (extracted === undefined || extracted.length === 0)) {
            await loadExtractedIndicatorsFromIndexesTable(uploadBaselineIndexId)
          }
        })()
        schedulePostUploadPoll(attempt + 1)
      }, 5000)
    },
    [refreshExtractedData, uploadBaselineIndexId, loadExtractedIndicatorsFromIndexesTable],
  )

  useEffect(() => {
    if (parsePhase !== 'submitted') {
      return
    }
    if (enterpriseIndicators.length > 0) {
      setParsePhase('indexes_ready')
      messageApiRef.current.success('解析完成，已提取企标指标，可进行向导后续步骤')
      clearPostUploadPoll()
    }
  }, [parsePhase, enterpriseIndicators.length])

  useEffect(() => () => clearPostUploadPoll(), [])

  const onDifyNotification = useCallback(
    (payload: unknown) => {
      let text = '收到 Dify/Celery 解析通知'
      if (payload && typeof payload === 'object' && payload !== null) {
        const record = payload as Record<string, unknown>
        if (typeof record.message === 'string') {
          text = record.message
        } else if (typeof record.detail === 'string') {
          text = record.detail
        } else if (typeof record.type === 'string') {
          text = `解析事件：${record.type}`
        }
      } else if (typeof payload === 'string') {
        text = payload
      }
      messageApi.info(text)
      void loadExtractedIndicatorsFromPending()
      void loadTasks()
    },
    [messageApi, loadExtractedIndicatorsFromPending, loadTasks],
  )

  useDifyNotifications({ enabled: true, onEvent: onDifyNotification })

  const visualStyles = {
    shellCard: {
      borderRadius: 14,
      border: '1px solid #dbeafe',
      background:
        'linear-gradient(90deg, rgba(37,99,235,0.08) 0%, rgba(14,165,233,0.06) 50%, rgba(34,197,94,0.05) 100%)',
    } as React.CSSProperties,
  }

  const workflowProgress = useMemo(() => {
    const { currentStep } = wizardSnapshot
    const percent = Math.min(100, Math.round((currentStep / 6) * 100))
    const donePhases = Math.min(4, Math.ceil((currentStep / 6) * 4))
    return { percent, donePhases, totalPhases: 4 }
  }, [wizardSnapshot])

  const parseReady = parsePhase === 'indexes_ready' || wizardSnapshot.hasExtractionData

  const scrollToWizard = () => {
    wizardPanelRef.current?.scrollIntoView()
  }

  const onUploadEnterpriseStandard = async () => {
    if (uploadFileList.length === 0 || !uploadFileList[0].originFileObj) {
      messageApi.warning('请先选择需要上传的企业标准文件')
      return
    }

    try {
      setUploading(true)
      const beforeIndexes = await getNationalIndexes()
      const maxIdBefore = beforeIndexes.data.reduce((max, row) => Math.max(max, toNumericId(row.id)), -1)
      setUploadBaselineIndexId(maxIdBefore)

      const uploadResponse = await uploadEnterpriseStandard(uploadFileList[0].originFileObj as File)
      const uploadData = (uploadResponse?.data ?? {}) as Record<string, unknown>
      const autoIndexes = extractIndicatorsFromUnknown(uploadData)
      const maybeBzId = uploadData.bz_id
      if (autoIndexes.length > 0) {
        setEnterpriseIndicators(autoIndexes)
        if (typeof maybeBzId === 'string' && maybeBzId.trim()) {
          await postInsertIndexes({ bz_id: maybeBzId, indexes: autoIndexes })
          messageApi.success('解析结果已写入指标库')
        }
      } else {
        messageApi.info('已提交异步解析，待后端任务完成后会出现提取指标')
        let extracted = await loadExtractedIndicatorsFromPending()
        if (extracted.length === 0 && typeof maybeBzId === 'string' && maybeBzId.trim()) {
          const indexed = await getNationalIndexes({ bz_id: maybeBzId.trim() })
          extracted = indexed.data.map((item, idx) => ({
            id: item.id || `idx-${idx}`,
            indexName: item.indexName,
            indexValue: item.indexValue,
          }))
          if (extracted.length > 0) {
            setEnterpriseIndicators(extracted)
          }
        }
        if (extracted.length === 0 && maxIdBefore >= 0) {
          extracted = await loadExtractedIndicatorsFromIndexesTable(maxIdBefore)
        }
        if (extracted.length === 0) {
          messageApi.warning('当前未拿到解析后的企标指标，请稍后于向导第2 步点击「刷新提取结果」。')
        }
      }

      messageApi.success('企业标准上传成功，后端已开始异步解析（Celery + Dify）')
      setUploadVisible(false)
      setUploadFileList([])
      setParsePhase('submitted')
      schedulePostUploadPoll(0)
    } catch (uploadError) {
      const messageText = uploadError instanceof Error ? uploadError.message : '上传失败'
      messageApi.error(messageText)
    } finally {
      setUploading(false)
    }
  }

  const parseFileName = (contentDisposition?: string) => {
    if (!contentDisposition) {
      return `compliance-report-${Date.now()}.xlsx`
    }
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1])
    }
    const asciiMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
    return asciiMatch?.[1] ?? `compliance-report-${Date.now()}.xlsx`
  }

  const onExportReport = async () => {
    if (!reportBzId.trim()) {
      messageApi.warning('请输入标准号（bz_id）')
      return
    }
    try {
      setReporting(true)
      const response = await exportComplianceReport(reportBzId.trim())
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
      })
      const fileName = parseFileName(response.headers['content-disposition'])
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      messageApi.success('报告导出成功')
      setReportVisible(false)
      setReportBzId('')
    } catch (reportError) {
      const messageText = reportError instanceof Error ? reportError.message : '报告导出失败'
      messageApi.error(messageText)
    } finally {
      setReporting(false)
    }
  }

  const afterPanelUpload = useCallback(async () => {
    try {
      const beforeIndexes = await getNationalIndexes()
      const maxIdBefore = beforeIndexes.data.reduce((max, row) => Math.max(max, toNumericId(row.id)), -1)
      setUploadBaselineIndexId(maxIdBefore)
    } catch {
      setUploadBaselineIndexId(null)
    }
    setParsePhase('submitted')
    schedulePostUploadPoll(0)
    void loadTasks()
  }, [schedulePostUploadPoll, loadTasks])

  return (
    <PageContainer
      header={{
        title: '合规性评价',
        subTitle: '企业标准合规性评价全流程管理',
      }}
      extra={[
        <Button key="wizard" onClick={() => navigate('/compliance/wizard')}>
          独立向导页
        </Button>,
        <Button key="report" icon={<EyeOutlined />} onClick={() => setReportVisible(true)}>
          查看评价报告
        </Button>,
        <Button key="upload" type="primary" icon={<UploadOutlined />} onClick={() => setUploadVisible(true)}>
          上传企业标准
        </Button>,
      ]}
      style={{ minHeight: '100vh' }}
    >
      {messageContextHolder}
      {error ? (
        <Alert
          type="error"
          showIcon
          message="任务列表请求失败"
          description={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {parsePhase === 'submitted' ? (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => {
            setParsePhase('idle')
            clearPostUploadPoll()
          }}
          message="企标解析进行中"
          description="文件已提交，后端将异步解析；结果会通过 WebSocket 推送，同时本页每 5 秒轮询提取接口。您也可在下方向导第 2 步手动刷新提取结果。"
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {parsePhase === 'indexes_ready' ? (
        <Alert
          type="success"
          showIcon
          closable
          onClose={() => setParsePhase('idle')}
          message="提取指标已就绪"
          description="可继续在向导中完成审核、引标校验与映射对比。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card style={{ ...visualStyles.shellCard, marginBottom: 20 }}>
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} lg={16}>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color="blue">任务总数 {tasks.length}</Tag>
              <Tag color={parseReady ? 'success' : 'processing'}>
                {parseReady ? '解析结果可用' : '解析联调中'}
              </Tag>
              <Tag color="gold">主流程：上传、提取审核、引标校验、指标映射、二审分流</Tag>
            </Space>
            <Progress
              percent={workflowProgress.percent}
              size="small"
              strokeColor={{ from: '#1677ff', to: '#52c41a' }}
              status={workflowProgress.percent === 100 ? 'success' : 'active'}
            />
            <Text type="secondary">
              工作进度：已完成 {workflowProgress.donePhases}/{workflowProgress.totalPhases} 个阶段
            </Text>
          </Col>
          <Col xs={24} lg={8}>
            <Button type="primary" block size="large" onClick={scrollToWizard}>
              继续流程向导
            </Button>
          </Col>
        </Row>
      </Card>

      <ComplianceWizardPanel
        ref={wizardPanelRef}
        onProgressSnapshot={setWizardSnapshot}
        afterUploadSuccess={afterPanelUpload}
      />

      <Modal
        title="导出合规性评价报告"
        open={reportVisible}
        onCancel={() => setReportVisible(false)}
        onOk={onExportReport}
        okText="导出报告"
        cancelText="取消"
        confirmLoading={reporting}
      >
        <Input
          placeholder="请输入标准号，例如 GB/T 12345-2024"
          value={reportBzId}
          onChange={(event) => setReportBzId(event.target.value)}
        />
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          当前接口使用后端 standards/export-report，需提供 bz_id 后导出 Excel 报告。
        </Text>
      </Modal>
      <Modal
        title="上传企业标准文件"
        open={uploadVisible}
        onCancel={() => setUploadVisible(false)}
        onOk={onUploadEnterpriseStandard}
        okText="开始解析"
        cancelText="取消"
        confirmLoading={uploading}
      >
        <Upload
          maxCount={1}
          accept=".doc,.docx,.pdf,.txt"
          beforeUpload={() => false}
          fileList={uploadFileList}
          onChange={({ fileList }) => setUploadFileList(fileList)}
        >
          <Button icon={<UploadOutlined />}>选择企业标准文件</Button>
        </Upload>
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          上传后将调用后端异步解析接口，进度由后端任务系统推进；与向导第 1 步上传等价联调。
        </Text>
      </Modal>
    </PageContainer>
  )
}

export default CompliancePage
