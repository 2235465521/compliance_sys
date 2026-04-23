/** 避免 StrictMode 双调用 effect 时重复触发演示解析 */
const scheduled = new Set<string>()

export function markParsingDemoScheduled(taskId: string) {
  if (scheduled.has(taskId)) return false
  scheduled.add(taskId)
  return true
}

export function clearParsingDemoScheduled(taskId: string) {
  scheduled.delete(taskId)
}
