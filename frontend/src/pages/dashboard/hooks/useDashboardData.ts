import { useCallback, useEffect } from 'react'
import { fetchStatistics, fetchWarnings } from '@/services/dashboard'
import { useDashboardStore } from '@/stores/dashboard'

/**
 * 仪表盘数据统一请求 Hook
 * 并发拉取统计数据与预警列表，写入全局 store
 */
export function useDashboardData() {
  const { stats, loading, setStats, setLoading } = useDashboardStore()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsData, warningsData] = await Promise.all([
        fetchStatistics(),
        fetchWarnings(),
      ])

      const typeData = Object.entries(statsData.types).map(([type, value]) => ({
        type,
        value,
      }))
      const stateData = Object.entries(statsData.states).map(([state, value]) => ({
        state,
        value,
      }))

      setStats({
        totalCount: typeData.reduce((sum, d) => sum + d.value, 0),
        activeCount: statsData.states['现行'] ?? 0,
        pendingCount: statsData.states['即将实施'] ?? 0,
        revokedCount: statsData.states['废止'] ?? 0,
        unreadWarnings: warningsData.unread_count,
        typeData,
        stateData,
        warnings: warningsData.data,
      })
    } finally {
      setLoading(false)
    }
  }, [setStats, setLoading])

  useEffect(() => {
    load()
  }, [load])

  return { stats, loading, reload: load }
}
