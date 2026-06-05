import React, { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Input,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleOutlined,
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { downloadStep5TechnicalCompareWorkbook } from '@/pages/compliance/utils/step5TechnicalCompareExport'
import type { ComparePreviewRow } from '@/pages/compliance/comparison-types'
import {
  ComparablePairsTable,
  type ComparablePairRow,
} from '@/pages/compliance/components/ComparablePairsTable'
import { MissingGbDetailModal } from '@/pages/compliance/components/MissingGbDetailModal'
import { NationalIndicatorReviewModal } from '@/pages/compliance/components/NationalIndicatorReviewModal'
import '@/pages/compliance/components/ComparablePairsTable.css'
import { classifyStep5AuditDiagnostics } from '@/pages/compliance/utils/step5AuditDiagnostics'
import {
  buildStdOrchestrationLookup,
  getStdOrchestrationDisplay,
  type StdOrchestrationDisplay,
} from '@/pages/compliance/utils/step5StdOrchestrationLookup'
import type { PendingIndexItem, StandardLatestCheckResult } from '@/services/compliance'
import type { MissingGbFileItem, StdCodeOrchestrationStatus } from '@/types/compliance-api'

const { Text, Title } = Typography

/** 单项结果：✅合规 / ⚠️缺失 等（Dify③ markdown 第 7 列） */
function renderSingleResultTag(result: string) {
  const text = (result || '').trim()
  if (!text || text === '—' || text === '待确认') {
    return <Tag>—</Tag>
  }
  if (text.includes('缺失') || text.includes('⚠')) {
    return (
      <Tag color="warning" icon={<WarningOutlined />}>
        {text.replace(/^⚠️?\s*/u, '') || '缺失'}
      </Tag>
    )
  }
  if (text.includes('合规') && !text.includes('不合规')) {
    return <Tag color="success">{text}</Tag>
  }
  if (text.includes('不合规')) {
    return <Tag color="error">{text}</Tag>
  }
  return <Tag color="processing">{text}</Tag>
}

export type TechnicalComparisonStepProps = {
  enterpriseBzId: string
  /** 第 3 步企标指标提取结果（导出子表1 的 A 区） */
  enterpriseQbIndicators: PendingIndexItem[]
  referenceCount: number
  supplementCount: number
  comparePreview: ComparePreviewRow[]
  comparisonLoading: boolean
  comparisonAuditPassed: boolean
  compareBackendSummary: string
  compareLoadedFromBackend: boolean
  /** 第四步查新审核表（reference-latest 映射结果） */
  latestStandardRows: StandardLatestCheckResult[]
  /** 第四步 supplements 补充的 M 个标准号 */
  supplementStdCodes: string[]
  step4BackendMissingGb: MissingGbFileItem[]
  step5StdStatuses: StdCodeOrchestrationStatus[]
  step5NationalByStdCode: Record<string, unknown[]>
  parsingStdCodes: string[]
  indicatorsAllReady: boolean
  orchestrationLoading: boolean
  comparablePairCount: number
  repairUploading: boolean
  comparisonEditingId: string | null
  comparisonDraft: ComparePreviewRow | null
  onBuildComparePreview: () => void
  onAddComparisonRow: () => void
  onApproveComparison: () => void
  onRepairUpload: (stdCode: string, file: File) => Promise<void>
  taskId: number | null
  onOrchestrationRefreshed: () => void
  onStartEdit: (row: ComparePreviewRow) => void
  onSaveRow: () => void
  onCancelEdit: () => void
  onDraftChange: (patch: Pick<Partial<ComparePreviewRow>, 'indicatorName' | 'enterpriseValue'>) => void
}

export function TechnicalComparisonStep(props: TechnicalComparisonStepProps) {
  const {
    enterpriseBzId,
    enterpriseQbIndicators,
    referenceCount,
    supplementCount: _supplementCount,
    comparePreview,
    comparisonLoading,
    comparisonAuditPassed,
    compareBackendSummary,
    compareLoadedFromBackend,
    latestStandardRows,
    supplementStdCodes,
    step4BackendMissingGb,
    step5StdStatuses,
    step5NationalByStdCode,
    parsingStdCodes,
    indicatorsAllReady,
    orchestrationLoading,
    comparablePairCount,
    repairUploading,
    comparisonEditingId,
    comparisonDraft,
    onBuildComparePreview,
    onAddComparisonRow,
    onApproveComparison,
    onRepairUpload,
    taskId,
    onOrchestrationRefreshed,
    onStartEdit,
    onSaveRow,
    onCancelEdit,
    onDraftChange,
  } = props

  const [missingDetailStdCode, setMissingDetailStdCode] = useState<string | null>(null)
  const [reviewStdCode, setReviewStdCode] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const { message: messageApi } = App.useApp()

  const stdOrchestrationLookup = useMemo(
    () => buildStdOrchestrationLookup(step5StdStatuses, step4BackendMissingGb, parsingStdCodes),
    [step5StdStatuses, step4BackendMissingGb, parsingStdCodes],
  )

  const missingDetailInfo = useMemo(() => {
    if (!missingDetailStdCode) return null
    return getStdOrchestrationDisplay(stdOrchestrationLookup, missingDetailStdCode)
  }, [missingDetailStdCode, stdOrchestrationLookup])

  const auditDiagnostics = useMemo(
    () => classifyStep5AuditDiagnostics(latestStandardRows, supplementStdCodes),
    [latestStandardRows, supplementStdCodes],
  )

  /** ③ 左列发布完整号 + 右列最新号；M 条补充接在 GB 行下方，左列为空 */
  const comparablePairRows = useMemo((): ComparablePairRow[] => {
    const fromRefs: ComparablePairRow[] = auditDiagnostics.comparableReferences.map((row) => ({
      id: `ref-${row.queryBzId}`,
      publicationFullStdCode: (row.historicalFullStdCode ?? '').trim(),
      latestStdCode: row.currentLatestId.trim(),
      source: 'reference' as const,
    }))
    const fromSupplements: ComparablePairRow[] = auditDiagnostics.supplementStdCodes.map((code) => ({
      id: `sup-${code}`,
      publicationFullStdCode: '',
      latestStdCode: code,
      source: 'supplement' as const,
    }))
    return [...fromRefs, ...fromSupplements]
  }, [auditDiagnostics])

  const issueCount = auditDiagnostics.incompleteDb.length + step4BackendMissingGb.length

  const buildCompareDisabledReason = useMemo(() => {
    if (orchestrationLoading) return '正在编排指标，请稍候…'
    if (comparablePairCount === 0) return '暂无可进行指标对比的标准（请先在第四步补全 ③）'
    if (auditDiagnostics.incompleteDb.length > 0) {
      return '② 类引用须先补全发布完整号与最新标准号'
    }
    if (!indicatorsAllReady) {
      return '③ 涉及标准的国标指标尚未全部就绪，请先上传缺件国标文件'
    }
    return null
  }, [
    orchestrationLoading,
    comparablePairCount,
    auditDiagnostics.incompleteDb.length,
    indicatorsAllReady,
  ])

  const canBuildCompare = buildCompareDisabledReason == null

  const pendingMatchCount = useMemo(
    () =>
      comparePreview.filter((row) => {
        const r = row.nationalValue.trim()
        return r.includes('缺失') || r.includes('⚠') || r.includes('待确认')
      }).length,
    [comparePreview],
  )

  const columns: ColumnsType<ComparePreviewRow> = [
    {
      title: '序号',
      dataIndex: 'rowNo',
      key: 'rowNo',
      width: 56,
      fixed: 'left',
      render: (v: string | undefined, _row, index) => (
        <Text type="secondary">{v && v !== '—' ? v : index + 1}</Text>
      ),
    },
    {
      title: '指标类别',
      dataIndex: 'indicatorCategory',
      key: 'indicatorCategory',
      width: 100,
      ellipsis: true,
      render: (v: string | undefined) => <Text style={{ fontSize: 13 }}>{v && v !== '—' ? v : '—'}</Text>,
    },
    {
      title: '指标名称',
      dataIndex: 'indicatorName',
      key: 'indicatorName',
      width: 120,
      fixed: 'left',
      ellipsis: true,
      render: (value: string, row) =>
        comparisonEditingId === row.id ? (
          <Input
            size="small"
            value={comparisonDraft?.indicatorName ?? value}
            onChange={(e) => onDraftChange({ indicatorName: e.target.value })}
          />
        ) : (
          <Text strong style={{ fontSize: 13 }}>
            {value || '—'}
          </Text>
        ),
    },
    {
      title: '企标限值',
      dataIndex: 'enterpriseValue',
      key: 'enterpriseValue',
      width: 120,
      ellipsis: true,
      render: (value: string, row) =>
        comparisonEditingId === row.id ? (
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={comparisonDraft?.enterpriseValue ?? value}
            onChange={(e) => onDraftChange({ enterpriseValue: e.target.value })}
          />
        ) : (
          <Text style={{ fontSize: 13 }}>{value || '—'}</Text>
        ),
    },
    {
      title: '规范性引用标准号',
      dataIndex: 'referenceStdCode',
      key: 'referenceStdCode',
      width: 140,
      ellipsis: true,
      render: (v: string | undefined) => <Text style={{ fontSize: 13 }}>{v && v !== '—' ? v : '—'}</Text>,
    },
    {
      title: '国标限值',
      dataIndex: 'matchedStandard',
      key: 'matchedStandard',
      width: 120,
      ellipsis: true,
      render: (value: string) => <Text style={{ fontSize: 13 }}>{value || '—'}</Text>,
    },
    {
      title: '单项结果',
      dataIndex: 'nationalValue',
      key: 'nationalValue',
      width: 168,
      render: (value: string) => renderSingleResultTag(value),
    },
    {
      title: '判决备注',
      key: 'compareNote',
      width: 220,
      ellipsis: { showTitle: true },
      render: (_v, row) => {
        const note = row.compareNote ?? row.latestStandard ?? row.baselineStandard ?? '—'
        return (
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: note }}>
            {note}
          </Text>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_v, row) =>
        comparisonEditingId === row.id ? (
          <Space size={4}>
            <Button size="small" type="primary" onClick={onSaveRow}>
              保存
            </Button>
            <Button size="small" onClick={onCancelEdit}>
              取消
            </Button>
          </Space>
        ) : (
          <Button size="small" type="link" onClick={() => onStartEdit(row)}>
            编辑
          </Button>
        ),
    },
  ]

  const handleExportWorkbook = async () => {
    try {
      setExporting(true)
      await downloadStep5TechnicalCompareWorkbook({
        enterpriseBzId: enterpriseBzId.trim() || '未填企标号',
        enterpriseQbIndicators,
        comparableReferences: auditDiagnostics.comparableReferences,
        supplementStdCodes: auditDiagnostics.supplementStdCodes,
        nationalByStdCode: step5NationalByStdCode,
        comparePreview,
      })
      messageApi.success('已导出工作簿：企标+发布时点指标、M与N指标、对比明细')
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const collapseItems = [
    {
      key: 'excluded-non-gb',
      label: (
        <Space>
          <span>① 不参与指标对比（非 GB 引用）</span>
          <Badge
            count={auditDiagnostics.excludedNonGb.length}
            showZero
            color={auditDiagnostics.excludedNonGb.length ? 'default' : 'green'}
          />
        </Space>
      ),
      children: (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            来源：第四步查新表中「企标引用标准号」不以 GB 开头的项；后续技术对比仅针对国标（GB）。
          </Text>
          {auditDiagnostics.excludedNonGb.length > 0 ? (
            <Table
              size="small"
              rowKey="queryBzId"
              pagination={false}
              dataSource={auditDiagnostics.excludedNonGb}
              columns={[
                { title: '企标引用标准号', dataIndex: 'queryBzId', ellipsis: true },
                {
                  title: '说明',
                  key: 'note',
                  render: () => <Tag>不参与指标对比</Tag>,
                },
              ]}
            />
          ) : (
            <Text type="secondary">当前无此类引用</Text>
          )}
        </Space>
      ),
    },
    {
      key: 'incomplete-db',
      label: (
        <Space>
          <span>② 库内信息不完整（缺发布完整号或最新标准号）</span>
          <Badge
            count={auditDiagnostics.incompleteDb.length}
            showZero
            color={auditDiagnostics.incompleteDb.length ? 'orange' : 'green'}
          />
        </Space>
      ),
      children: (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            来源：第四步 GB 引用中「发布时引用的完整标准号」或「最新标准号」任一项为空的记录。
          </Text>
          {auditDiagnostics.incompleteDb.length > 0 ? (
            <Table
              size="small"
              rowKey="queryBzId"
              pagination={false}
              dataSource={auditDiagnostics.incompleteDb}
              columns={[
                { title: '企标引用标准号', dataIndex: 'queryBzId', width: 140, ellipsis: true },
                {
                  title: '发布时完整号',
                  key: 'pub',
                  width: 160,
                  ellipsis: true,
                  render: (_v, row) => {
                    const v = (row.historicalFullStdCode ?? '').trim()
                    return v ? v : <Text type="danger">空</Text>
                  },
                },
                {
                  title: '最新标准号',
                  key: 'latest',
                  width: 140,
                  ellipsis: true,
                  render: (_v, row) => {
                    const v = row.currentLatestId.trim()
                    return v ? v : <Text type="danger">空</Text>
                  },
                },
              ]}
            />
          ) : (
            <Text type="secondary">GB 引用的发布完整号与最新标准号均已填写</Text>
          )}
        </Space>
      ),
    },
    {
      key: 'comparable-pairs',
      label: (
        <Space>
          <span>③ 可进行指标对比的标准</span>
          <Badge count={comparablePairRows.length} showZero color="blue" />
        </Space>
      ),
      children: (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {indicatorsAllReady && comparablePairRows.length > 0 ? (
            <Alert
              type="success"
              showIcon
              message="全部标准指标已就绪"
              description="可点击页面上方「构建对比预览」生成技术指标对比明细。"
              style={{ borderRadius: 8 }}
            />
          ) : step4BackendMissingGb.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message={`${step4BackendMissingGb.length} 个标准号尚无库内指标`}
              description="请点击列表中「无指标 · 去处理」查看原因并上传国标文件。"
              style={{ borderRadius: 8 }}
            />
          ) : null}
          <ComparablePairsTable
            rows={comparablePairRows}
            lookup={stdOrchestrationLookup}
            orchestrationLoading={orchestrationLoading}
            onOpenMissingDetail={setMissingDetailStdCode}
            onOpenReadyDetail={setReviewStdCode}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {comparablePairRows.length} 组可对比关系
            {(() => {
              const parts: string[] = []
              if (auditDiagnostics.comparableReferences.length > 0) {
                parts.push(`GB 引用 ${auditDiagnostics.comparableReferences.length} 项`)
              }
              if (auditDiagnostics.supplementStdCodes.length > 0) {
                parts.push(`补充 M ${auditDiagnostics.supplementStdCodes.length} 项`)
              }
              return parts.length > 0 ? `（${parts.join('，')}）` : ''
            })()}
            {' '}
            · 指标状态由服务端编排返回
          </Text>
        </Space>
      ),
    },
  ]

  const auditCollapseDefaultKeys = useMemo(() => {
    const keys: string[] = []
    if (auditDiagnostics.excludedNonGb.length > 0) keys.push('excluded-non-gb')
    if (auditDiagnostics.incompleteDb.length > 0) keys.push('incomplete-db')
    return keys
  }, [auditDiagnostics])

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div
        style={{
          borderRadius: 12,
          padding: '20px 22px',
          background: 'linear-gradient(120deg, #f0f5ff 0%, #fafafa 55%, #f6ffed 100%)',
          border: '1px solid #e8eef5',
        }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} lg={14}>
            <Space direction="vertical" size={6}>
              <Title level={4} style={{ margin: 0, fontWeight: 600 }}>
                指标映射与技术对比
              </Title>
              <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
                下方「审核结果统计」来自第四步查新表；指标编排来自{' '}
                <Text code>POST step/4/indicators/ensure</Text>，对比表来自{' '}
                <Text code>GET step/5/compare</Text>。引用共{' '}
                <Text strong>{referenceCount}</Text> 项，可对比{' '}
                <Text strong>{auditDiagnostics.comparableReferences.length + auditDiagnostics.supplementStdCodes.length}</Text>{' '}
                项（含补充 M {auditDiagnostics.supplementStdCodes.length} 项）。
              </Text>
            </Space>
          </Col>
          <Col xs={24} lg={10}>
            <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Tooltip title={buildCompareDisabledReason ?? undefined}>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  loading={comparisonLoading || orchestrationLoading}
                  disabled={!canBuildCompare}
                  onClick={onBuildComparePreview}
                >
                  构建对比预览
                </Button>
              </Tooltip>
              <Button icon={<PlusOutlined />} onClick={onAddComparisonRow} disabled title="对比行由服务端生成">
                新增行
              </Button>
              <Button
                type={comparisonAuditPassed ? 'default' : 'primary'}
                ghost={!comparisonAuditPassed}
                icon={<CheckCircleOutlined />}
                onClick={onApproveComparison}
              >
                {comparisonAuditPassed ? '已通过审核' : '人工审核通过'}
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {issueCount > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={`发现 ${issueCount} 项待处理问题`}
          description="② 类须在第四步补全发布完整号/最新标准号；③ 表中「无指标」可点击查看明细并上传国标，全部就绪后方可「构建对比预览」。"
        />
      ) : compareLoadedFromBackend && comparePreview.length > 0 ? (
        <Alert
          type="success"
          showIcon
          message={`已从服务端拉取 ${comparePreview.length} 条对比记录`}
          description={
            <>
              {compareBackendSummary ? (
                <div style={{ marginBottom: 6 }}>{compareBackendSummary}</div>
              ) : null}
              {pendingMatchCount > 0
                ? `解析结果中仍有 ${pendingMatchCount} 项待确认表述；确认无误后可「人工审核通过」提交审核 5。`
                : '可执行「人工审核通过」提交服务端审核 5。'}
            </>
          }
        />
      ) : compareLoadedFromBackend ? (
        <Alert
          type="warning"
          showIcon
          message="服务端已返回对比结果，但暂无表格行"
          description={compareBackendSummary || '请检查 Dify③ 输出是否为 Markdown 表格或 details 数组。'}
        />
      ) : null}

      <Card
        size="small"
        title="第四步审核结果统计"
        styles={{ body: { paddingTop: 8 } }}
        style={{ borderRadius: 12, border: '1px solid #eef2f6' }}
      >
        <Collapse
          bordered={false}
          defaultActiveKey={auditCollapseDefaultKeys}
          items={collapseItems}
          style={{ background: 'transparent' }}
        />
      </Card>

      <MissingGbDetailModal
        open={missingDetailStdCode != null}
        info={missingDetailInfo}
        uploading={repairUploading}
        onClose={() => setMissingDetailStdCode(null)}
        onUpload={(file) => {
          if (!missingDetailInfo) return
          const code = missingDetailInfo.stdCode
          void (async () => {
            try {
              await onRepairUpload(code, file)
              setMissingDetailStdCode(null)
            } catch {
              /* 错误由父组件 message 提示 */
            }
          })()
        }}
      />

      <NationalIndicatorReviewModal
        open={reviewStdCode != null}
        stdCode={reviewStdCode}
        taskId={taskId}
        cachedRows={reviewStdCode ? step5NationalByStdCode[reviewStdCode] : undefined}
        onClose={() => setReviewStdCode(null)}
        onReviewed={onOrchestrationRefreshed}
      />

      <Card
        size="small"
        title="技术指标对比明细"
        extra={
          comparePreview.length > 0 ? (
            <Button
              icon={<DownloadOutlined />}
              loading={exporting}
              onClick={() => void handleExportWorkbook()}
            >
              导出 Excel
            </Button>
          ) : null
        }
        style={{ borderRadius: 12, border: '1px solid #eef2f6' }}
        styles={{ body: { paddingTop: 12 } }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
          构建时将 ③ 表格的「发布时完整号 + 最新标准号」作为 <Text code>compare_pairs</Text> 提交编排（
          <Text code>POST step/4/indicators/ensure</Text>），再由 <Text code>POST/GET step/5/compare</Text>{' '}
          触发工作流③：企标指标与发布时点国标拼入 <Text code>enterprise_data</Text>，最新 N+M 侧国标拼入{' '}
          <Text code>reference_data</Text>。下表解析 <Text code>compare_result.markdown</Text>；「编辑」仅可改指标名称与企标限值。
        </Text>
        <Table
          rowKey="id"
          size="middle"
          dataSource={comparePreview}
          columns={columns}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 条`,
          }}
          loading={comparisonLoading}
          scroll={{ x: 1280 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={8}>
                    <span>尚未构建对比预览</span>
                    <Tooltip title={buildCompareDisabledReason ?? undefined}>
                      <Button
                        type="primary"
                        disabled={!canBuildCompare}
                        loading={comparisonLoading || orchestrationLoading}
                        onClick={onBuildComparePreview}
                      >
                        立即构建
                      </Button>
                    </Tooltip>
                  </Space>
                }
              />
            ),
          }}
        />
      </Card>
    </Space>
  )
}
