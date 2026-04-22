import { create } from 'zustand'
import type { DashboardStats } from '@/types/dashboard'

interface DashboardStore {
  stats: DashboardStats | null
  loading: boolean
  setStats: (stats: DashboardStats) => void
  setLoading: (loading: boolean) => void
  /** 本地乐观更新：将指定预警标记为已读 */
  markWarningReadLocal: (id: number) => void
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  stats: null,
  loading: false,
  setStats: (stats) => set({ stats }),
  setLoading: (loading) => set({ loading }),
  markWarningReadLocal: (id) =>
    set((state) => {
      if (!state.stats) return state
      return {
        stats: {
          ...state.stats,
          warnings: state.stats.warnings.map((w) =>
            w.id === id ? { ...w, is_read: true } : w,
          ),
          unreadWarnings: Math.max(0, state.stats.unreadWarnings - 1),
        },
      }
    }),
}))
