import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Descriptions, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import type { BatchIndicatorCompareItemOut } from '@/types/batch-indicator-compare'
import { getBatchIndicatorCompareJobItem } from '@/services/batch-indicator-compare'
import { IndicatorCompareResultTable } from '@/pages/batch-indicator-compare/components/IndicatorCompareResultTable'
import { batchIndicatorCompareItemStatusMeta } from '@/pages/batch-indicator-compare/batchIndicatorCompareStatusLabels'
import {
  formatEnterpriseIndicatorLabel,
  mapCompareResultToPreviewRows,
  pickCompareSummary,
} from '@/pages/batch-indicator-compare/mapIndicatorCompareItem'
import { downloadBatchIndicatorCompareItemXlsx } from '@/pages/batch-indicator-compare/exportBatchIndicatorCompareXlsx'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'

const { Title, Text } = Typography

function formatDateTime(iso: string | undefined | null): string {
  if (!iso?.trim()) return '—'
  const d = dayjs(iso)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : iso.trim()
}

export default function BatchIndicatorCompareItemPage() {
  const { compareJobId: jobIdParam, itemId: itemIdParam } = useParams()
  const jobId = Number(jobIdParam)
  const itemId = Number(itemIdParam)
  const valid = Number.isFinite(jobId) && jobId > 0 && Number.isFinite(itemId) && itemId > 0

  const [item, setItem] = useState<BatchIndicatorCompareItemOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const loadItem = useCallback(async () => {
    if (!valid) return
    setLoading(true)
    setError(null)
    try {
      const data = await getBatchIndicatorCompareJobItem(jobId, itemId)
      setItem(data)
    } catch (e) {
      setError(getComplianceApiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [valid, jobId, itemId])

  useEffect(() => {
    void loadItem()
  }, [loadItem])

  const previewRows = useMemo(
    () => mapCompareResultToPreviewRows(item?.compare_result),
    [item?.compare_result],
  )

  const handleExport = async () => {
    if (!item) return
    setExporting(true)
    try {
      await downloadBatchIndicatorCompareItemXlsx(item)
      message.success('导出成功')
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  const auditColumns: ColumnsType<{ at: string; actor?: string | null; action: string }> = [
    { title: '时间', dataIndex: 'at', width: 180, render: (v: string) => formatDateTime(v) },
    { title: '操作者', dataIndex: 'actor', width: 120, render: (v: string | null | undefined) => v?.trim() || '—' },
    { title: '动作', dataIndex: 'action', ellipsis: true },
  ]

  if (!valid) {
    return <Alert type="error" message="无效的任务或子项 id" />
  }

  const statusMeta = item ? batchIndicatorCompareItemStatusMeta(item.indicator_compare_status) : null
  const missingGb = item?.ensure_summary?.missing_gb_files ?? []

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Space wrap size="large">
        <Link to={`/batch-normative-reference/indicator-compare/${jobId}`} style={{ fontSize: 15 }}>
          返回任务详情
        </Link>
        <Link
          to={`/batch-normative-reference/${item?.source_batch_job_id ?? ''}/items/${item?.source_batch_item_id ?? ''}`}
          style={{ fontSize: 15 }}
        >
          来源引用查新
        </Link>
      </Space>

      <Title level={3} style={{ margin: 0 }}>
        指标对比审阅：{item?.subject_code?.trim() || item?.original_filename || `子项 #${itemId}`}
      </Title>

      {error ? <Alert type="error" message={error} /> : null}

      {item ? (
        <>
          <Card size="small" loading={loading}>
            <Descriptions bordered column={2} size="small" labelStyle={{ fontSize: 15 }} contentStyle={{ fontSize: 15 }}>
              <Descriptions.Item label="状态">
                {statusMeta ? <Tag color={statusMeta.color}>{statusMeta.label}</Tag> : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="企标号">{item.subject_code?.trim() || '—'}</Descriptions.Item>
              <Descriptions.Item label="企标名">{item.subject_name?.trim() || '—'}</Descriptions.Item>
              <Descriptions.Item label="公司名">{item.company_name?.trim() || '—'}</Descriptions.Item>
              <Descriptions.Item label="文件名" span={2}>
                {item.original_filename?.trim() || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="对比国标（最新 N）" span={2}>
                {(item.latest_std_codes ?? []).length > 0
                  ? (item.latest_std_codes ?? []).join('；')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="对比完成时间">{formatDateTime(item.compared_at)}</Descriptions.Item>
              <Descriptions.Item label="摘要">{pickCompareSummary(item) || '—'}</Descriptions.Item>
              {item.skip_reason?.trim() ? (
                <Descriptions.Item label="跳过原因" span={2}>
                  {item.skip_reason}
                </Descriptions.Item>
              ) : null}
              {item.error_message?.trim() ? (
                <Descriptions.Item label="失败原因" span={2}>
                  {item.error_message}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          </Card>

          {missingGb.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message="存在缺件国标"
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {missingGb.map((m) => (
                    <li key={m.std_code}>
                      {m.std_code}
                      {m.std_name ? `（${m.std_name}）` : ''}：{m.reason}
                    </li>
                  ))}
                </ul>
              }
            />
          ) : null}

          {(item.enterprise_indicators ?? []).length > 0 ? (
            <Card size="small" title="企标提取指标（工作流①）">
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {(item.enterprise_indicators ?? []).map((ind, idx) => (
                  <li key={idx} style={{ fontSize: 15 }}>
                    {formatEnterpriseIndicatorLabel(ind)}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card
            size="small"
            title="技术指标对比明细"
            extra={
              previewRows.length > 0 ? (
                <Button loading={exporting} onClick={() => void handleExport()}>
                  导出 Excel
                </Button>
              ) : null
            }
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 14 }}>
              对比模型：企标提取指标 vs 最新国标指标（不含发布时点旧国标指标块；批量不含 M 补充标准）。
            </Text>
            <IndicatorCompareResultTable
              rows={previewRows}
              loading={loading}
              summary={pickCompareSummary(item)}
              emptyText={
                item.indicator_compare_status === 'completed'
                  ? '对比已完成但无明细行'
                  : '对比尚未完成'
              }
            />
          </Card>

          {(item.audit_log ?? []).length > 0 ? (
            <Card size="small" title="操作留痕">
              <Table
                rowKey={(r, idx) => `${r.at}-${idx}`}
                size="small"
                pagination={false}
                columns={auditColumns}
                dataSource={item.audit_log ?? []}
              />
            </Card>
          ) : null}
        </>
      ) : (
        !error && <Card loading={loading}>加载中…</Card>
      )}
    </Space>
  )
}
