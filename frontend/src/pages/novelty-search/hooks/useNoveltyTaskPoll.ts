import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTaskById } from '@/services/novelty-search'
import { noveltyTaskNeedsPolling } from '@/pages/novelty-search/utils/mapNoveltyApi'
import type { NoveltyTask } from '@/types/novelty-search'

const DEFAULT_INTERVAL_MS = 2000

export function useNoveltyTaskPoll(
  taskId: string | undefined,
  options?: { intervalMs?: number; enabled?: boolean },
) {
  const [task, setTask] = useState<NoveltyTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (!taskId) {
      setTask(null)
      setLoading(false)
      return
    }
    try {
      const t = await fetchTaskById(taskId)
      setTask(t)
      setError(t ? null : '未找到该任务')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    if (options?.enabled === false) return
    setLoading(true)
    void load()
  }, [load, options?.enabled])

  useEffect(() => {
    if (options?.enabled === false || !taskId || !task) return
    if (!noveltyTaskNeedsPolling(task.status)) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    const interval = options?.intervalMs ?? DEFAULT_INTERVAL_MS
    timerRef.current = setTimeout(() => {
      void load()
    }, interval)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [task, taskId, load, options?.enabled, options?.intervalMs])

  return { task, setTask, loading, error, reload: load }
}
