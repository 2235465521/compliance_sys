import { useCallback, useEffect, useRef } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import {
  fetchMonitorSummary,
  pauseWarningsScan,
  resumeWarningsScan,
  triggerWarningsScan,
  WarningsApiError,
} from '@/services/warnings-api'
import { mapMonitorSummaryFromApi } from '@/pages/alert/utils/mapWarningsApi'
import type { MonitorSummary } from '@/types/warnings'

const POLL_INTERVAL_MS = 4000

export type UseMonitorScanPollingOptions = {
  summary: MonitorSummary | null
  onSummaryChange: (summary: MonitorSummary) => void
  onRefreshList: () => void | Promise<void>
  message: MessageInstance
}

/**
 * 主动巡检：POST scan → 轮询 summary（含 active_scan）→ 结束后刷新列表
 * 见 docs/backend-warnings-实时监控-前端改造说明.md §4
 */
export function useMonitorScanPolling({
  summary,
  onSummaryChange,
  onRefreshList,
  message,
}: UseMonitorScanPollingOptions) {
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeJobIdRef = useRef<string | null>(null)
  const hadActiveScanRef = useRef(false)
  const onSummaryChangeRef = useRef(onSummaryChange)
  const onRefreshListRef = useRef(onRefreshList)

  onSummaryChangeRef.current = onSummaryChange
  onRefreshListRef.current = onRefreshList

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const pollSummaryOnce = useCallback(async () => {
    const api = await fetchMonitorSummary({ force: true })
    const mapped = mapMonitorSummaryFromApi(api)
    onSummaryChangeRef.current(mapped)
    return mapped
  }, [])

  const tickPoll = useCallback(async () => {
    try {
      const mapped = await pollSummaryOnce()
      const scan = mapped.activeScan
      if (scan) {
        hadActiveScanRef.current = true
        activeJobIdRef.current = scan.jobId
        return
      }
      if (hadActiveScanRef.current && activeJobIdRef.current) {
        stopPolling()
        hadActiveScanRef.current = false
        activeJobIdRef.current = null
        message.success('全库巡检已完成')
        await onRefreshListRef.current()
      }
    } catch {
      /* 单次轮询失败不打断，下次继续 */
    }
  }, [message, pollSummaryOnce, stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    void tickPoll()
    pollTimerRef.current = setInterval(() => {
      void tickPoll()
    }, POLL_INTERVAL_MS)
  }, [stopPolling, tickPoll])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  /** 进入页面时若后端仍有 running/paused 任务，自动续轮询 */
  useEffect(() => {
    const scan = summary?.activeScan
    if (!scan || pollTimerRef.current) return
    activeJobIdRef.current = scan.jobId
    hadActiveScanRef.current = true
    startPolling()
  }, [summary?.activeScan?.jobId, summary?.activeScan?.status, startPolling])

  const runScan = useCallback(async () => {
    try {
      const res = await triggerWarningsScan()
      activeJobIdRef.current = res.job_id ?? null
      hadActiveScanRef.current = false
      message.success(res.message || '巡检已触发')
      startPolling()
      await onRefreshListRef.current()
    } catch (e) {
      if (e instanceof WarningsApiError && e.status === 409) {
        message.warning(e.message || '巡检进行中，请等待当前任务完成或先暂停')
        try {
          startPolling()
        } catch {
          /* ignore */
        }
        return
      }
      message.error(e instanceof WarningsApiError ? e.message : '巡检失败')
    }
  }, [message, startPolling])

  const pauseScan = useCallback(async () => {
    const jobId = summary?.activeScan?.jobId ?? activeJobIdRef.current
    if (!jobId) return
    try {
      const res = await pauseWarningsScan(jobId)
      message.success(res.message ?? '暂停请求已提交')
      await pollSummaryOnce()
    } catch (e) {
      message.error(e instanceof WarningsApiError ? e.message : '暂停失败')
    }
  }, [message, pollSummaryOnce, summary?.activeScan?.jobId])

  const resumeScan = useCallback(async () => {
    const jobId = summary?.activeScan?.jobId ?? activeJobIdRef.current
    if (!jobId) return
    try {
      const res = await resumeWarningsScan(jobId)
      activeJobIdRef.current = res.job_id ?? jobId
      message.success(res.message ?? '巡检已继续')
      startPolling()
      await pollSummaryOnce()
    } catch (e) {
      message.error(e instanceof WarningsApiError ? e.message : '继续巡检失败')
    }
  }, [message, pollSummaryOnce, startPolling, summary?.activeScan?.jobId])

  const activeScan = summary?.activeScan ?? null
  const scanInProgress = Boolean(activeScan)

  return {
    runScan,
    pauseScan,
    resumeScan,
    scanInProgress,
    activeScan,
  }
}
