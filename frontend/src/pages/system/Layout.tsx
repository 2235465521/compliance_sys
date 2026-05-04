import { Layout, Select, Space, Tabs, Typography } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSystemStore } from '@/stores/system'
import type { SystemViewerRole } from '@/types/system'

const VIEWER_OPTIONS: { value: SystemViewerRole; label: string }[] = [
  { value: 'super_admin', label: '超级管理员' },
  { value: 'operator', label: '操作兼审核员' },
]

export default function SystemLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const viewerRole = useSystemStore((s) => s.viewerRole)
  const setViewerRole = useSystemStore((s) => s.setViewerRole)
  const isSuper = viewerRole === 'super_admin'

  const segs = location.pathname.split('/').filter(Boolean)
  const last = segs[segs.length - 1] ?? 'users'
  const activeKey =
    last === 'system' ? 'users' : last === 'users' || last === 'roles' || last === 'audit-log' ? last : 'users'

  const tabItems = [
    { key: 'users', label: '用户管理' },
    { key: 'roles', label: '角色与权限' },
    ...(isSuper ? [{ key: 'audit-log', label: '审计日志' }] : []),
  ]

  return (
    <Layout style={{ minHeight: '100%', background: '#f0f2f5' }}>
      <Layout.Content style={{ padding: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space align="center" style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              系统安全与审计
            </Typography.Title>
            <Space align="center" wrap>
              <Typography.Text type="secondary">演示视角（仅 Mock）</Typography.Text>
              <Select
                size="small"
                style={{ width: 140 }}
                value={viewerRole}
                options={VIEWER_OPTIONS}
                onChange={(v) => setViewerRole(v)}
              />
            </Space>
          </Space>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            <Typography.Text type="warning">演示数据</Typography.Text>
            ：用户、角色与审计为前端 Mock；与《后端接口说明文档》中 Dify/指标
            <Typography.Text code>/api/audit/*</Typography.Text>
            业务审核台无关。
          </Typography.Paragraph>
          <Tabs
            activeKey={activeKey === 'audit-log' && !isSuper ? 'users' : activeKey}
            items={tabItems}
            onChange={(key) => navigate(`/system/${key}`)}
          />
          <Outlet />
        </Space>
      </Layout.Content>
    </Layout>
  )
}
