import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Card, Descriptions, Space, Typography, message } from 'antd'
import { Link, useParams } from 'react-router-dom'
import type { StandardLatestCheckResult } from '@/services/compliance'
import {
  fileComplianceOutcomeAlertType,
  fileComplianceOutcomeLabel,
  mapReferencesResolvedToStandardLatestResults,
  parseFileComplianceOutcome,
  standardLatestCheckResultsToReferencesResolvedPayload,
  type FileComplianceOutcome,
} from '@/services/compliance'
import type { BatchNormativeRefItemOut, BatchNormativeRefJobOut } from '@/types/batch-normative-ref'
import {
  getBatchNormativeRefJob,
  getBatchNormativeRefJobItem,
  updateBatchNormativeRefJobItemReferences,
} from '@/services/batch-normative-reference'
import { batchItemStatusMeta } from '@/pages/batch-normative-ref/batchStatusLabels'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'
import { ReferenceLatestResolvedTable } from '@/pages/compliance/components/ReferenceLatestResolvedTable'
import {
  displayOrDash,
  pickCompanyForItem,
  pickImplementationDateText,
  pickQbCode,
  pickQbShortName,
  pickQbStandardTitle,
} from '@/pages/batch-normative-ref/itemMetaDisplay'

const { Title, Text } = Typography

function fileOutcomeDescription(o: FileComplianceOutcome): string {
  switch (o) {
    case 'compliant':
      return '系统判定：本文件全部引用均可自动比对，且时点完整号与谱系主现行号一致。'
    case 'non_compliant':
      return '系统判定：存在至少一条可自动比对且与现行主号不一致的引用，请在表格中逐项处理。'
    case 'undetermined':
      return '系统无法对全部引用给出自动合规结论（例如存在不参与强比对的引用），请管理员结合表格与说明审核。'
    case 'no_references':
      return '本文件未解析到需汇总的规范性引用，或引用列表为空；并非解析失败。'
    default:
      return ''
  }
}

function formatDateTimeLabel(raw: string): string {
  const t = raw.trim()
  if (!t) return '—'
  const ms = Date.parse(t)
  if (!Number.isNaN(ms)) {
    return new Date(ms).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
  }
  return t
}

