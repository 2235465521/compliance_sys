/** 第五步「技术指标对比」表格行（对齐 GET step/5/compare → compare_result.markdown 表头） */
export type ComparePreviewRow = {
  id: string
  /** 序号 */
  rowNo?: string
  /** 指标类别 */
  indicatorCategory?: string
  /** 指标名称 */
  indicatorName: string
  /** 企标限值 */
  enterpriseValue: string
  /** 规范性引用标准号 */
  referenceStdCode?: string
  /** 国标限值 */
  matchedStandard: string
  /** 单项结果（如 ⚠️缺失、✅合规 (企标优于国标)） */
  nationalValue: string
  /** @deprecated 旧版 markdown 列「匹配情况」；Dify③ 新表无此列 */
  status: string
  source: 'enterprise_or_old' | 'manual'
  baselineStandard?: string
  latestStandard?: string
  /** 判决备注 */
  compareNote?: string
}
