import { Layout } from 'antd'
import { Outlet, useLocation } from 'react-router-dom'

export default function EnterpriseArchiveLayout() {
  const location = useLocation()
  const p = location.pathname
  const segs = p.split('/').filter(Boolean)
  const isDetail = segs[0] === 'enterprise-archive' && segs.length === 2 && segs[1] !== 'create'

  if (isDetail) {
    return (
      <Layout style={{ minHeight: '100%', background: '#f8fafc' }}>
        <Layout.Content style={{ padding: 0 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    )
  }

  return (
    <Layout style={{ minHeight: '100%', background: '#f0f2f5' }}>
      <Layout.Content style={{ padding: 24 }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
