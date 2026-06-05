import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'

export default function NoveltySearchLayout() {
  return (
    <Layout style={{ minHeight: '100%', background: '#f0f2f5' }}>
      <Layout.Content style={{ padding: 24 }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
