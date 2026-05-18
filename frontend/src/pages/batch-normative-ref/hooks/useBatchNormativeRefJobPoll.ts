import { useEffect, useRef, useState } from 'react'
import type { BatchNormativeRefJobOut } from '@/types/batch-normative-ref'
import { getBatchNormativeRefJob } from '@/services/batch-normative-reference'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'

const TERMINAL = new Set(['completed', 'failed'])

export function useBatchNormativeRefJobPoll(jobId: number | null, options?: { intervalMs?: number }) {
  const [job, setJob] = useState<BatchNormativeRefJobOut | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalMs = options?.intervalMs ?? 2000
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (jobId == null || !Number.isFinite(jobId)) {
      setJob(null)
      setError(null)
      return
    }

    let cancelled = false

    const tick = async () => {
      try {
        setLoading(true)
        setError(null)
        const j = await getBatchNormativeRefJob(jobId)
        if (cancelled) return
        setJob(j)
        if (TERMINAL.has(j.status) && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      } catch (e) {
        if (!cancelled) {
          setError(getComplianceApiErrorMessage(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
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
