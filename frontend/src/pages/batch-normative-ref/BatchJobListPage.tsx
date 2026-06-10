import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Input, Popconfirm, Space, Table, Tag, Typography, Upload, message } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import { InboxOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { Link, useNavigate } from 'react-router-dom'
import type { BatchNormativeRefJobSummary } from '@/types/batch-normative-ref'
import {
  createBatchNormativeRefJob,
  deleteBatchNormativeRefJob,
  listBatchNormativeRefJobs,
} from '@/services/batch-normative-reference'
import { createBatchIndicatorCompareJob } from '@/services/batch-indicator-compare'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'
import PendingUploadFileList from '@/pages/batch-normative-ref/components/PendingUploadFileList'
import { batchJobStatusMeta } from '@/pages/batch-normative-ref/batchStatusLabels'
import {
  BATCH_JOB_LABEL_MAX_LEN,
  displayBatchJobLabel,
  getLastBatchNormativeRefJobId,
  getLastBatchNormativeRefJobLabel,
  rememberLastBatchNormativeRefJob,
} from '@/pages/batch-normative-ref/session'

const { Title, Text } = Typography

export default function BatchJobListPage() {
  const navigate = useNavigate()
  const [taskName, setTaskName] = useState('')
  const [pendingFileList, setPendingFileList] = useState<UploadFile[]>([])
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [list, setList] = useState<BatchNormativeRefJobSummary[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listHint, setListHint] = useState<string | null>(null)
  const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([])
  const [startingCompare, setStartingCompare] = useState(false)

  const loadList = useCallback(async () => {
    setListLoading(true)
    setListHint(null)
    try {
      const res = await listBatchNormativeRefJobs({ page, page_size: pageSize })
      setList(res.results)
      setTotal(res.total)
    } catch (e) {
      const msg = getComplianceApiErrorMessage(e)
      setList([])
      setTotal(0)
      setListHint(msg)
    } finally {
      setListLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleCreate = async () => {
    const label = taskName.trim()
    if (!label) {
      message.warning('请填写本次体检任务名称')
      return
    }
    if (label.length > BATCH_JOB_LABEL_MAX_LEN) {
      message.warning(`任务名称不能超过 ${BATCH_JOB_LABEL_MAX_LEN} 个字符`)
      return
    }
    const files = pendingFileList
      .map((f) => f.originFileObj)
      .filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      message.warning('请至少选择一个企标文件')
      return
    }
    setCreating(true)
    try {
      const job = await createBatchNormativeRefJob(files, label)
      rememberLastBatchNormativeRefJob(job.id, label)
      message.success(`已创建规范性体检任务「${label}」`)
      setTaskName('')
      setPendingFileList([])
      void loadList()
      navigate(`/batch-normative-reference/${job.id}`)
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setCreating(false)
    }
  }

  const handleStartIndicatorCompare = async () => {
    if (selectedBatchIds.length === 0) {
      message.warning('请先勾选已完成的体检批次')
      return
    }
    setStartingCompare(true)
    let firstJobId: number | null = null
    let ok = 0
    try {
      for (const batchId of selectedBatchIds) {
        const row = list.find((r) => r.id === batchId)
        const label = row?.label?.trim()
          ? `${row.label.trim()} · 指标对比`
          : `体检批次 #${batchId} 指标对比`
        const job = await createBatchIndicatorCompareJob({
          source_batch_job_id: batchId,
          label,
        })
        if (firstJobId == null) firstJobId = job.id
        ok += 1
      }
      message.success(`已创建 ${ok} 个指标对比任务`)
      setSelectedBatchIds([])
      if (ok === 1 && firstJobId != null) {
        navigate(`/batch-normative-reference/indicator-compare/${firstJobId}`)
      } else {
        navigate('/batch-normative-reference/indicator-compare')
      }
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setStartingCompare(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteBatchNormativeRefJob(id)
      message.success('已删除该任务')
      void loadList()
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    }
  }

  const lastId = getLastBatchNormativeRefJobId()
  const lastLabel = getLastBatchNormativeRefJobLabel()

  const columns: ColumnsType<BatchNormativeRefJobSummary> = [
    {
      title: '任务名称',
      dataIndex: 'label',
      ellipsis: true,
      render: (v: string | null) => displayBatchJobLabel(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => {
        const meta = batchJobStatusMeta(status)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '进度',
      key: 'prog',
      width: 160,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 15 }}>
          {r.completed_items ?? 0}/{r.total_items ?? 0} 完成
          {(r.failed_items ?? 0) > 0 ? `，失败 ${r.failed_items}` : ''}
        </Text>
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', width: 200, ellipsis: true },
    {
      title: '操作',
      key: 'op',
      width: 180,
      render: (_, r) => (
        <Space size="middle">
          <Link to={`/batch-normative-reference/${r.id}`}>进入</Link>
          <Popconfirm title="确定删除该任务？" description="删除后不可恢复。" onConfirm={() => void handleDelete(r.id)}>
            <Button type="link" danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 8 }}>
          规范性体检
        </Title>
        <Text type="secondary" style={{ fontSize: 15, lineHeight: 1.7 }}>
          上传多个企标文件，按批次完成规范性引用查新；与「合规性评价」向导相互独立。创建批次时请填写本次任务名称。
          体检完成后可勾选批次发起「技术指标对比」，或在
          <Link to="/batch-normative-reference/indicator-compare"> 指标对比记录 </Link>
          中查看留痕。
        </Text>
      </div>

      {listHint ? (
        <Alert
          type="warning"
          showIcon
          message="任务列表暂不可用"
          description={
            <span style={{ fontSize: 15 }}>
              {listHint}
              {lastId ? (
                <span>
                  {' '}
                  可尝试
                  <Link to={`/batch-normative-reference/${lastId}`}>
                    {' '}
                    打开最近一次创建的任务
                    {lastLabel ? `「${lastLabel}」` : ''}
                  </Link>
                  。
                </span>
              ) : null}
            </span>
          }
        />
      ) : null}

      <Card title="新建批次" size="small">
        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          <div>
            <Text style={{ fontSize: 15 }}>任务名称</Text>
            <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>
            <Input
              style={{ marginTop: 8 }}
              placeholder="请输入本次体检任务名称，例如：2026 年第 1 批企标体检"
              value={taskName}
              maxLength={BATCH_JOB_LABEL_MAX_LEN}
              showCount
              onChange={(e) => setTaskName(e.target.value)}
              onPressEnter={() => void handleCreate()}
            />
          </div>
          <Upload.Dragger
            multiple
            fileList={pendingFileList}
            showUploadList={false}
            beforeUpload={(file) => {
              setPendingFileList((prev) => [
                ...prev,
                {
                  uid: `pending-${file.uid}-${prev.length}-${Date.now()}`,
                  name: file.name,
                  size: file.size,
                  status: 'done',
                  originFileObj: file,
                },
              ])
              return false
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 16 }}>
              点击或拖拽文件到此处
            </p>
            <p className="ant-upload-hint" style={{ fontSize: 14 }}>
              支持多文件；字段名与后端约定为 files。
            </p>
          </Upload.Dragger>
          <PendingUploadFileList
            files={pendingFileList}
            onRemove={(uid) => setPendingFileList((prev) => prev.filter((f) => f.uid !== uid))}
            onClearAll={() => setPendingFileList([])}
          />
          <Button type="primary" size="large" loading={creating} onClick={() => void handleCreate()}>
            创建体检批次并上传
          </Button>
        </Space>
      </Card>

      <Card
        title="任务列表"
        size="small"
        extra={
          <Space wrap>
            <Button
              type="primary"
              disabled={selectedBatchIds.length === 0}
              loading={startingCompare}
              onClick={() => void handleStartIndicatorCompare()}
            >
              对选中批次发起指标对比
            </Button>
            <Link to="/batch-normative-reference/indicator-compare">
              <Button>指标对比记录</Button>
            </Link>
          </Space>
        }
      >
        <Table<BatchNormativeRefJobSummary>
          rowKey="id"
          size="middle"
          loading={listLoading}
          columns={columns}
          dataSource={list}
          rowSelection={{
            selectedRowKeys: selectedBatchIds,
            onChange: (keys) => setSelectedBatchIds(keys.map((k) => Number(k))),
            getCheckboxProps: (record) => ({
              disabled: record.status !== 'completed',
            }),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps ?? 20)
            },
          }}
          locale={{ emptyText: listHint ? '无数据' : '暂无任务记录' }}
        />
      </Card>
    </Space>
  )
}
