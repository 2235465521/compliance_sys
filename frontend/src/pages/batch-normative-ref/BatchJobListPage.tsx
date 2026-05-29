import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Popconfirm, Space, Table, Typography, Upload, message } from 'antd'
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
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'
import {
  getLastBatchNormativeRefJobId,
  rememberLastBatchNormativeRefJobId,
} from '@/pages/batch-normative-ref/session'
import PendingUploadFileList from '@/pages/batch-normative-ref/components/PendingUploadFileList'
import {
  commitBatchLabelAfterSuccessfulCreate,
  getLabelForNextCreate,
} from '@/pages/batch-normative-ref/batchLabelSeq'

const { Title, Text } = Typography

export default function BatchJobListPage() {
  const navigate = useNavigate()
  const [pendingFileList, setPendingFileList] = useState<UploadFile[]>([])
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [list, setList] = useState<BatchNormativeRefJobSummary[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listHint, setListHint] = useState<string | null>(null)

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
    const files = pendingFileList
      .map((f) => f.originFileObj)
      .filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      message.warning('请至少选择一个企标文件')
      return
    }
    const label = getLabelForNextCreate()
    setCreating(true)
    try {
      const job = await createBatchNormativeRefJob(files, label)
      commitBatchLabelAfterSuccessfulCreate()
      rememberLastBatchNormativeRefJobId(job.id)
      message.success(`已创建批量任务（${label}）`)
      setPendingFileList([])
      void loadList()
      navigate(`/batch-normative-reference/${job.id}`)
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteBatchNormativeRefJob(id)
      message.success('已删除该批次')
      void loadList()
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
    }
  }

  const lastId = getLastBatchNormativeRefJobId()

  const columns: ColumnsType<BatchNormativeRefJobSummary> = [
    { title: 'ID', dataIndex: 'id', width: 90 },
    { title: '批次标签', dataIndex: 'label', ellipsis: true, render: (v) => v || '-' },
    { title: '状态', dataIndex: 'status', width: 110 },
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
          <Popconfirm title="确定删除该批次？" description="删除后不可恢复。" onConfirm={() => void handleDelete(r.id)}>
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
          批量合规性评价
        </Title>
        <Text type="secondary" style={{ fontSize: 15, lineHeight: 1.7 }}>
          上传多个企标文件，按批次查看规范性引用查新结果；与「合规性评价」向导任务相互独立。批次标签将按「批次
          1、批次 2…」在本机自动递增。
        </Text>
      </div>

      {listHint ? (
        <Alert
          type="warning"
          showIcon
          message="批次列表暂不可用"
          description={
            <span style={{ fontSize: 15 }}>
              {listHint}
              {lastId ? (
                <span>
                  {' '}
                  可尝试
                  <Link to={`/batch-normative-reference/${lastId}`}>
                    {' '}
                    打开最近一次创建的任务（#{lastId}）
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
          <Text type="secondary" style={{ fontSize: 15 }}>
            下次创建将使用标签：<Text strong>{getLabelForNextCreate()}</Text>
          </Text>
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
            创建批量任务并上传
          </Button>
        </Space>
      </Card>

      <Card title="批次列表" size="small">
        <Table<BatchNormativeRefJobSummary>
          rowKey="id"
          size="middle"
          loading={listLoading}
          columns={columns}
          dataSource={list}
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
          locale={{ emptyText: listHint ? '无数据' : '暂无批次记录' }}
        />
      </Card>
    </Space>
  )
}
