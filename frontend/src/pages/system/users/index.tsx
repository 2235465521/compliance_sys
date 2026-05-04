import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { ProTable } from '@ant-design/pro-components'
import { App, Button, Drawer, Form, Input, Modal, Select, Space, Switch, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteUser, listRoles, listUsers, saveUser } from '@/services/system'
import type { SystemRole, SystemUser, SystemUserInput } from '@/types/system'

export default function SystemUsersPage() {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>(null)
  const [form] = Form.useForm<SystemUserInput & { id?: string }>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [roleOptions, setRoleOptions] = useState<SystemRole[]>([])

  useEffect(() => {
    void listRoles().then(setRoleOptions)
  }, [])

  const roleNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of roleOptions) m.set(r.id, r.name)
    return m
  }, [roleOptions])

  const openCreate = () => {
    setEditingId(undefined)
    form.resetFields()
    form.setFieldsValue({
      username: '',
      displayName: '',
      email: '',
      roleIds: [],
      enabled: true,
    })
    setDrawerOpen(true)
  }

  const openEdit = (row: SystemUser) => {
    setEditingId(row.id)
    form.setFieldsValue({
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      email: row.email,
      roleIds: [...row.roleIds],
      enabled: row.enabled,
    })
    setDrawerOpen(true)
  }

  const columns: ProColumns<SystemUser>[] = [
    { title: '用户名', dataIndex: 'username', width: 120, ellipsis: true },
    { title: '显示名', dataIndex: 'displayName', width: 120, ellipsis: true },
    { title: '邮箱', dataIndex: 'email', ellipsis: true, search: false },
    {
      title: '角色',
      dataIndex: 'roleIds',
      search: false,
      width: 200,
      ellipsis: true,
      render: (_, row) =>
        row.roleIds.map((id) => <Tag key={id}>{roleNameMap.get(id) ?? id}</Tag>),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 90,
      search: false,
      render: (_, row) => (row.enabled ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>),
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginAt',
      width: 180,
      valueType: 'dateTime',
      search: false,
      render: (_, row) => row.lastLoginAt ?? '—',
    },
    {
      title: '操作',
      valueType: 'option',
      width: 220,
      search: false,
      render: (_, row) => [
        <Button key="edit" type="link" onClick={() => openEdit(row)}>
          编辑
        </Button>,
        <Button
          key="toggle"
          type="link"
          onClick={() => {
            const next = !row.enabled
            Modal.confirm({
              title: next ? '确认启用该用户？' : '确认禁用该用户？',
              onOk: async () => {
                await saveUser(row.id, {
                  username: row.username,
                  displayName: row.displayName,
                  email: row.email,
                  roleIds: row.roleIds,
                  enabled: next,
                })
                message.success(next ? '已启用' : '已禁用')
                actionRef.current?.reload()
              },
            })
          }}
        >
          {row.enabled ? '禁用' : '启用'}
        </Button>,
        <Button
          key="del"
          type="link"
          danger
          onClick={() => {
            Modal.confirm({
              title: '删除用户',
              content: `确定删除用户「${row.username}」？此操作为演示，无后端持久化。`,
              okText: '删除',
              okButtonProps: { danger: true },
              onOk: async () => {
                await deleteUser(row.id)
                message.success('已删除')
                actionRef.current?.reload()
              },
            })
          }}
        >
          删除
        </Button>,
      ],
    },
  ]

  const doRequest = useCallback(async () => {
    try {
      const list = await listUsers()
      return { data: list, success: true, total: list.length }
    } catch {
      message.error('加载用户失败（Mock）')
      return { data: [], success: false, total: 0 }
    }
  }, [message])

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        用户管理
      </Typography.Title>

      <ProTable<SystemUser>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        options={false}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        dateFormatter="string"
        headerTitle="用户列表"
        request={doRequest}
        toolBarRender={() => [
          <Button key="reload" icon={<ReloadOutlined />} onClick={() => actionRef.current?.reload()}>
            刷新
          </Button>,
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建用户
          </Button>,
        ]}
      />

      <Drawer
        title={editingId ? '编辑用户' : '新建用户'}
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        footer={
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button
              type="primary"
              onClick={async () => {
                try {
                  const v = await form.validateFields()
                  await saveUser(editingId, {
                    username: v.username,
                    displayName: v.displayName,
                    email: v.email,
                    roleIds: v.roleIds ?? [],
                    enabled: v.enabled ?? true,
                  })
                  message.success(editingId ? '已保存' : '已创建')
                  setDrawerOpen(false)
                  actionRef.current?.reload()
                } catch {
                  /* validate */
                }
              }}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="登录名" disabled={!!editingId} />
          </Form.Item>
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }]}>
            <Input type="email" />
          </Form.Item>
          <Form.Item name="roleIds" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              mode="multiple"
              placeholder="选择角色"
              options={roleOptions.map((r) => ({ value: r.id, label: `${r.name}（${r.code}）` }))}
            />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  )
}
