import type { MonitorEnterpriseMonitorStatus } from '@/types/warnings'

export const MONITOR_STATUS_TAG_META: Record<
  MonitorEnterpriseMonitorStatus,
  { label: string; color: string }
> = {
  need_attention: { label: '需更新', color: 'orange' },
  all_ok: { label: '状态良好', color: 'green' },
  partial: { label: '部分需人工核对', color: 'blue' },
  no_eval_record: { label: '无评价记录', color: 'default' },
  not_scanned: { label: '尚未巡检', color: 'default' },
}

export function monitorStatusLabel(
  status: MonitorEnterpriseMonitorStatus,
  apiLabel?: string,
): string {
  if (apiLabel?.trim()) return apiLabel.trim()
  return MONITOR_STATUS_TAG_META[status]?.label ?? status
}

/** 有快照、可下钻五列比对 */
export function canOpenMonitorDetail(status: MonitorEnterpriseMonitorStatus): boolean {
  return status === 'need_attention' || status === 'all_ok' || status === 'partial'
}
