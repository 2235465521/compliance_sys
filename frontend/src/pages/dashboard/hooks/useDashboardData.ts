import { useCallback, useEffect } from "react";
import { fetchDashboardSummary, fetchDashboardAbolitionHints } from "@/services/dashboard";
import { useDashboardStore } from "@/stores/dashboard";
import type { AbolitionHintsPayload, StatisticsData } from "@/types/dashboard";

const emptyStats: StatisticsData = { types: {}, states: {} };
const emptyHints: AbolitionHintsPayload = { asOf: "", upcoming: [], recent: [] };

/**
 * 仪表盘数据：GET v1/dashboard/summary + v1/dashboard/abolition-hints（各一次）
 */
export function useDashboardData() {
  const { stats, loading, setStats, setLoading } = useDashboardStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, hintsRes] = await Promise.allSettled([
        fetchDashboardSummary(),
        fetchDashboardAbolitionHints(),
      ]);

      const statsData: StatisticsData =
        statsRes.status === "fulfilled" ? statsRes.value : emptyStats;
      const hints: AbolitionHintsPayload =
        hintsRes.status === "fulfilled" ? hintsRes.value : emptyHints;

      if (statsRes.status === "rejected") {
        console.error("[dashboard] summary 加载失败", statsRes.reason);
      }
      if (hintsRes.status === "rejected") {
        console.error("[dashboard] abolition-hints 加载失败", hintsRes.reason);
      }

      const typeData = Object.entries(statsData.types).map(([type, value]) => ({
        type,
        value,
      }));
      const stateData = Object.entries(statsData.states).map(([state, value]) => ({
        state,
        value,
      }));

      const typesSum = Object.values(statsData.types).reduce((s, n) => s + n, 0);
      const totalCount =
        statsData.total != null && statsData.total >= 0 ? statsData.total : typesSum;

      setStats({
        totalCount,
        activeCount: statsData.states["现行"] ?? 0,
        pendingCount: statsData.states["即将实施"] ?? 0,
        revokedCount: statsData.states["废止"] ?? 0,
        unreadWarnings: hints.recent.length,
        abolitionHintsAsOf: hints.asOf || undefined,
        abolitionUpcoming: hints.upcoming,
        abolitionRecent: hints.recent,
        typeData,
        stateData,
        warnings: [],
      });
    } finally {
      setLoading(false);
    }
  }, [setStats, setLoading]);

  useEffect(() => {
    load();
  }, [load]);

  return { stats, loading, reload: load };
}
