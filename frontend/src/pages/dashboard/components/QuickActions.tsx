import { useNavigate } from 'react-router-dom'
import {
  AuditOutlined,
  FileSearchOutlined,
  BlockOutlined,
  DatabaseOutlined,
  AlertOutlined,
  BankOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

interface ActionItem {
  title: string
  desc: string
  icon: ReactNode
  path: string
  color: string
  bg: string
}

const ACTIONS: ActionItem[] = [
  {
    title: '合规性评价',
    desc: '引用标准有效性一键检测',
    icon: <AuditOutlined />,
    path: '/compliance',
    color: '#4299e1',
    bg: 'linear-gradient(135deg, #ebf8ff 0%, #e6f0ff 100%)',
  },
  {
    title: '查新服务',
    desc: '立项意图语义查新分析',
    icon: <FileSearchOutlined />,
    path: '/novelty-search',
    color: '#48bb78',
    bg: 'linear-gradient(135deg, #f0fff4 0%, #e8f8f0 100%)',
  },
  {
    title: '查重服务',
    desc: '字面 + 高维语义双重查重',
    icon: <BlockOutlined />,
    path: '/duplicate-check',
    color: '#9f7aea',
    bg: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
  },
  {
    title: '标准库管理',
    desc: '全文检索与溯源分析',
    icon: <DatabaseOutlined />,
    path: '/standard-library',
    color: '#ed8936',
    bg: 'linear-gradient(135deg, #fffaf0 0%, #fff3e0 100%)',
  },
  {
    title: '预警系统',
    desc: '查看全部级联废止预警',
    icon: <AlertOutlined />,
    path: '/alert',
    color: '#e53e3e',
    bg: 'linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%)',
  },
  {
    title: '企业档案',
    desc: '企业标准信息档案管理',
    icon: <BankOutlined />,
    path: '/enterprise-archive',
    color: '#718096',
    bg: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)',
  },
]

/** 横向顶部胶囊导航栏 (Proposal 3) */
export default function QuickActions() {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
      {ACTIONS.map((action) => (
        <div
          key={action.path}
          role="button"
          tabIndex={0}
          title={action.desc}
          onClick={() => navigate(action.path)}
          onKeyDown={(e) => e.key === 'Enter' && navigate(action.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 24, // 胶囊圆角
            background: '#ffffff',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLDivElement
            el.style.transform = 'translateY(-2px)'
            el.style.borderColor = action.color
            el.style.boxShadow = `0 4px 12px ${action.color}20`
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLDivElement
            el.style.transform = 'translateY(0)'
            el.style.borderColor = '#e2e8f0'
            el.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)'
          }}
        >
          {/* 图标 */}
          <div style={{ color: action.color, fontSize: 16, display: 'flex', alignItems: 'center' }}>
            {action.icon}
          </div>
          
          {/* 文字 */}
          <div style={{ fontWeight: 500, fontSize: 13, color: '#4a5568' }}>
            {action.title}
          </div>
        </div>
      ))}
    </div>
  )
}
