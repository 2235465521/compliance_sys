import { Layout } from 'antd'
import { Outlet, useLocation } from 'react-router-dom'

export default function NoveltySearchLayout() {
  const location = useLocation()
  const onTaskDetail = location.pathname.startsWith('/novelty-search/tasks/')

  if (onTaskDetail) {
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
