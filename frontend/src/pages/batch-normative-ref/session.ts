const SESSION_LAST_JOB = 'batch_normative_ref_last_job_id'
const SESSION_LAST_JOB_LABEL = 'batch_normative_ref_last_job_label'

/** 后端 `label` 字段上限（与 POST /jobs 约定一致） */
export const BATCH_JOB_LABEL_MAX_LEN = 256

export function displayBatchJobLabel(label: string | null | undefined): string {
  const t = label?.trim()
  return t ? t : '未命名任务'
}

export function rememberLastBatchNormativeRefJob(id: number, label?: string | null) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(SESSION_LAST_JOB, String(id))
  const name = label?.trim()
  if (name) {
    sessionStorage.setItem(SESSION_LAST_JOB_LABEL, name)
  }
}

export function getLastBatchNormativeRefJobId(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(SESSION_LAST_JOB)
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function getLastBatchNormativeRefJobLabel(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(SESSION_LAST_JOB_LABEL)
  return raw?.trim() ? raw.trim() : null
}
