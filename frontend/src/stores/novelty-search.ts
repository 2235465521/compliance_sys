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

/** 任务标题：企业名称 + 日期（与产品约定一致，不由用户填写） */
function buildTaskTitle(enterpriseName: string) {
  return `${enterpriseName.trim()} ${dayjs().format('YYYY-MM-DD')}`
}

function parseStdNos(text: string): string[] {
  return text
    .split(/[\n,，;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
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
  addTaskFromUpload: (input: { enterpriseName: string; enterpriseStdNo: string; fileName: string }) => NoveltyTask
  addTaskFromForm: (input: { enterpriseName: string; enterpriseStdNo: string; stdNosText: string }) => NoveltyTask
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
    const en = input.enterpriseName.trim()
    const task: NoveltyTask = {
      id,
      title: buildTaskTitle(en),
      enterpriseName: en,
      enterpriseStdNo: input.enterpriseStdNo.trim(),
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
    const en = input.enterpriseName.trim()
    const task: NoveltyTask = {
      id,
      title: buildTaskTitle(en),
      enterpriseName: en,
      enterpriseStdNo: input.enterpriseStdNo.trim(),
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
