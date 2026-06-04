export type WizardSummaryDraft = {
  descriptive: string
  validity: string
  technical: string
}

export type WizardDraftPayload = {
  taskId: number
  summaryDraft?: WizardSummaryDraft
  current?: number
  updatedAt?: string
}

const LS_DRAFT = 'compliance-wizard-draft'

export function saveWizardDraft(payload: WizardDraftPayload): void {
  localStorage.setItem(LS_DRAFT, JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }))
}

export function loadWizardDraft(taskId: number): WizardDraftPayload | null {
  try {
    const raw = localStorage.getItem(LS_DRAFT)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WizardDraftPayload
    if (parsed.taskId !== taskId) return null
    return parsed
  } catch {
    return null
  }
}

export const emptyWizardSummaryDraft = (): WizardSummaryDraft => ({
  descriptive: '',
  validity: '',
  technical: '',
})
