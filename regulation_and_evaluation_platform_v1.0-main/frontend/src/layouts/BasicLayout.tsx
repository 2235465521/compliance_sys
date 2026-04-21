import { ProLayout } from '@ant-design/pro-components'
import { Link, Outlet, useLocation } from 'react-router-dom'
import siafLogo from '@/assets/siaf-logo.png'
import { rootRoute } from '@/routes/menu'

export default function BasicLayout() {
  const location = useLocation()

  return (
    <ProLayout
      logo={
        <img
          src={siafLogo}
          alt="福建省标准化服务行业协会"
          style={{ height: 32, width: 32, objectFit: 'contain' }}
        />
      }
      title="标准化信息服务平台"
      route={rootRoute}
      location={location}
      menuItemRender={(item, dom) =>
        item.path ? <Link to={item.path}>{dom}</Link> : dom
      }
      footerRender={() => null}
    >
      <Outlet />
    </ProLayout>
  )
}
