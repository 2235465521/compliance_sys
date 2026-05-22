/** 系统安全与审计 — 前端类型（Mock；与后端契约对齐后替换） */

export type SystemViewerRole = 'super_admin' | 'operator'

export interface SystemUser {
  id: string
  username: string
  displayName: string
  email: string
  roleIds: string[]
  enabled: boolean
  lastLoginAt?: string
  createdAt: string
}

export interface SystemRole {
  id: string
  code: string
  name: string
  permissionKeys: string[]
  createdAt: string
}

/** 权限树节点（与 Ant Design Tree `TreeDataNode` 的 key/title 对齐） */
export interface PermissionTreeNode {
  key: string
  title: string
  children?: PermissionTreeNode[]
}

export interface AuditLogChange {
  field: string
  oldValue: string
  newValue: string
}

export interface AuditLogEntry {
  id: string
  occurredAt: string
  actorUsername: string
  ip: string
  module: string
  actionType: string
  summary: string
  result: 'success' | 'failure'
  /** 字段级 Diff；无变更时可为空数组 */
  changes: AuditLogChange[]
}

export interface AuditLogQuery {
  keyword?: string
  module?: string
  actionType?: string
  actorUsername?: string
  timeFrom?: string
  timeTo?: string
  page: number
  pageSize: number
}

export interface SystemUserInput {
  username: string
  displayName: string
  email: string
  roleIds: string[]
  enabled: boolean
}

export interface SystemRoleInput {
  code: string
  name: string
  permissionKeys: string[]
}
