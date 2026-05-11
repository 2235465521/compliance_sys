import { isAxiosError } from 'axios'
import { message } from 'antd'
import { create } from 'zustand'
import type {
  DuplicateCheckHit,
  DuplicateCheckPayload,
  DuplicateCheckSummary,
} from '@/types/duplicate-check'
import { buildMockDuplicateHits, submitDuplicateCheck } from '@/services/duplicate-check'
import { computeDuplicateSummary } from '@/pages/duplicate-check/utils/summary'

function formatDuplicateRequestError(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined
    const fromBody =
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.detail === 'string' && data.detail) ||
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.msg === 'string' && data.msg) ||
      ''
    if (fromBody) return String(fromBody)
    if (err.response?.status) {
      return `HTTP ${err.response.status} ${err.response.statusText || ''}`.trim()
    }
    return err.message || '网络错误'
  }
  if (err instanceof Error) return err.message
  return '未知错误'
}

type ReportModalState = {
  open: boolean
  title: string
  payload: unknown
}

interface DuplicateCheckStore {
  results: DuplicateCheckHit[]
  summary: DuplicateCheckSummary | null
  lastPayload: DuplicateCheckPayload | null
  submitting: boolean
  usedMock: boolean
  reportModal: ReportModalState
  runCheck: (payload: DuplicateCheckPayload) => Promise<'api' | 'mock'>
  clear: () => void
  openReport: (title: string, payload: unknown) => void
  closeReport: () => void
}

export const useDuplicateCheckStore = create<DuplicateCheckStore>((set, get) => ({
  results: [],
  summary: null,
  lastPayload: null,
  submitting: false,
  usedMock: false,
  reportModal: { open: false, title: '', payload: null },

  runCheck: async (payload) => {
    if (get().submitting) {
      message.info('查重任务正在执行中，请稍候再试。', 3)
      return 'api'
    }
    set({ submitting: true, lastPayload: payload })
    try {
      const hits = await submitDuplicateCheck(payload)
      set({
        results: hits,
        summary: computeDuplicateSummary(hits),
        submitting: false,
        usedMock: false,
      })
      return 'api'
    } catch (err) {
      message.error(
        `查重请求失败：${formatDuplicateRequestError(err)}。请确认后端已启动，且 frontend/.env.development 中 VITE_DEV_PROXY_TARGET 端口正确，修改后需重启 npm run dev。`,
        8,
      )
      const mockHits = buildMockDuplicateHits(payload)
      set({
        results: mockHits,
        summary: computeDuplicateSummary(mockHits),
        submitting: false,
        usedMock: true,
      })
      return 'mock'
    }
  },

  clear: () =>
    set({
      results: [],
      summary: null,
      lastPayload: null,
      usedMock: false,
      reportModal: { open: false, title: '', payload: null },
    }),

  openReport: (title, payload) =>
    set({ reportModal: { open: true, title, payload } }),

  closeReport: () => {
    const m = get().reportModal
    set({ reportModal: { ...m, open: false } })
  },
}))
