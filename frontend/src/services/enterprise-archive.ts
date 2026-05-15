/**
 * 企业档案服务 — 演示用 Mock
 *
 * MOCK: 企业主档 CRUD/一企一库列表等 REST 当前由前端内存模拟；对接后端后替换为真实请求。
 * 联调时替换为真实 request 调用，路径以后端约定为准。
 */
import { useEnterpriseArchiveStore } from '@/stores/enterprise-archive'
import type {
  CreateEnterpriseInput,
  Enterprise,
  EnterpriseStatus,
  UpdateEnterpriseInput,
} from '@/types/enterprise-archive'

const MS = 220
function delay(ms: number = MS) {
  return new Promise((r) => setTimeout(r, ms))
}

export interface ListEnterprisesParams {
  keyword?: string
  status?: EnterpriseStatus | ''
  page: number
  pageSize: number
}

export interface ListEnterprisesResult {
  list: Enterprise[]
  total: number
}

export async function listEnterprises(params: ListEnterprisesParams): Promise<ListEnterprisesResult> {
  await delay()
  let rows = [...useEnterpriseArchiveStore.getState().enterprises]
  const kw = params.keyword?.trim()
  if (kw) {
    rows = rows.filter(
      (e) =>
        e.name.includes(kw) || e.creditCode.includes(kw) || e.id.includes(kw) || e.contactName.includes(kw),
    )
  }
  if (params.status) {
    rows = rows.filter((e) => e.status === params.status)
  }
  rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const total = rows.length
  const start = (params.page - 1) * params.pageSize
  const list = rows.slice(start, start + params.pageSize)
  return { list, total }
}

export async function getEnterpriseById(id: string): Promise<Enterprise | null> {
  await delay(120)
  return useEnterpriseArchiveStore.getState().getById(id) ?? null
}

export async function createEnterprise(input: CreateEnterpriseInput): Promise<Enterprise> {
  await delay()
  return useEnterpriseArchiveStore.getState().add(input)
}

export async function updateEnterprise(id: string, input: UpdateEnterpriseInput): Promise<void> {
  await delay(160)
  useEnterpriseArchiveStore.getState().update(id, input)
}

export async function deleteEnterprise(id: string): Promise<void> {
  await delay(160)
  useEnterpriseArchiveStore.getState().remove(id)
}

export async function appendEmptyQibiao(enterpriseId: string) {
  await delay(100)
  return useEnterpriseArchiveStore.getState().addQibiao(enterpriseId)
}

export async function removeQibiaoItem(enterpriseId: string, qibiaoId: string) {
  await delay(100)
  useEnterpriseArchiveStore.getState().removeQibiao(enterpriseId, qibiaoId)
}
