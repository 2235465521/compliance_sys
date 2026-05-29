import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Descriptions, Input, Modal, Popconfirm, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import {
  IndexContentEditor,
  IndexContentReadView,
} from '@/pages/compliance/components/NationalIndicatorIndexContent'
import {
  buildNationalIndicatorRecordView,
  cloneIndexEntries,
  createEmptyIndexEntry,
  type IndexContentEdit,
  type NationalIndicatorRecordView,
  type ParsedNationalIndexEntry,
  serializeIndexesToPayload,
} from '@/pages/compliance/utils/parseNationalIndicatorValue'
import {
  fetchNationalIndicatorDetail,
  reviewNationalIndicatorForStd,
  saveNationalIndicatorIndexes,
} from '@/services/compliance'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'
import type { NationalIndicatorListOut } from '@/types/compliance-api'

function reviewStatusTag(status: NationalIndicatorRecordView['manualReviewStatus']) {
  if (status === 'approved') return <Tag color="success">已审核通过</Tag>
  if (status === 'rejected') return <Tag color="error">已驳回</Tag>
  if (status === 'pending') return <Tag color="warning">待审核</Tag>
  return <Tag>未知</Tag>
}

function validateIndexContent(content: IndexContentEdit): string | null {
  if (content.mode === 'plain') return null
  const filled = content.pairs.filter((p) => p.key.trim() || p.value.trim())
  if (filled.length === 0) return null
  const missingKey = filled.some((p) => p.value.trim() && !p.key.trim())
  if (missingKey) return '键值对模式下，填写了「要求/限值」时请同时填写「项目」'
  return null
}

export type NationalIndicatorReviewModalProps = {
  open: boolean
  stdCode: string | null
  taskId: number | null
  cachedRows?: unknown[]
  onClose: () => void
  onReviewed: () => void
}

