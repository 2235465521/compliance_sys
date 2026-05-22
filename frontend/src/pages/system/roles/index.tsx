import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { ProTable } from '@ant-design/pro-components'
import { App, Button, Drawer, Form, Input, Modal, Space, Tree, Typography } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { useCallback, useMemo, useRef, useState } from 'react'
import { deleteRole, listRoles, saveRole } from '@/services/system'
import { ALL_PERMISSION_LEAF_KEYS, PERMISSION_TREE } from '@/stores/system'
import type { PermissionTreeNode, SystemRole, SystemRoleInput } from '@/types/system'

function toTreeData(nodes: PermissionTreeNode[]): DataNode[] {
  return nodes.map((n) => ({
    title: n.title,
    key: n.key,
    children: n.children?.length ? toTreeData(n.children) : undefined,
  }))
}

export default function SystemRolesPage() {
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>(null)
  const [form] = Form.useForm<SystemRoleInput & { id?: string }>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [checkedKeys, setCheckedKeys] = useState<string[]>([])

  const treeData = useMemo(() => toTreeData(PERMISSION_TREE), [])

  const openCreate = () => {
    setEditingId(undefined)
    form.resetFields()
    form.setFieldsValue({ code: '', name: '', permissionKeys: [] })
    setCheckedKeys([])
    setDrawerOpen(true)
  }

  const openEdit = (row: SystemRole) => {
    setEditingId(row.id)
    form.setFieldsValue({
      id: row.id,
      code: row.code,
      name: row.name,
      permissionKeys: [...row.permissionKeys],
    })
    setCheckedKeys([...row.permissionKeys])
    setDrawerOpen(true)
  }

  const columns: ProColumns<SystemRole>[] = [
    { title: '角色编码', dataIndex: 'code', width: 160, ellipsis: true },
    { title: '角色名称', dataIndex: 'name', ellipsis: true },
    {
      title: '权限项数',
      dataIndex: 'permissionKeys',
      width: 110,
      search: false,
      render: (_, row) => row.permissionKeys.length,
    },
    {
      title: '操作',
      valueType: 'option',
      width: 160,
      search: false,
      render: (_, row) => [
        <Button key="edit" type="link" onClick={() => openEdit(row)}>
          编辑
        </Button>,
        <Button
          key="del"
          type="link"
          danger
          onClick={() => {
            Modal.confirm({
              title: '删除角色',
              content: `确定删除角色「${row.name}」？若后端存在引用将返回错误（此处为演示）。`,
              okText: '删除',
              okButtonProps: { danger: true },
              onOk: async () => {
                try {
                  await deleteRole(row.id)
                  message.success('已删除')
                  actionRef.current?.reload()
                } catch (e) {
                  message.error(e instanceof Error ? e.message : '删除失败')
                }
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
      const list = await listRoles()
      return { data: list, success: true, total: list.length }
    } catch {
      message.error('加载角色失败（Mock）')
      return { data: [], success: false, total: 0 }
    }
  }, [message])

  const leafFilter = (keys: string[]) => keys.filter((k) => ALL_PERMISSION_LEAF_KEYS.includes(k))

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        角色与权限
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        权限以树形勾选绑定到角色；保存时仅保留叶子权限 key。后端若返回业务规则错误，可在表单区展示 message。
      </Typography.Paragraph>

      <ProTable<SystemRole>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        options={false}
        pagination={{ pageSize: 10 }}
        headerTitle="角色列表"
        request={doRequest}
        toolBarRender={() => [
          <Button key="reload" icon={<ReloadOutlined />} onClick={() => actionRef.current?.reload()}>
            刷新
          </Button>,
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建角色
          </Button>,
        ]}
      />

      <Drawer
        title={editingId ? '编辑角色' : '新建角色'}
        width={520}
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
                  const keys = leafFilter(checkedKeys.length ? checkedKeys : (v.permissionKeys ?? []))
                  await saveRole(editingId, {
                    code: v.code,
                    name: v.name,
                    permissionKeys: keys,
                  })
                  message.success(editingId ? '已保存' : '已创建')
                  setDrawerOpen(false)
                  actionRef.current?.reload()
                } catch (e) {
                  if (e && typeof e === 'object' && 'errorFields' in e) return
                  message.error(e instanceof Error ? e.message : '保存失败')
                }
              }}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="角色编码" rules={[{ required: true, message: '请输入编码' }]}>
            <Input placeholder="如 operator" disabled={!!editingId} />
          </Form.Item>
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="权限" required>
            <Tree
              checkable
              defaultExpandAll
              treeData={treeData}
              checkedKeys={checkedKeys}
              onCheck={(k) => {
                const keys = Array.isArray(k) ? k : k.checked
                setCheckedKeys(keys as string[])
              }}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  )
}
