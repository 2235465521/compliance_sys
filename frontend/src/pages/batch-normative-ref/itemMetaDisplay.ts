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

/** 企业所在地（省/市等），用于通报头与名单行尾标注 */
export function pickLocationForItem(item: BatchNormativeRefItemOut | null): string {
  return (
    pickItemStringField(item, [
      'province',
      'province_name',
      'provinceName',
      'city',
      'city_name',
      'cityName',
      'region',
      'region_name',
      'regionName',
      'location',
      'area',
      'enterprise_region',
      'enterpriseRegion',
      '所在地',
    ]) || ''
  )
}

/** 企标简称 / 常用名：STSC `subject_name` 优先，兼容 Dify 旧键 */
export function pickQbShortName(item: BatchNormativeRefItemOut | null): string {
  return (
    pickItemStringField(item, ['subject_name', 'subjectName']) ||
    pickItemStringField(item, ['qb_name', 'qbName', 'short_name', 'shortName']) ||
    pickItemStringField(item, ['enterprise_standard_name', 'enterpriseStandardName']) ||
    ''
  )
}

/** 标准（备案）名称：偏完整标题，与「企标名」行区分 */
export function pickQbStandardTitle(item: BatchNormativeRefItemOut | null): string {
  return pickItemStringField(item, [
    'subject_name',
    'subjectName',
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

/** 企标号（STSC `subject_code`；UI 域内仍称 qbCode） */
export function pickQbCode(item: BatchNormativeRefItemOut | null): string {
  return (
    pickItemStringField(item, [
      'subject_code',
      'subjectCode',
      'qb_code',
      'qbCode',
      'enterprise_std_code',
      'enterpriseStdCode',
    ]) || ''
  )
}

/** STSC 企标号别名，与 {@link pickQbCode} 等价 */
export const pickSubjectCode = pickQbCode

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
