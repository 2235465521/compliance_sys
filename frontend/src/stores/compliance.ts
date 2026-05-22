import { create } from 'zustand'
import type { ComplianceTask } from '@/types/compliance'

interface ComplianceStoreState {
  tasks: ComplianceTask[]
  currentTask: ComplianceTask | null
  isLoading: boolean
  error: string | null
  setTasks: (tasks: ComplianceTask[]) => void
  setCurrentTask: (task: ComplianceTask | null) => void
  setIsLoading: (loading: boolean) => void
  setError: (message: string | null) => void
}

export const useComplianceStore = create<ComplianceStoreState>((set) => ({
  tasks: [],
  currentTask: null,
  isLoading: false,
  error: null,
  setTasks: (tasks) => set({ tasks }),
  setCurrentTask: (currentTask) => set({ currentTask }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
