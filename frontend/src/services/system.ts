/**
 * 系统安全与审计 — 演示用 Mock
 *
 * MOCK: 面向 SPA 的用户/角色/系统审计日志 REST 当前由前端模拟；本文件不调用 `/api/audit/submit` 等
 * **业务审核台**接口（与 7.2 全流程审计日志不同）。联调时替换为真实 request。
 */
import { useSystemStore } from '@/stores/system'
import type {
  AuditLogEntry,
  AuditLogQuery,
  SystemRole,
  SystemRoleInput,
  SystemUser,
  SystemUserInput,
} from '@/types/system'

const MS = 200
function delay(ms: number = MS) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function listUsers(): Promise<SystemUser[]> {
  await delay()
  return [...useSystemStore.getState().users]
}

export async function saveUser(id: string | undefined, input: SystemUserInput): Promise<SystemUser> {
  await delay()
  if (id) {
    useSystemStore.getState().updateUser(id, input)
    const u = useSystemStore.getState().getUser(id)
    if (!u) throw new Error('用户不存在')
    return u
  }
  return useSystemStore.getState().addUser(input)
}

export async function deleteUser(id: string): Promise<void> {
  await delay(120)
  useSystemStore.getState().removeUser(id)
}

export async function listRoles(): Promise<SystemRole[]> {
  await delay()
  return [...useSystemStore.getState().roles]
}

export async function saveRole(id: string | undefined, input: SystemRoleInput): Promise<SystemRole> {
  await delay()
  if (id) {
    useSystemStore.getState().updateRole(id, input)
    const r = useSystemStore.getState().getRole(id)
    if (!r) throw new Error('角色不存在')
    return r
  }
  return useSystemStore.getState().addRole(input)
}

export async function deleteRole(id: string): Promise<void> {
  await delay(120)
  useSystemStore.getState().removeRole(id)
}

export async function listAuditLogs(params: AuditLogQuery): Promise<{ list: AuditLogEntry[]; total: number }> {
  await delay()
  let rows = [...useSystemStore.getState().auditLogs]
  if (params.keyword?.trim()) {
    const k = params.keyword.trim()
    rows = rows.filter(
      (r) =>
        r.summary.includes(k) ||
        r.actorUsername.includes(k) ||
        r.module.includes(k) ||
        r.ip.includes(k) ||
        r.actionType.includes(k),
    )
  }
  if (params.module?.trim()) {
    rows = rows.filter((r) => r.module === params.module)
  }
  if (params.actionType?.trim()) {
    rows = rows.filter((r) => r.actionType === params.actionType)
  }
  if (params.actorUsername?.trim()) {
    rows = rows.filter((r) => r.actorUsername.includes(params.actorUsername!.trim()))
  }
  if (params.timeFrom) {
    rows = rows.filter((r) => r.occurredAt >= params.timeFrom!)
  }
  if (params.timeTo) {
    rows = rows.filter((r) => r.occurredAt <= params.timeTo!)
  }
  rows.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
  const total = rows.length
  const start = (params.page - 1) * params.pageSize
  return { list: rows.slice(start, start + params.pageSize), total }
}

export async function getAuditLogById(id: string): Promise<AuditLogEntry | null> {
  await delay(100)
  return useSystemStore.getState().getAuditLog(id) ?? null
}
