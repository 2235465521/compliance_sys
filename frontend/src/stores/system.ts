import { create } from 'zustand'
import type {
  AuditLogEntry,
  PermissionTreeNode,
  SystemRole,
  SystemRoleInput,
  SystemUser,
  SystemUserInput,
  SystemViewerRole,
} from '@/types/system'

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const PERMISSION_TREE: PermissionTreeNode[] = [
  {
    key: 'std',
    title: '标准库',
    children: [
      { key: 'std.read', title: '查看' },
      { key: 'std.write', title: '维护' },
    ],
  },
  {
    key: 'novelty',
    title: '查新服务',
    children: [
      { key: 'novelty.read', title: '查看任务' },
      { key: 'novelty.write', title: '创建/编辑任务' },
    ],
  },
  {
    key: 'enterprise',
    title: '企业档案',
    children: [
      { key: 'enterprise.read', title: '查看' },
      { key: 'enterprise.write', title: '维护' },
    ],
  },
  {
    key: 'audit',
    title: '系统审计',
    children: [{ key: 'audit.view', title: '查看审计日志' }],
  },
]

function flattenKeys(nodes: PermissionTreeNode[]): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.children?.length) out.push(...flattenKeys(n.children))
    else out.push(n.key)
  }
  return out
}

/** 权限树全部叶子 key（角色绑定用） */
export const ALL_PERMISSION_LEAF_KEYS = flattenKeys(PERMISSION_TREE)

const ALL_KEYS = ALL_PERMISSION_LEAF_KEYS

const roleSuper: SystemRole = {
  id: 'role-super',
  code: 'super_admin',
  name: '超级管理员',
  permissionKeys: [...ALL_KEYS],
  createdAt: nowIso(),
}

const roleOp: SystemRole = {
  id: 'role-op',
  code: 'operator',
  name: '操作兼审核员',
  permissionKeys: [
    'std.read',
    'std.write',
    'novelty.read',
    'novelty.write',
    'enterprise.read',
    'enterprise.write',
  ],
  createdAt: nowIso(),
}

const usersSeed: SystemUser[] = [
  {
    id: 'u-1',
    username: 'admin',
    displayName: '系统管理员',
    email: 'admin@example.com',
    roleIds: ['role-super'],
    enabled: true,
    lastLoginAt: nowIso(),
    createdAt: nowIso(),
  },
  {
    id: 'u-2',
    username: 'operator1',
    displayName: '张三',
    email: 'zhang@example.com',
    roleIds: ['role-op'],
    enabled: true,
    lastLoginAt: nowIso(),
    createdAt: nowIso(),
  },
]

const auditSeed: AuditLogEntry[] = [
  {
    id: 'log-1',
    occurredAt: new Date(Date.now() - 3600_000).toISOString(),
    actorUsername: 'admin',
    ip: '192.168.1.10',
    module: '标准库',
    actionType: '修改',
    summary: '更新标准 GB/T 1.1-2020 元数据',
    result: 'success',
    changes: [
      { field: '起草单位', oldValue: '旧单位A', newValue: '新单位B' },
      { field: '实施日期', oldValue: '2020-01-01', newValue: '2020-10-01' },
    ],
  },
  {
    id: 'log-2',
    occurredAt: new Date(Date.now() - 7200_000).toISOString(),
    actorUsername: 'operator1',
    ip: '192.168.1.88',
    module: '查新服务',
    actionType: '导出',
    summary: '导出查新比对明细（演示）',
    result: 'success',
    changes: [],
  },
  {
    id: 'log-3',
    occurredAt: new Date(Date.now() - 86400_000).toISOString(),
    actorUsername: 'admin',
    ip: '10.0.0.1',
    module: '认证',
    actionType: '登录',
    summary: '用户登录成功',
    result: 'success',
    changes: [],
  },
  {
    id: 'log-4',
    occurredAt: new Date(Date.now() - 172800_000).toISOString(),
    actorUsername: 'operator1',
    ip: '192.168.1.88',
    module: '企业档案',
    actionType: '修改',
    summary: '更新企业联系人失败（演示）',
    result: 'failure',
    changes: [],
  },
]

interface SystemStore {
  viewerRole: SystemViewerRole
  setViewerRole: (r: SystemViewerRole) => void
  canViewAudit: () => boolean

  users: SystemUser[]
  roles: SystemRole[]
  auditLogs: AuditLogEntry[]

  getUser: (id: string) => SystemUser | undefined
  addUser: (input: SystemUserInput) => SystemUser
  updateUser: (id: string, input: Partial<SystemUserInput>) => void
  removeUser: (id: string) => void

  getRole: (id: string) => SystemRole | undefined
  addRole: (input: SystemRoleInput) => SystemRole
  updateRole: (id: string, input: Partial<SystemRoleInput>) => void
  removeRole: (id: string) => void

  getAuditLog: (id: string) => AuditLogEntry | undefined
}

export const useSystemStore = create<SystemStore>((set, get) => ({
  viewerRole: 'super_admin',
  setViewerRole: (r) => set({ viewerRole: r }),
  canViewAudit: () => get().viewerRole === 'super_admin',

  users: usersSeed,
  roles: [roleSuper, roleOp],
  auditLogs: auditSeed,

  getUser: (id) => get().users.find((u) => u.id === id),

  addUser: (input) => {
    const u: SystemUser = {
      id: newId('u'),
      username: input.username.trim(),
      displayName: input.displayName.trim(),
      email: input.email.trim(),
      roleIds: [...input.roleIds],
      enabled: input.enabled,
      createdAt: nowIso(),
    }
    set((s) => ({ users: [u, ...s.users] }))
    return u
  },

  updateUser: (id, patch) => {
    set((s) => ({
      users: s.users.map((u) =>
        u.id !== id
          ? u
          : {
              ...u,
              ...(patch.username != null ? { username: String(patch.username).trim() } : {}),
              ...(patch.displayName != null ? { displayName: String(patch.displayName).trim() } : {}),
              ...(patch.email != null ? { email: String(patch.email).trim() } : {}),
              ...(patch.roleIds != null ? { roleIds: [...patch.roleIds] } : {}),
              ...(patch.enabled != null ? { enabled: patch.enabled } : {}),
            },
      ),
    }))
  },

  removeUser: (id) => set((s) => ({ users: s.users.filter((u) => u.id !== id) })),

  getRole: (id) => get().roles.find((r) => r.id === id),

  addRole: (input) => {
    const r: SystemRole = {
      id: newId('role'),
      code: input.code.trim(),
      name: input.name.trim(),
      permissionKeys: [...input.permissionKeys],
      createdAt: nowIso(),
    }
    set((s) => ({ roles: [...s.roles, r] }))
    return r
  },

  updateRole: (id, patch) => {
    set((s) => ({
      roles: s.roles.map((r) =>
        r.id !== id
          ? r
          : {
              ...r,
              ...(patch.code != null ? { code: String(patch.code).trim() } : {}),
              ...(patch.name != null ? { name: String(patch.name).trim() } : {}),
              ...(patch.permissionKeys != null ? { permissionKeys: [...patch.permissionKeys] } : {}),
            },
      ),
    }))
  },

  removeRole: (id) => set((s) => ({ roles: s.roles.filter((r) => r.id !== id) })),

  getAuditLog: (id) => get().auditLogs.find((l) => l.id === id),
}))
