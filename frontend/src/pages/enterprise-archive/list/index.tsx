import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { ProColumns } from '@ant-design/pro-components'
import { ProTable } from '@ant-design/pro-components'
import type { ActionType } from '@ant-design/pro-components'
import { App, Button, Card, Form, Input, Select, Space, Tag, Typography } from 'antd'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listEnterprises } from '@/services/enterprise-archive'
import type { Enterprise, EnterpriseStatus } from '@/types/enterprise-archive'

const STATUS_LABEL: Record<EnterpriseStatus, { text: string; color: 'success' | 'default' | 'warning' }> = {
  active: { text: '在营', color: 'success' },
  inactive: { text: '停用', color: 'default' },
  suspending: { text: '暂停', color: 'warning' },
}

const STATUS_FILTER = [
  { value: '' as const, label: '全部状态' },
  { value: 'active' as const, label: '在营' },
  { value: 'inactive' as const, label: '停用' },
  { value: 'suspending' as const, label: '暂停' },
]

export default function EnterpriseListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>(null)
  const [form] = Form.useForm<{ keyword?: string; status?: EnterpriseStatus | '' }>()
  const [applied, setApplied] = useState<{ keyword: string; status: EnterpriseStatus | '' }>({
    keyword: '',
    status: '',
  })

  const columns: ProColumns<Enterprise>[] = [
    { title: '企业名称', dataIndex: 'name', ellipsis: true, width: 200 },
    { title: '统一社会信用代码', dataIndex: 'creditCode', ellipsis: true, width: 200 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      search: false,
      render: (_, row) => {
        const m = STATUS_LABEL[row.status]
        return <Tag color={m.color}>{m.text}</Tag>
      },
    },
    { title: '联系人', dataIndex: 'contactName', width: 100, search: false },
    { title: '联系电话', dataIndex: 'contactPhone', width: 130, search: false, ellipsis: true },
    { title: '最近更新', dataIndex: 'updatedAt', valueType: 'dateTime', width: 180, search: false },
    {
      title: '操作',
      valueType: 'option',
      width: 120,
      search: false,
      render: (_, row) => [
        <Button key="open" type="link" onClick={() => navigate(`/enterprise-archive/${row.id}`)}>
          进入档案
        </Button>,
      ],
    },
  ]

  const doRequest = useCallback(
    async (params: { current?: number; pageSize?: number }) => {
      try {
        const { list, total } = await listEnterprises({
          keyword: applied.keyword,
          status: applied.status,
          page: params.current ?? 1,
          pageSize: params.pageSize ?? 10,
        })
        return { data: list, success: true, total }
      } catch {
        message.error('加载企业列表失败（Mock）')
        return { data: [], success: false, total: 0 }
      }
    },
    [applied, message],
  )

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        企业档案
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        <Typography.Text type="warning">演示数据</Typography.Text>
        ：主档与关联表为前端 Mock；企业实体 REST 以后端新接口为准。
      </Typography.Paragraph>

      <Card bordered={false} styles={{ body: { paddingBottom: 8 } }}>
        <Form
          form={form}
          layout="inline"
          initialValues={{ keyword: '', status: '' }}
          onFinish={(v) => {
            setApplied({
              keyword: (v.keyword ?? '').trim(),
              status: (v.status as EnterpriseStatus | undefined) ?? '',
            })
            setTimeout(() => actionRef.current?.reload(), 0)
          }}
          style={{ rowGap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <Form.Item label="关键字" name="keyword">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="企业名称/信用代码/联系人"
              style={{ width: 280 }}
            />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select options={STATUS_FILTER} style={{ width: 120 }} allowClear />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button
                type="link"
                htmlType="button"
                onClick={() => {
                  form.resetFields()
                  setApplied({ keyword: '', status: '' })
                  setTimeout(() => actionRef.current?.reload(), 0)
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <ProTable<Enterprise>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        options={false}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        dateFormatter="string"
        headerTitle="企业列表"
        request={doRequest}
        key={`${applied.keyword}-${applied.status}`}
        toolBarRender={() => [
          <Button key="reload" icon={<ReloadOutlined />} onClick={() => actionRef.current?.reload()}>
            刷新
          </Button>,
          <Button
            key="add"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/enterprise-archive/create')}
          >
            新建企业
          </Button>,
        ]}
        locale={{
          emptyText: (
            <Space direction="vertical" size="small" style={{ padding: '16px 0' }}>
              <Typography.Text type="secondary">暂无企业，请新建或等待导入</Typography.Text>
              <Button type="primary" onClick={() => navigate('/enterprise-archive/create')}>
                新建企业
              </Button>
            </Space>
          ),
        }}
      />
    </Space>
  )
}
