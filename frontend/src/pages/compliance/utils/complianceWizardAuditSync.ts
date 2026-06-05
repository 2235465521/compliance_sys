import type { PendingIndexItem } from '@/services/compliance'

/** 第3步表格行是否仍显示为「待审核」类文案（与 ComplianceWizardPanel step3ManualAuditSummary 一致） */
export function isStep3RowPendingAudit(statusText: string): boolean {
  const text = statusText || ''
  return text.includes('待') || text.includes('解析') || text.includes('确认')
}

/** 服务端已 confirm 审核2 后，刷新接口行状态仍为「解析提取（待审核）」时统一视为已通过 */
export function markStep3RowsApprovedIfNeeded(
  rows: PendingIndexItem[],
  serverConfirmedStep: number,
): PendingIndexItem[] {
  if (serverConfirmedStep < 3) return rows
  return rows.map((row) =>
    row.statusText.includes('审核通过') ? row : { ...row, statusText: '审核通过' },
  )
}

/**
 * 后端 `current_step` 与向导检查清单对应关系（confirm 成功后推进）：
 * - step>=2：审核1（描述性）已 confirm
 * - step>=3：审核2（提取）已 confirm
 * - step>=4：审核3（引标有效性）已 confirm
 * - step>=6：审核5（技术对比）已 confirm
 */
export function isDescriptiveAuditSatisfied(
  serverStep: number,
  localDecision: 'pending' | 'approve' | 'reject',
): boolean {
  return localDecision !== 'pending' || serverStep >= 2
}

export function isExtractAuditSatisfied(serverStep: number, localRowsAllApproved: boolean): boolean {
  return serverStep >= 3 || localRowsAllApproved
}

export function isValidityAuditSatisfied(
  serverStep: number,
  localMarkedComplete: boolean,
  validityRowCount: number,
): boolean {
  if (serverStep >= 4) return true
  return localMarkedComplete && validityRowCount > 0
}

export function isCompareAuditSatisfied(serverStep: number, localComparisonPassed: boolean): boolean {
  return serverStep >= 6 || localComparisonPassed
}
