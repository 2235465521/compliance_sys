import { useEffect, useRef, useState } from 'react'
import type { BatchNormativeRefJobOut } from '@/types/batch-normative-ref'
import { getBatchNormativeRefJob } from '@/services/batch-normative-reference'
import { shouldPollBatchNormativeRefJob } from '@/pages/batch-normative-ref/batchJobProgress'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'

export function useBatchNormativeRefJobPoll(jobId: number | null, options?: { intervalMs?: number }) {
  const [job, setJob] = useState<BatchNormativeRefJobOut | null>(null)
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
        const j = await getBatchNormativeRefJob(jobId)
        if (cancelled) return
        setJob(j)
        if (!shouldPollBatchNormativeRefJob(j) && timerRef.current) {
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

  return { job, loading, error }
}
