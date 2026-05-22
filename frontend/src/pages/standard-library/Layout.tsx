import { Layout } from 'antd'
import { useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

const menuKeys = [
  { key: '/standard-library/registry', label: '标准入库与查询' },
  { key: '/standard-library/lineage', label: '标准谱系' },
  { key: '/standard-library/body', label: '国标正文入库' },
  { key: '/standard-library/index-ingest', label: '国标指标入库' },
  { key: '/standard-library/taxonomy', label: '行业分类体系' },
] as const

/** 与标准库子页统一的主色 */
const NAV = {
  primary: '#002854',
  trackBg: 'linear-gradient(180deg, #eef2f6 0%, #e6eaef 100%)',
  trackBorder: 'rgba(15, 23, 42, 0.08)',
  inactive: '#64748b',
  focusRing: '#002854',
}

export default function StandardLibraryLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = useMemo(() => {
    const p = location.pathname
    if (p === '/standard-library' || p === '/standard-library/') {
      return '/standard-library/registry'
    }
    return p
  }, [location.pathname])

  return (
    <Layout style={{ minHeight: '100%', background: '#fff' }}>
      <style>{`
        .sl-module-tab:focus-visible {
          outline: 2px solid ${NAV.focusRing};
          outline-offset: 2px;
        }
        .sl-module-tab:not([aria-selected="true"]):hover {
          color: #334155 !important;
          background: rgba(255, 255, 255, 0.45) !important;
        }
      `}</style>
      <Layout.Header
        style={{
          background: '#fff',
          padding: '14px 24px 12px',
          height: 'auto',
          lineHeight: 1.35,
          borderBottom: '1px solid #eef1f4',
        }}
      >
        <nav aria-label="标准库模块" role="tablist" style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              padding: 5,
              background: NAV.trackBg,
              borderRadius: 14,
              border: `1px solid ${NAV.trackBorder}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
            }}
          >
            {menuKeys.map((item) => {
              const selected = selectedKey === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  id={`sl-tab-${item.key.replace(/\//g, '-')}`}
                  className="sl-module-tab"
                  onClick={() => navigate(item.key)}
                  style={{
                    flex: '1 1 132px',
                    minHeight: 46,
                    padding: '11px 16px',
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 15,
                    fontWeight: selected ? 600 : 500,
                    letterSpacing: selected ? '-0.01em' : 0,
                    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
                    color: selected ? NAV.primary : NAV.inactive,
                    background: selected ? '#ffffff' : 'transparent',
                    boxShadow: selected ? '0 1px 4px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05)' : 'none',
                    transition: 'color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease',
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </nav>
      </Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
