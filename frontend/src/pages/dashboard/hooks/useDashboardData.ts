import { useCallback, useEffect, useState } from 'react'
import {
  fetchDashboardAbolitionHints,
  fetchDashboardEffectiveHints,
  fetchDashboardSummary,
} from '@/services/dashboard'
import { useDashboardStore } from '@/stores/dashboard'
import {
  DEFAULT_DASHBOARD_HINT_DAYS,
  type AbolitionHintsPayload,
  type DashboardHintDays,
  type EffectiveHintsPayload,
  type StatisticsData,
} from '@/types/dashboard'

const emptyStats: StatisticsData = { types: {}, states: {} }
const emptyAbolitionHints: AbolitionHintsPayload = {
  asOf: '',
  upcoming: [],
  recent: [],
}
const emptyEffectiveHints: EffectiveHintsPayload = { asOf: '', upcoming: [] }

function buildStatsFromSummary(
  statsData: StatisticsData,
  hints: AbolitionHintsPayload,
  effective: EffectiveHintsPayload,
  upcomingDays: number,
  recentDays: number,
  effectiveDays: number,
) {
  const typeData = Object.entries(statsData.types).map(([type, value]) => ({
    type,
    value,
  }))
  const stateData = Object.entries(statsData.states).map(([state, value]) => ({
    state,
    value,
  }))

  const typesSum = Object.values(statsData.types).reduce((s, n) => s + n, 0)
  const totalCount =
    statsData.total != null && statsData.total >= 0 ? statsData.total : typesSum

  return {
    totalCount,
    activeCount: statsData.states['现行'] ?? 0,
    pendingCount: statsData.states['即将实施'] ?? 0,
    revokedCount: statsData.states['废止'] ?? 0,
    unreadWarnings: hints.recent.length,
    abolitionHintsAsOf: hints.asOf || undefined,
    abolitionWindowDays: hints.windowDays ?? upcomingDays,
    abolitionRecentDays: hints.recentDays ?? recentDays,
    abolitionUpcoming: hints.upcoming,
    abolitionRecent: hints.recent,
    effectiveHintsAsOf: effective.asOf || undefined,
    effectiveWindowDays: effective.windowDays ?? effectiveDays,
    effectiveUpcoming: effective.upcoming,
    typeData,
    stateData,
    warnings: [],
  }
}

/**
 * 仪表盘：summary + abolition-hints + effective-hints 并行加载。
 * 即将废止 / 近期已废止 / 即将实施 天数可分别切换并重拉对应数据。
 */
export function useDashboardData() {
  const { stats, loading, setStats, patchStats, setLoading } = useDashboardStore()
  const [partialFailure, setPartialFailure] = useState(false)
  const [abolitionDays, setAbolitionDays] = useState<DashboardHintDays>(
    DEFAULT_DASHBOARD_HINT_DAYS,
  )
  const [recentDays, setRecentDays] = useState<DashboardHintDays>(DEFAULT_DASHBOARD_HINT_DAYS)
  const [effectiveDays, setEffectiveDays] = useState<DashboardHintDays>(
    DEFAULT_DASHBOARD_HINT_DAYS,
  )
  const [abolitionLoading, setAbolitionLoading] = useState(false)
  const [effectiveLoading, setEffectiveLoading] = useState(false)

  const loadAbolitionHints = useCallback(
    async (upcomingDays: DashboardHintDays, recentDaysParam: DashboardHintDays) => {
      setAbolitionLoading(true)
      try {
        const hints = await fetchDashboardAbolitionHints({
          upcoming_days: upcomingDays,
          recent_days: recentDaysParam,
        })
        patchStats({
          unreadWarnings: hints.recent.length,
          abolitionHintsAsOf: hints.asOf || undefined,
          abolitionWindowDays: hints.windowDays ?? upcomingDays,
          abolitionRecentDays: hints.recentDays ?? recentDaysParam,
          abolitionUpcoming: hints.upcoming,
          abolitionRecent: hints.recent,
        })
        return hints
      } finally {
        setAbolitionLoading(false)
      }
    },
    [patchStats],
  )

  const loadEffectiveHints = useCallback(
    async (days: DashboardHintDays) => {
      setEffectiveLoading(true)
      try {
        const effective = await fetchDashboardEffectiveHints({ window_days: days })
        patchStats({
          effectiveHintsAsOf: effective.asOf || undefined,
          effectiveWindowDays: effective.windowDays ?? days,
          effectiveUpcoming: effective.upcoming,
        })
        return effective
      } finally {
        setEffectiveLoading(false)
      }
    },
    [patchStats],
  )

  const loadAll = useCallback(
    async (
      upcomingD: DashboardHintDays,
      recentD: DashboardHintDays,
      effectiveD: DashboardHintDays,
    ) => {
      setLoading(true)
      try {
        const [statsRes, hintsRes, effectiveRes] = await Promise.allSettled([
          fetchDashboardSummary(),
          fetchDashboardAbolitionHints({
            upcoming_days: upcomingD,
            recent_days: recentD,
          }),
          fetchDashboardEffectiveHints({ window_days: effectiveD }),
        ])

        setPartialFailure(
          statsRes.status === 'rejected' ||
            hintsRes.status === 'rejected' ||
            effectiveRes.status === 'rejected',
        )

        const statsData: StatisticsData =
          statsRes.status === 'fulfilled' ? statsRes.value : emptyStats
        const hints: AbolitionHintsPayload =
          hintsRes.status === 'fulfilled' ? hintsRes.value : emptyAbolitionHints
        const effective: EffectiveHintsPayload =
          effectiveRes.status === 'fulfilled' ? effectiveRes.value : emptyEffectiveHints

        if (statsRes.status === 'rejected') {
          console.error('[dashboard] summary 加载失败', statsRes.reason)
        }
        if (hintsRes.status === 'rejected') {
          console.error('[dashboard] abolition-hints 加载失败', hintsRes.reason)
        }
        if (effectiveRes.status === 'rejected') {
          console.error('[dashboard] effective-hints 加载失败', effectiveRes.reason)
        }

        setStats(
          buildStatsFromSummary(statsData, hints, effective, upcomingD, recentD, effectiveD),
        )
      } finally {
        setLoading(false)
      }
    },
    [setLoading, setStats],
  )

  const reload = useCallback(() => {
    return loadAll(abolitionDays, recentDays, effectiveDays)
  }, [abolitionDays, recentDays, effectiveDays, loadAll])

  const changeAbolitionDays = useCallback(
    async (days: DashboardHintDays) => {
      setAbolitionDays(days)
      await loadAbolitionHints(days, recentDays)
    },
    [loadAbolitionHints, recentDays],
  )

  const changeRecentDays = useCallback(
    async (days: DashboardHintDays) => {
      setRecentDays(days)
      await loadAbolitionHints(abolitionDays, days)
    },
    [abolitionDays, loadAbolitionHints],
  )

  const changeEffectiveDays = useCallback(
    async (days: DashboardHintDays) => {
      setEffectiveDays(days)
      await loadEffectiveHints(days)
    },
    [loadEffectiveHints],
  )

  useEffect(() => {
    const d = DEFAULT_DASHBOARD_HINT_DAYS
    void loadAll(d, d, d)
  }, [loadAll])

  return {
    stats,
    loading,
    abolitionLoading,
    effectiveLoading,
    abolitionDays,
    recentDays,
    effectiveDays,
    reload,
    changeAbolitionDays,
    changeRecentDays,
    changeEffectiveDays,
    partialFailure,
  }
}
