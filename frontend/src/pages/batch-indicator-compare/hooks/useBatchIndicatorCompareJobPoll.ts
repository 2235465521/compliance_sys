import { useEffect, useRef, useState } from 'react'
import type { BatchIndicatorCompareJobOut } from '@/types/batch-indicator-compare'
import { getBatchIndicatorCompareJob } from '@/services/batch-indicator-compare'
import { shouldPollBatchIndicatorCompareJob } from '@/pages/batch-indicator-compare/batchIndicatorCompareProgress'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'

export function useBatchIndicatorCompareJobPoll(jobId: number | null, options?: { intervalMs?: number }) {
  const [job, setJob] = useState<BatchIndicatorCompareJobOut | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalMs = options?.intervalMs ?? 2000
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firstLoadRef = useRef(true)

  useEffect(() => {
    if (jobId == null || !Number.isFinite(jobId)) {
      setJob(null)
      setError(null)
      firstLoadRef.current = true
      return
    }

    let cancelled = false
    firstLoadRef.current = true

    const tick = async () => {
      const isFirst = firstLoadRef.current
      try {
        if (isFirst) setLoading(true)
        setError(null)
        const j = await getBatchIndicatorCompareJob(jobId)
        if (cancelled) return
        setJob(j)
        if (!shouldPollBatchIndicatorCompareJob(j) && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      } catch (e) {
        if (!cancelled) {
          setError(getComplianceApiErrorMessage(e))
        }
      } finally {
        if (!cancelled) {
          if (isFirst) {
            setLoading(false)
            firstLoadRef.current = false
          }
        }
      }
    }

    void tick()
    timerRef.current = setInterval(() => void tick(), intervalMs)

    return () => {
      cancelled = true
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [jobId, intervalMs])

  return { job, loading, error, refresh: async () => {
    if (jobId == null) return
    const j = await getBatchIndicatorCompareJob(jobId)
    setJob(j)
  } }
}
