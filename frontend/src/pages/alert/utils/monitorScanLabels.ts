/** 巡检进行中阶段文案（summary.active_scan.phase） */
export function monitorScanPhaseLabel(phase: string | null | undefined): string | null {
  if (phase === 'not_scanned') return '阶段：尚未巡检'
  if (phase === 'all_ok') return '阶段：状态良好复扫'
  return null
}
