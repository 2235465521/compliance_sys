import { ConfigProvider, Layout } from 'antd'
import { Outlet } from 'react-router-dom'

export default function BatchNormativeRefLayout() {
  return (
    <ConfigProvider componentSize="middle">
      <Layout style={{ minHeight: '100%', background: '#f0f2f5' }}>
        <Layout.Content style={{ padding: 28 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  )
}
