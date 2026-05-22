import { create } from 'zustand'
import dayjs from 'dayjs'
import { clearParsingDemoScheduled } from '@/pages/novelty-search/utils/parsing-demo-scheduled'
import type { CompareRow, NoveltyTask, ReferenceSheetRow, ReportState } from '@/types/novelty-search'

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** 任务标题：优先企标号 + 日期；无则「查新任务」+ 日期 */
function buildTaskTitle(opts: { enterpriseStdNo?: string }) {
  const std = opts.enterpriseStdNo?.trim()
  const d = dayjs().format('YYYY-MM-DD')
  if (std) return `${std} ${d}`
  return `查新任务 ${d}`
}

function parseStdNos(text: string): string[] {
  return text
    .split(/[\n,，;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 国标录入：以顿号「、」为主，兼容纳逗号分号 */
function parseNationalStdNos(text: string): string[] {
  return text
    .split(/[、,，;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 演示：将输入标准号映射为「现行最新版」展示用 */
function mockNationalLatestVersion(inputNo: string): string {
  const t = inputNo.trim()
  if (!t) return t
  if (t.includes('2016')) return t.replace(/2016/g, '2020')
  if (t.includes('2008')) return t.replace(/2008/g, '2018')
  if (t.includes('1999')) return t.replace(/1999/g, '2009')
  return `${t}（现行）`
}

function mockSheetFromStdNos(nos: string[]): ReferenceSheetRow[] {
  return nos.map((stdNo, i) => ({
    id: newId('row'),
    stdNo,
    stdName: `演示标准名称 ${i + 1}（${stdNo}）`,
    techFragment: i === 0 ? '额定电压、绝缘等级…' : undefined,
    remark: '',
  }))
}

function mockCompareRows(sheet: ReferenceSheetRow[]): CompareRow[] {
  const templates: CompareRow[] = sheet.map((r, i) => {
    const mod = i % 3
    if (mod === 0) {
      return {
        id: newId('cmp'),
        sheetRowId: r.id,
        stdNo: r.stdNo,
        stdName: r.stdName,
        existsInDb: true,
        conclusion: 'active',
        pedigreeSummary: '谱系：现行有效，无替代链变更（演示）',
      }
    }
    if (mod === 1) {
      return {
        id: newId('cmp'),
        sheetRowId: r.id,
        stdNo: r.stdNo,
        stdName: r.stdName,
        existsInDb: true,
        conclusion: 'obsolete',
        replacementNo: `${r.stdNo}-2024`,
        replacementName: `${r.stdName}（替代版，演示）`,
        pedigreeSummary: '谱系：已废止 → 已锁定替代标准（演示）',
      }
    }
    return {
      id: newId('cmp'),
      sheetRowId: r.id,
      stdNo: r.stdNo,
      stdName: r.stdName,
      existsInDb: false,
      conclusion: 'pending',
      rowError: '库内无数据，需补录或核对标准号（演示）',
    }
  })
  return templates
}

interface NoveltyStore {
  tasks: NoveltyTask[]
  upsertTask: (task: NoveltyTask) => void
  updateTask: (id: string, patch: Partial<NoveltyTask>) => void
  getTask: (id: string) => NoveltyTask | undefined
  /** 创建后进入解析演示态 */
  addTaskFromUpload: (input: { enterpriseStdNo: string; fileName: string }) => NoveltyTask
  addTaskFromForm: (input: { enterpriseStdNo: string; stdNosText: string }) => NoveltyTask
  addTaskFromNational: (input: { nationalStdNosText: string }) => NoveltyTask
  saveReferenceDraft: (id: string, rows: ReferenceSheetRow[]) => void
  confirmReferenceSheet: (id: string) => void
  setReportState: (id: string, state: ReportState, generatedAt?: string) => void
  /** 失败任务演示重试：清除解析去重标记并恢复为可处理状态 */
  retryTask: (id: string) => void
}

export const useNoveltyStore = create<NoveltyStore>((set, get) => ({
  tasks: [],

  upsertTask: (task) =>
    set((s) => {
      const i = s.tasks.findIndex((t) => t.id === task.id)
      if (i === -1) return { tasks: [task, ...s.tasks] }
      const next = [...s.tasks]
      next[i] = task
      return { tasks: next }
    }),

  updateTask: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: nowIso() } : t)),
    })),

  getTask: (id) => get().tasks.find((t) => t.id === id),

  addTaskFromUpload: (input) => {
    const id = newId('ns')
    const t = nowIso()
    const stdNo = input.enterpriseStdNo.trim()
    const task: NoveltyTask = {
      id,
      title: buildTaskTitle({ enterpriseStdNo: stdNo }),
      enterpriseName: '',
      enterpriseStdNo: stdNo,
      status: 'parsing',
      source: 'upload',
      fileName: input.fileName,
      createdAt: t,
      updatedAt: t,
      sheetConfirmed: false,
      referenceSheet: [],
      compareRows: [],
      compareDone: 0,
      reportState: 'none',
    }
    get().upsertTask(task)
    return task
  },

  addTaskFromForm: (input) => {
    const id = newId('ns')
    const t = nowIso()
    const nos = parseStdNos(input.stdNosText)
    const stdNo = input.enterpriseStdNo.trim()
    const task: NoveltyTask = {
      id,
      title: buildTaskTitle({ enterpriseStdNo: stdNo }),
      enterpriseName: '',
      enterpriseStdNo: stdNo,
      status: 'pending_confirm',
      source: 'form',
      formStdNos: nos,
      createdAt: t,
      updatedAt: t,
      sheetConfirmed: false,
      referenceSheet: nos.length ? mockSheetFromStdNos(nos) : [],
      compareRows: [],
      compareDone: 0,
      reportState: 'none',
    }
    get().upsertTask(task)
    return task
  },

  addTaskFromNational: (input) => {
    const id = newId('ns')
    const t = nowIso()
    const inputs = parseNationalStdNos(input.nationalStdNosText)
    const latestNos = inputs.map(mockNationalLatestVersion)
    const sheet: ReferenceSheetRow[] = inputs.map((raw, i) => ({
      id: newId('row'),
      stdNo: latestNos[i] ?? raw,
      stdName: `输入：${raw} → 现行最新（演示）：${latestNos[i] ?? raw}`,
      remark: '来自「上传国标」',
    }))
    const task: NoveltyTask = {
      id,
      title: buildTaskTitle({ enterpriseStdNo: inputs[0] }),
      enterpriseName: '',
      enterpriseStdNo: '—',
      status: 'pending_confirm',
      source: 'national',
      formStdNos: latestNos,
      createdAt: t,
      updatedAt: t,
      sheetConfirmed: false,
      referenceSheet: sheet,
      compareRows: [],
      compareDone: 0,
      reportState: 'none',
    }
    get().upsertTask(task)
    return task
  },

  saveReferenceDraft: (id, rows) => {
    get().updateTask(id, { referenceSheet: rows })
  },

  confirmReferenceSheet: (id) => {
    const task = get().getTask(id)
    if (!task) return
    const sheet = task.referenceSheet
    get().updateTask(id, {
      sheetConfirmed: true,
      status: 'comparing',
      compareRows: [],
      compareDone: 0,
    })
    // 演示：短延迟后一次性写入比对结果
    window.setTimeout(() => {
      const rows = mockCompareRows(sheet)
      get().updateTask(id, {
        compareRows: rows,
        compareDone: rows.length,
        status: 'completed',
      })
    }, 900)
  },

  setReportState: (id, state, generatedAt) => {
    get().updateTask(id, {
      reportState: state,
      ...(generatedAt ? { reportGeneratedAt: generatedAt } : {}),
    })
  },

  retryTask: (id) => {
    const t = get().getTask(id)
    if (!t || t.status !== 'failed') return
    clearParsingDemoScheduled(id)
    if (t.source === 'upload') {
      get().updateTask(id, {
        status: 'parsing',
        errorSummary: undefined,
        sheetConfirmed: false,
        referenceSheet: [],
        compareRows: [],
        compareDone: 0,
        reportState: 'none',
        reportGeneratedAt: undefined,
      })
    } else {
      get().updateTask(id, {
        status: 'pending_confirm',
        errorSummary: undefined,
        sheetConfirmed: false,
        compareRows: [],
        compareDone: 0,
        reportState: 'none',
        reportGeneratedAt: undefined,
      })
    }
  },
}))

/** 上传通道：解析结束后写入专用表初稿（演示用） */
export function applyParsingCompleteForDemo(taskId: string) {
  const sheet: ReferenceSheetRow[] = [
    {
      id: newId('row'),
      stdNo: 'GB/T 1.1-2020',
      stdName: '标准化工作导则（演示）',
      techFragment: '范围、规范性引用文件…',
    },
    {
      id: newId('row'),
      stdNo: 'QB/DEMO-001',
      stdName: '企业标准示例（演示）',
    },
    {
      id: newId('row'),
      stdNo: 'GB 00000-1999',
      stdName: '已废止示例标准（演示）',
    },
  ]
  useNoveltyStore.getState().updateTask(taskId, {
    status: 'pending_confirm',
    referenceSheet: sheet,
    errorSummary: undefined,
  })
}

export function markTaskFailed(taskId: string, message: string) {
  useNoveltyStore.getState().updateTask(taskId, {
    status: 'failed',
    errorSummary: message,
  })
}
