import type { BatchNormativeRefItemOut, BatchNormativeRefJobOut } from '@/types/batch-normative-ref'

/** 从子项或原始 JSON 上按多键尝试取值（兼容后端字段名差异） */
export function pickItemStringField(item: BatchNormativeRefItemOut | null, keys: string[]): string | undefined {
  if (!item) return undefined
  const rec = item as Record<string, unknown>
  for (const k of keys) {
    const v = rec[k]
    if (v == null || v === '') continue
    const s = String(v).trim()
    if (s) return s
  }
  return undefined
}

export function pickCompanyForItem(item: BatchNormativeRefItemOut | null, job: BatchNormativeRefJobOut | null): string {
  const fromItem = pickItemStringField(item, ['company_name', 'companyName', 'enterprise_name', 'enterpriseName'])
  if (fromItem) return fromItem
  if (job?.company_name?.trim()) return job.company_name.trim()
  return ''
}

/** 企标简称 / 常用名：qb_name 优先，其次 enterprise_standard_name */
export function pickQbShortName(item: BatchNormativeRefItemOut | null): string {
  return (
    pickItemStringField(item, ['qb_name', 'qbName', 'short_name', 'shortName']) ||
    pickItemStringField(item, ['enterprise_standard_name', 'enterpriseStandardName']) ||
    ''
  )
}

/** 标准（备案）名称：偏完整标题，与「企标名」行区分 */
export function pickQbStandardTitle(item: BatchNormativeRefItemOut | null): string {
  return pickItemStringField(item, [
    'qb_title',
    'qbTitle',
    'standard_name',
    'standardName',
    'std_name',
    'stdName',
    'full_name',
    'fullName',
    'enterprise_standard_name',
    'enterpriseStandardName',
  ]) || ''
}

export function pickQbCode(item: BatchNormativeRefItemOut | null): string {
  return pickItemStringField(item, ['qb_code', 'qbCode', 'enterprise_std_code', 'enterpriseStdCode']) || ''
}

/** 实施时间 / 发布实施相关日期 */
export function pickImplementationDateText(item: BatchNormativeRefItemOut | null): string {
  return (
    pickItemStringField(item, [
      'implementation_date',
      'implementationDate',
      'implement_date',
      'implementDate',
      'effective_date',
      'effectiveDate',
      'std_effective_date',
      'stdEffectiveDate',
      'publish_date',
      'publishDate',
      'qibiao_implement_date',
      'qibiaoImplementDate',
      '实施日期',
      '实施时间',
    ]) || ''
  )
}

export function displayOrDash(value: string): string {
  return value.trim() ? value.trim() : '—'
}
