import { create } from 'zustand'
import type { CreateEnterpriseInput, Enterprise, EnterpriseQibiao, EnterpriseStatus } from '@/types/enterprise-archive'

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const seed: Enterprise[] = [
  {
    id: 'ea-seed-001',
    name: '示例科技有限公司',
    creditCode: '91110000MA0123456X',
    status: 'active',
    address: '北京市朝阳区演示路1号',
    contactName: '张演示',
    contactPhone: '010-00000000',
    contactEmail: 'demo1@example.com',
    remark: '演示主档 1',
    createdAt: new Date().toISOString().slice(0, 10) + 'T08:00:00.000Z',
    updatedAt: new Date().toISOString().slice(0, 10) + 'T08:00:00.000Z',
    qibiaoList: [
      {
        id: 'qb-seed-1',
        stdNo: 'Q/DEMO-001-2020',
        title: '智能设备企业标准（演示）',
        basicNote: '范围、规范性引用、术语定义等节提取摘要可写于此。',
        indicators: [
          { id: 'ind-1', name: '额定电压', value: 'AC 220V' },
          { id: 'ind-2', name: '试验温度', value: '25℃ ±2℃' },
          { id: 'ind-3', name: '防护等级', value: 'IP54' },
        ],
        updatedAt: nowIso(),
      },
    ],
  },
  {
    id: 'ea-seed-002',
    name: '智云制造集团有限公司',
    creditCode: '91320100MA1ABCDEF0',
    status: 'active',
    address: '上海市浦东新区样例大道88号',
    contactName: '李样例',
    contactPhone: '021-12345678',
    contactEmail: 'demo2@example.com',
    remark: '演示主档 2',
    createdAt: new Date().toISOString().slice(0, 10) + 'T09:00:00.000Z',
    updatedAt: new Date().toISOString().slice(0, 10) + 'T09:00:00.000Z',
    qibiaoList: [],
  },
]

interface Store {
  enterprises: Enterprise[]
  getById: (id: string) => Enterprise | undefined
  add: (input: CreateEnterpriseInput) => Enterprise
  update: (id: string, input: Partial<CreateEnterpriseInput & { qibiaoList?: EnterpriseQibiao[] }>) => void
  remove: (id: string) => void
  addQibiao: (enterpriseId: string) => EnterpriseQibiao | undefined
  removeQibiao: (enterpriseId: string, qibiaoId: string) => void
}

export const useEnterpriseArchiveStore = create<Store>((set, get) => ({
  enterprises: seed,

  getById: (id) => get().enterprises.find((e) => e.id === id),

  add: (input) => {
    const t = nowIso()
    const blank: EnterpriseQibiao = {
      id: newId('qb'),
      stdNo: '',
      title: '',
      basicNote: '请补全本企标基础信息；下方可增删指标行（演示数据）。',
      indicators: [
        { id: newId('ind'), name: '示例指标', value: '—' },
      ],
      updatedAt: t,
    }
    const e: Enterprise = {
      id: newId('ea'),
      name: input.name.trim(),
      creditCode: input.creditCode.trim(),
      status: input.status,
      address: input.address.trim(),
      contactName: input.contactName.trim(),
      contactPhone: input.contactPhone.trim(),
      contactEmail: input.contactEmail.trim(),
      remark: input.remark.trim(),
      createdAt: t,
      updatedAt: t,
      qibiaoList: [blank],
    }
    set((s) => ({ enterprises: [e, ...s.enterprises] }))
    return e
  },

  update: (id, patch) => {
    set((s) => ({
      enterprises: s.enterprises.map((e) => {
        if (e.id !== id) return e
        return {
          ...e,
          ...('name' in patch && patch.name != null ? { name: String(patch.name).trim() } : {}),
          ...('creditCode' in patch && patch.creditCode != null ? { creditCode: String(patch.creditCode).trim() } : {}),
          ...('status' in patch && patch.status != null ? { status: patch.status as EnterpriseStatus } : {}),
          ...('address' in patch && patch.address != null ? { address: String(patch.address).trim() } : {}),
          ...('contactName' in patch && patch.contactName != null ? { contactName: String(patch.contactName).trim() } : {}),
          ...('contactPhone' in patch && patch.contactPhone != null ? { contactPhone: String(patch.contactPhone).trim() } : {}),
          ...('contactEmail' in patch && patch.contactEmail != null ? { contactEmail: String(patch.contactEmail).trim() } : {}),
          ...('remark' in patch && patch.remark != null ? { remark: String(patch.remark).trim() } : {}),
          ...('qibiaoList' in patch && patch.qibiaoList != null ? { qibiaoList: patch.qibiaoList } : {}),
          updatedAt: nowIso(),
        }
      }),
    }))
  },

  remove: (id) => set((s) => ({ enterprises: s.enterprises.filter((e) => e.id !== id) })),

  addQibiao: (enterpriseId) => {
    const ent = get().getById(enterpriseId)
    if (!ent) return undefined
    const t = nowIso()
    const q: EnterpriseQibiao = {
      id: newId('qb'),
      stdNo: '',
      title: '新建企标（请填写）',
      basicNote: '',
      indicators: [],
      updatedAt: t,
    }
    get().update(enterpriseId, { qibiaoList: [...ent.qibiaoList, q] })
    return q
  },

  removeQibiao: (enterpriseId, qibiaoId) => {
    const ent = get().getById(enterpriseId)
    if (!ent) return
    get().update(enterpriseId, { qibiaoList: ent.qibiaoList.filter((q) => q.id !== qibiaoId) })
  },
}))
