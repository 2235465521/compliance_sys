const LS_KEY = 'batch_normative_ref_label_last'

function readLastAssigned(): number {
  if (typeof localStorage === 'undefined') return 0
  const raw = localStorage.getItem(LS_KEY)
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** 创建任务前调用：首次为「批次 1」，成功后需再调用 commit */
export function getLabelForNextCreate(): string {
  return `批次 ${readLastAssigned() + 1}`
}

/** 仅在 POST /jobs 成功后调用，避免失败也跳号 */
export function commitBatchLabelAfterSuccessfulCreate(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(LS_KEY, String(readLastAssigned() + 1))
}