export default function BatchItemReferencePage() {
  const { jobId: jobIdParam, itemId: itemIdParam } = useParams()
  const jobId = Number(jobIdParam)
  const itemId = Number(itemIdParam)
  const valid = Number.isFinite(jobId) && jobId > 0 && Number.isFinite(itemId) && itemId > 0

  const [rows, setRows] = useState<StandardLatestCheckResult[]>([])
  const [itemMeta, setItemMeta] = useState<BatchNormativeRefItemOut | null>(null)
  const [jobMeta, setJobMeta] = useState<BatchNormativeRefJobOut | null>(null)
  const [itemStatus, setItemStatus] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<StandardLatestCheckResult | null>(null)

  const loadItem = useCallback(async () => {
    if (!valid) return
    setLoading(true)
    setLoadError(null)
    try {
      const [item, job] = await Promise.all([
        getBatchNormativeRefJobItem(jobId, itemId),
        getBatchNormativeRefJob(jobId).catch(() => null),
      ])
      setItemMeta(item)
      setJobMeta(job)
      setItemStatus(item.status)
      setRows(mapReferencesResolvedToStandardLatestResults(item.references_resolved))
    } catch (e) {
      setLoadError(getComplianceApiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [valid, jobId, itemId])

  useEffect(() => {
    void loadItem()
  }, [loadItem])

  const persistRows = async (next: StandardLatestCheckResult[]) => {
    if (!valid) return
    setSaving(true)
    try {
      const payload = standardLatestCheckResultsToReferencesResolvedPayload(next)
      const updated = await updateBatchNormativeRefJobItemReferences(jobId, itemId, payload)
      setRows(mapReferencesResolvedToStandardLatestResults(updated.references_resolved))
      setItemMeta(updated)
      message.success('已保存到服务器')
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (row: StandardLatestCheckResult) => {
    setEditingId(row.queryBzId)
    setDraft({ ...row })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const saveRow = async () => {
    if (!editingId || !draft) return
    if (!draft.queryBzId.trim()) {
      message.warning('请至少填写「企标中引用的标准号」。')
      return
    }
    const next = rows.map((row) => (row.queryBzId === editingId ? { ...draft } : row))
    setSaving(true)
    try {
      const payload = standardLatestCheckResultsToReferencesResolvedPayload(next)
      const updated = await updateBatchNormativeRefJobItemReferences(jobId, itemId, payload)
      setRows(mapReferencesResolvedToStandardLatestResults(updated.references_resolved))
      setItemMeta(updated)
      cancelEdit()
      message.success('已保存到服务器')
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const removeRow = (queryBzId: string) => {
    const next = rows.filter((row) => row.queryBzId !== queryBzId)
    if (editingId === queryBzId) cancelEdit()
    void persistRows(next)
  }

  if (!valid) {
    return <Alert type="error" message="无效的 job 或 item" />
  }

  const qbShort = pickQbShortName(itemMeta)
  const qbTitle = pickQbStandardTitle(itemMeta)
  const qbCode = pickQbCode(itemMeta)
  const company = pickCompanyForItem(itemMeta, jobMeta)
  const implRaw = pickImplementationDateText(itemMeta)
  const implDisplay = formatDateTimeLabel(implRaw)

  const qbDisplayName = qbShort || qbTitle || itemMeta?.original_filename || ''
  const fileOutcomeParsed =
    itemMeta?.status === 'completed' ? parseFileComplianceOutcome(itemMeta.file_compliance_outcome) : undefined

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Space size="large" wrap>
        <Link to={`/batch-normative-reference/${jobId}`} style={{ fontSize: 15 }}>
          返回批次
        </Link>
        <Link to="/batch-normative-reference" style={{ fontSize: 15 }}>
          规范性体检
        </Link>
      </Space>
      <Title level={3} style={{ margin: 0 }}>
        规范性引用：{qbDisplayName || `子项 #${itemId}`}
      </Title>
      {itemMeta?.status === 'completed' && fileOutcomeParsed ? (
        <Alert
          type={fileComplianceOutcomeAlertType(fileOutcomeParsed)}
          showIcon
          message={fileComplianceOutcomeLabel(fileOutcomeParsed)}
          description={fileOutcomeDescription(fileOutcomeParsed)}
        />
      ) : null}
      {itemMeta ? (
        <Card size="small" title="企标基础信息">
          <Descriptions bordered column={2} size="small" labelStyle={{ fontSize: 15 }} contentStyle={{ fontSize: 15 }}>
            <Descriptions.Item label="公司名">{displayOrDash(company)}</Descriptions.Item>
            <Descriptions.Item label="企标号">{displayOrDash(qbCode)}</Descriptions.Item>
            <Descriptions.Item label="企标名（简称）">{displayOrDash(qbShort)}</Descriptions.Item>
            <Descriptions.Item label="实施时间">{implDisplay}</Descriptions.Item>
            <Descriptions.Item label="上传文件名">{displayOrDash(itemMeta.original_filename)}</Descriptions.Item>
            <Descriptions.Item label="子项状态">{itemMeta.status}</Descriptions.Item>
            <Descriptions.Item label="排序号">{String(itemMeta.sort_order)}</Descriptions.Item>
          </Descriptions>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 8 }}>
            若上表为「—」，表示当前接口未返回该字段或值为空。整批任务由{' '}
            <code>GET /api/v1/batch-normative-reference/jobs/{'{job_id}'}</code> 与子项{' '}
            <code>.../items/{'{item_id}'}</code> 提供；公司名优先子项，缺省时使用任务级{' '}
            <code>company_name</code>。
          </Text>
        </Card>
      ) : null}
      {itemStatus && itemStatus !== 'completed' ? (
        <Alert
          type="warning"
          message={`当前子项状态为「${itemStatus}」，查新结果可能尚未就绪或已失败。`}
        />
      ) : null}
      {loadError ? <Alert type="error" message={loadError} /> : null}

      <Card size="small" loading={loading}>
        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          <Text type="secondary" style={{ fontSize: 15, lineHeight: 1.65 }}>
            表格与合规性评价向导第 4 步「引用标准有效性与更替」一致。编辑保存后将调用 PATCH 写回当前子项的
            references_resolved。
          </Text>
          <ReferenceLatestResolvedTable
            dataSource={rows}
            editingId={editingId}
            draft={draft}
            setDraft={setDraft}
            onSaveRow={saveRow}
            onCancelEdit={cancelEdit}
            onStartEdit={startEdit}
            onDeleteRow={removeRow}
            emptyText={itemStatus === 'completed' ? '本文件未解析到引用标准号' : '暂无数据'}
          />
          {saving ? <Text type="secondary">保存中…</Text> : null}
        </Space>
      </Card>
    </Space>
  )
}
