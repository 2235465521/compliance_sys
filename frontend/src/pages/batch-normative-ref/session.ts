const SESSION_LAST_JOB = 'batch_normative_ref_last_job_id'

export function rememberLastBatchNormativeRefJobId(id: number) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(SESSION_LAST_JOB, String(id))
}

export function getLastBatchNormativeRefJobId(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(SESSION_LAST_JOB)
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}
