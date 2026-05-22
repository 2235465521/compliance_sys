import { useState } from 'react'
import { Alert, Button, Card, Descriptions, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { BatchNormativeRefItemOut } from '@/types/batch-normative-ref'
import { fileComplianceOutcomeLabel, parseFileComplianceOutcome } from '@/services/compliance'
import { deleteBatchNormativeRefJob } from '@/services/batch-normative-reference'
import { useBatchNormativeRefJobPoll } from '@/pages/batch-normative-ref/hooks/useBatchNormativeRefJobPoll'
import { downloadBatchNormativeRefJobReferencesXlsx } from '@/pages/batch-normative-ref/exportJobReferencesCsv'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'

const { Title, Text } = Typography

export default function BatchJobDetailPage() {
  const navigate = useNavigate()
  const { jobId: jobIdParam } = useParams()
  const jobId = Number(jobIdParam)
  const validId = Number.isFinite(jobId) && jobId > 0 ? jobId : null
  const { job, loading, error } = useBatchNormativeRefJobPoll(validId)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteJob = async () => {
    if (validId == null) return
    setDeleting(true)
    try {
      await deleteBatchNormativeRefJob(validId)
      message.success('已删除该批次')
      navigate('/batch-normative-reference')
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setDeleting(false)
    }
  }

  const columns: ColumnsType<BatchNormativeRefItemOut> = [
    { title: '顺序', dataIndex: 'sort_order', width: 70 },
    { title: '文件名', dataIndex: 'original_filename', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => <Tag>{s}</Tag>,
    },
    {
      title: '说明',
      key: 'err',
      ellipsis: true,
      render: (_, r) => r.error_message || '-',
    },
    {
      title: '文件合规结论',
      key: 'fileOutcome',
      width: 160,
      render: (_, r) => {
        if (r.status !== 'completed') return <Text type="secondary">—</Text>
        const o = parseFileComplianceOutcome(r.file_compliance_outcome)
        if (!o) return <Text type="secondary">—</Text>
        const color =
          o === 'compliant'
            ? 'success'
            : o === 'non_compliant'
              ? 'error'
              : o === 'undetermined'
                ? 'warning'
                : 'default'
        return <Tag color={color}>{fileComplianceOutcomeLabel(o)}</Tag>
      },
    },
    {
      title: '操作',
      key: 'op',
      width: 120,
      render: (_, r) =>
        r.status === 'completed' ? (
          <Link to={`/batch-normative-reference/${validId}/items/${r.id}`}>查看引用</Link>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ]

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Space align="center" size="large" wrap>
        <Link to="/batch-normative-reference" style={{ fontSize: 15 }}>
          返回列表
        </Link>
        {validId ? (
          <Popconfirm
            title="确定删除本批次？"
            description="删除后不可恢复，所有子项与查新结果将一并删除。"
            onConfirm={() => void handleDeleteJob()}
          >
            <Button danger loading={deleting}>
              删除本批次
            </Button>
          </Popconfirm>
        ) : null}
      </Space>
      <Title level={3} style={{ margin: 0 }}>
        批次详情 #{jobIdParam}
      </Title>

      <Alert
        type="info"
        showIcon
        message="异步处理说明"
        description={
          <span style={{ fontSize: 15, lineHeight: 1.65 }}>
            任务由后台 Celery Worker 逐文件处理；未完成时会自动刷新。请确认 Broker 与 Worker 已启动，且批量 Dify 与
            MySQL 已按手册配置。
          </span>
        }
      />

      {error ? <Alert type="error" message={error} /> : null}

      {job ? (
        <>
          <Card size="small" loading={loading}>
            <Descriptions bordered column={2} labelStyle={{ fontSize: 15 }} contentStyle={{ fontSize: 15 }}>
              <Descriptions.Item label="状态">{job.status}</Descriptions.Item>
              <Descriptions.Item label="标签">{job.label || '-'}</Descriptions.Item>
              <Descriptions.Item label="子项总数">{job.total_items}</Descriptions.Item>
              <Descriptions.Item label="已完成 / 失败">
                {job.completed_items} / {job.failed_items}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {job.created_at}
              </Descriptions.Item>
              {job.error_summary ? (
                <Descriptions.Item label="错误摘要" span={2}>
                  {job.error_summary}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <Tooltip
                title={
                  <span style={{ fontSize: 13 }}>
                    下载标准 .xlsx：「与现行主号不一致」行在「本条引用是否与现行一致」「状态」「需重点核对」列以红字加粗显示，并增加「需重点核对」列便于筛选。
                    另可用 buildBatchNormativeRefJobReferencesCsv 生成纯 CSV（含「需重点核对」与状态中的醒目标记，但无单元格颜色）。
                  </span>
                }
              >
                <Button
                  type="primary"
                  size="large"
                  disabled={!job.items.some((i) => i.status === 'completed')}
                  onClick={() => {
                    void downloadBatchNormativeRefJobReferencesXlsx(job)
                  }}
                >
                  导出本批次规范性引用结果（Excel）
                </Button>
              </Tooltip>
            </div>
          </Card>

          <Card title="文件列表" size="small">
            <Table<BatchNormativeRefItemOut>
              rowKey="id"
              size="middle"
              loading={loading}
              columns={columns}
              dataSource={job.items}
              pagination={false}
            />
          </Card>
        </>
      ) : (
        !error && <Card loading={loading}>加载中…</Card>
      )}
    </Space>
  )
}