export function NationalIndicatorReviewModal(props: NationalIndicatorReviewModalProps) {
  const { open, stdCode, taskId, cachedRows, onClose, onReviewed } = props
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editIndexes, setEditIndexes] = useState<ParsedNationalIndexEntry[]>([])
  const [apiOut, setApiOut] = useState<NationalIndicatorListOut | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    if (!open || !stdCode?.trim() || taskId == null) return
    setLoading(true)
    setError(null)
    try {
      const out = await fetchNationalIndicatorDetail(taskId, stdCode.trim(), cachedRows)
      setApiOut(out)
    } catch (e) {
      setError(getComplianceApiErrorMessage(e))
      setApiOut(null)
    } finally {
      setLoading(false)
    }
  }, [open, stdCode, taskId, cachedRows])

  useEffect(() => {
    if (open) {
      void loadDetail()
    } else {
      setApiOut(null)
      setError(null)
      setIsEditing(false)
      setEditIndexes([])
    }
  }, [open, loadDetail])

  const recordView = useMemo((): NationalIndicatorRecordView | null => {
    if (!stdCode?.trim()) return null
    if (apiOut?.rows?.length) {
      const rows = apiOut.rows.map((r) => ({
        id: r.id,
        std_code: r.std_code,
        specific_indicator_value: r.specific_indicator_value,
        manual_review_status: r.manual_review_status,
      }))
      return buildNationalIndicatorRecordView(stdCode, rows)
    }
    return buildNationalIndicatorRecordView(stdCode, cachedRows)
  }, [apiOut, cachedRows, stdCode])

  const canEdit = Boolean(recordView) && !loading

  const startEdit = () => {
    if (!recordView) return
    const cloned = cloneIndexEntries(recordView.indexes)
    setEditIndexes(cloned.length > 0 ? cloned : [createEmptyIndexEntry()])
    setIsEditing(true)
    setError(null)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditIndexes([])
  }

  const updateEditRow = (key: string, patch: Partial<ParsedNationalIndexEntry>) => {
    setEditIndexes((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const addIndexRow = () => {
    setEditIndexes((prev) => [...prev, createEmptyIndexEntry()])
  }

  const removeIndexRow = (key: string) => {
    setEditIndexes((prev) => prev.filter((row) => row.key !== key))
  }

  const handleSave = async () => {
    if (!stdCode?.trim() || taskId == null || editIndexes.length === 0) return
    const hasEmptyName = editIndexes.some((row) => !row.indexName.trim())
    if (hasEmptyName) {
      setError('请填写每条指标的「指标名称」')
      return
    }
    for (const row of editIndexes) {
      const contentErr = validateIndexContent(row.indexContent)
      if (contentErr) {
        setError(`「${row.indexName || '未命名'}」：${contentErr}`)
        return
      }
    }
    try {
      setSaving(true)
      setError(null)
      const payload = serializeIndexesToPayload(editIndexes)
      await saveNationalIndicatorIndexes(taskId, stdCode.trim(), payload)
      setIsEditing(false)
      setEditIndexes([])
      onReviewed()
      await loadDetail()
    } catch (e) {
      setError(getComplianceApiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async () => {
    if (!stdCode?.trim() || taskId == null) return
    try {
      setSubmitting(true)
      setError(null)
      await reviewNationalIndicatorForStd(taskId, stdCode.trim(), 'approved')
      onReviewed()
      await loadDetail()
    } catch (e) {
      setError(getComplianceApiErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const isPending = recordView?.manualReviewStatus === 'pending' || recordView?.manualReviewStatus == null
  const tableData = isEditing ? editIndexes : (recordView?.indexes ?? [])
  const busy = submitting || saving

  const readColumns: ColumnsType<ParsedNationalIndexEntry> = [
    {
      title: '指标名称',
      dataIndex: 'indexName',
      key: 'indexName',
      width: 120,
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'indexType',
      key: 'indexType',
      width: 88,
      ellipsis: true,
    },
    {
      title: '指标内容',
      key: 'indexContent',
      render: (_, row) => <IndexContentReadView content={row.indexContent} />,
    },
  ]

  const editColumns: ColumnsType<ParsedNationalIndexEntry> = [
    {
      title: '指标名称',
      key: 'indexName',
      width: 108,
      render: (_, row) => (
        <Input
          size="small"
          value={row.indexName}
          placeholder="必填"
          onChange={(e) => updateEditRow(row.key, { indexName: e.target.value })}
        />
      ),
    },
    {
      title: '类型',
      key: 'indexType',
      width: 80,
      render: (_, row) => (
        <Input
          size="small"
          value={row.indexType}
          placeholder="如：具体值"
          onChange={(e) => updateEditRow(row.key, { indexType: e.target.value })}
        />
      ),
    },
    {
      title: '指标内容',
      key: 'indexContent',
      render: (_, row) => (
        <IndexContentEditor
          value={row.indexContent}
          onChange={(next) => updateEditRow(row.key, { indexContent: next })}
        />
      ),
    },
    {
      title: '',
      key: 'action',
      width: 36,
      fixed: 'right',
      render: (_, row) => (
        <Popconfirm
          title="删除该条指标？"
          onConfirm={() => removeIndexRow(row.key)}
          okText="删除"
          cancelText="取消"
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="删除" />
        </Popconfirm>
      ),
    },
  ]

  return (
    <Modal
      title={stdCode ? `国标指标明细 · ${stdCode}` : '国标指标明细'}
      open={open}
      onCancel={onClose}
      width={isEditing ? 920 : 760}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose} disabled={busy}>
            关闭
          </Button>
          {isEditing ? (
            <>
              <Button onClick={cancelEdit} disabled={busy}>
                取消编辑
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                disabled={editIndexes.length === 0}
                onClick={() => void handleSave()}
              >
                保存
              </Button>
            </>
          ) : (
            <>
              <Button icon={<EditOutlined />} disabled={!canEdit} onClick={startEdit}>
                编辑
              </Button>
              {isPending ? (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={submitting}
                  onClick={() => void handleApprove()}
                >
                  审核通过
                </Button>
              ) : null}
            </>
          )}
        </Space>
      }
    >
      {error ? (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />
      ) : null}
      {isEditing ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="指标内容请按「项目 + 要求/限值」填写；引用类整段描述可切换为「整段描述」。保存时由系统自动组装 JSON，无需手写引号或花括号。"
        />
      ) : null}
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="标准号">{stdCode ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="标准名称">{apiOut?.std_name?.trim() || '—'}</Descriptions.Item>
        <Descriptions.Item label="审核状态" span={2}>
          {reviewStatusTag(recordView?.manualReviewStatus ?? null)}
        </Descriptions.Item>
        <Descriptions.Item label="解析指标条数" span={2}>
          {tableData.length} 条（来自工作流② indexes JSON）
        </Descriptions.Item>
      </Descriptions>
      {isPending && !isEditing ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="解析入库后为「待审核」状态，审核通过后该标准方可参与后续技术指标对比编排。"
        />
      ) : null}
      <Table
        size="small"
        rowKey="key"
        loading={loading}
        columns={isEditing ? editColumns : readColumns}
        dataSource={tableData}
        pagination={
          !isEditing && tableData.length > 8
            ? { pageSize: 8, size: 'small', showSizeChanger: false }
            : false
        }
        locale={{ emptyText: loading ? '加载中…' : '暂无解析出的指标条目' }}
        scroll={{ y: 360, x: isEditing ? 860 : undefined }}
      />
      {isEditing ? (
        <Button
          type="dashed"
          block
          icon={<PlusOutlined />}
          style={{ marginTop: 12 }}
          onClick={addIndexRow}
        >
          添加指标
        </Button>
      ) : null}
    </Modal>
  )
}
