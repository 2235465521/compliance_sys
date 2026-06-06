import {
  AlertOutlined,
  AuditOutlined,
  BankOutlined,
  BlockOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  SecurityScanOutlined,
} from '@ant-design/icons'

/** ProLayout 侧栏菜单与路由 path 对齐，业务页面后续再实现 */
export const rootRoute = {
  path: '/',
  routes: [
    { path: '/dashboard', name: '仪表盘', icon: <DashboardOutlined /> },
    { path: '/standard-library', name: '标准库管理', icon: <DatabaseOutlined /> },
    { path: '/novelty-search', name: '查新服务', icon: <FileSearchOutlined /> },
    { path: '/duplicate-check', name: '查重服务', icon: <BlockOutlined /> },
    { path: '/compliance', name: '合规性评价', icon: <AuditOutlined /> },
    { path: '/batch-normative-reference', name: '规范性体检', icon: <CloudUploadOutlined /> },
    { path: '/alert', name: '预警系统', icon: <AlertOutlined /> },
    { path: '/enterprise-archive', name: '企业档案', icon: <BankOutlined /> },
    { path: '/template-archive', name: '模板与存档', icon: <FolderOpenOutlined /> },
    { path: '/system', name: '系统安全与审计', icon: <SecurityScanOutlined /> },
  ],
}
