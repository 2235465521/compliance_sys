/**
 * 新合规模块 HTTP 封装 — 前缀 `/api/v1/compliance`（经 complianceClient）。
 * 手册：docs/backend-compliance-API-前端对接手册.md
 */
import { complianceClient } from '@/services/compliance-client'
import type {
  ArtifactsListOut,
  ComplianceTaskOut,
  ModuleMetaOut,
  NationalStandardUploadOut,
  Step1ConfirmIn,
  Step1Out,
  Step2ConfirmIn,
  Step2Out,
  Step3ConfirmIn,
  NationalIndicatorListOut,
  NationalIndicatorReviewIn,
  NationalIndicatorReviewOut,
  NationalIndicatorSaveIn,
  NationalIndicatorSaveOut,
  Step4IndicatorsEnsureIn,
  Step4IndicatorsEnsureOut,
  Step4IndicatorsOut,
  Step5CompareIn,
  Step5CompareOut,
  SummaryOut,
  SupplementsBodyIn,
} from '@/types/compliance-api'

export async function getComplianceModuleMeta(): Promise<ModuleMetaOut> {
  const { data } = await complianceClient.get<ModuleMetaOut>('/module')
  return data
}

export async function createEvaluation(): Promise<ComplianceTaskOut> {
  const { data } = await complianceClient.post<ComplianceTaskOut>('/evaluations')
  return data
}

export async function listEvaluations(): Promise<ComplianceTaskOut[]> {
  const { data } = await complianceClient.get<ComplianceTaskOut[]>('/evaluations')
  return data
}

export async function getEvaluation(taskId: number): Promise<ComplianceTaskOut> {
  const { data } = await complianceClient.get<ComplianceTaskOut>(`/evaluations/${taskId}`)
  return data
}

/** 删除评价任务（未完成草稿）；见 docs/backend-compliance-过程控制与草稿-后端需求说明.md §4.3 */
export async function deleteEvaluation(taskId: number): Promise<void> {
  await complianceClient.delete(`/evaluations/${taskId}`)
}

export async function uploadEvaluationFile(taskId: number, file: File): Promise<ComplianceTaskOut> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await complianceClient.post<ComplianceTaskOut>(
    `/evaluations/${taskId}/upload`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  )
  return data
}

export async function getStep1(taskId: number): Promise<Step1Out> {
  const { data } = await complianceClient.get<Step1Out>(`/evaluations/${taskId}/step/1`)
  return data
}

export async function confirmStep1(taskId: number, body: Step1ConfirmIn): Promise<ComplianceTaskOut> {
  const { data } = await complianceClient.post<ComplianceTaskOut>(
    `/evaluations/${taskId}/step/1/confirm`,
    body,
  )
  return data
}

export async function getStep2(taskId: number): Promise<Step2Out> {
  const { data } = await complianceClient.get<Step2Out>(`/evaluations/${taskId}/step/2`)
  return data
}

export async function confirmStep2(taskId: number, body: Step2ConfirmIn): Promise<ComplianceTaskOut> {
  const { data } = await complianceClient.post<ComplianceTaskOut>(
    `/evaluations/${taskId}/step/2/confirm`,
    body,
  )
  return data
}

/**
 * 根结构（2026-05）：`{ references, file_compliance_outcome }`；旧版可能为数组或含 `all_references_are_latest`。
 * 解析见 `compliance.ts` 中 `parseReferenceLatestRows`、`getFileComplianceOutcomeFromPayload`。
 */
export async function getStep3ReferenceLatest(taskId: number): Promise<unknown> {
  const { data } = await complianceClient.get<unknown>(`/evaluations/${taskId}/step/3/reference-latest`)
  return data
}

export async function postStep3Supplements(
  taskId: number,
  body: SupplementsBodyIn,
): Promise<ComplianceTaskOut> {
  const { data } = await complianceClient.post<ComplianceTaskOut>(
    `/evaluations/${taskId}/step/3/supplements`,
    body,
  )
  return data
}

export async function confirmStep3(taskId: number, body: Step3ConfirmIn): Promise<ComplianceTaskOut> {
  const { data } = await complianceClient.post<ComplianceTaskOut>(
    `/evaluations/${taskId}/step/3/confirm`,
    body,
  )
  return data
}

export async function getStep4Indicators(taskId: number): Promise<Step4IndicatorsOut> {
  const { data } = await complianceClient.get<Step4IndicatorsOut>(
    `/evaluations/${taskId}/step/4/indicators`,
  )
  return data
}

/** 第五步：按 ③ 可对比标准两列标准号编排指标（查库 / 自动 Dify② / 返回缺件） */
export async function postStep4IndicatorsEnsure(
  taskId: number,
  body: Step4IndicatorsEnsureIn,
): Promise<Step4IndicatorsEnsureOut> {
  const { data } = await complianceClient.post<Step4IndicatorsEnsureOut>(
    `/evaluations/${taskId}/step/4/indicators/ensure`,
    body,
  )
  return data
}

/** 按标准号查询国标指标明细（含 manual_review_status） */
export async function getNationalIndicatorsByStd(
  taskId: number,
  stdCode: string,
): Promise<NationalIndicatorListOut> {
  const { data } = await complianceClient.get<NationalIndicatorListOut>(
    `/evaluations/${taskId}/step/4/national-indicators`,
    { params: { std_code: stdCode } },
  )
  return data
}

/** 审核国标指标记录（整标准一条 DB 行，Dify② 解析后为 pending） */
export async function postNationalIndicatorReview(
  taskId: number,
  stdCode: string,
  body: Omit<NationalIndicatorReviewIn, 'std_code'>,
): Promise<NationalIndicatorReviewOut> {
  const { data } = await complianceClient.post<NationalIndicatorReviewOut>(
    `/evaluations/${taskId}/step/4/national-indicators/review`,
    { std_code: stdCode, ...body },
  )
  return data
}

/** 保存编辑后的 indexes JSON（更新 specific_indicator_value，状态一般保持 pending） */
export async function putNationalIndicatorSave(
  taskId: number,
  body: NationalIndicatorSaveIn,
): Promise<NationalIndicatorSaveOut> {
  const { data } = await complianceClient.put<NationalIndicatorSaveOut>(
    `/evaluations/${taskId}/step/4/national-indicators`,
    body,
  )
  return data
}

export async function confirmStep4(taskId: number): Promise<ComplianceTaskOut> {
  const { data } = await complianceClient.post<ComplianceTaskOut>(
    `/evaluations/${taskId}/step/4/confirm`,
  )
  return data
}

export async function uploadNationalStandard(stdCode: string, file: File): Promise<NationalStandardUploadOut> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await complianceClient.post<NationalStandardUploadOut>(
    '/national-standards/upload',
    form,
    {
      params: { std_code: stdCode },
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  )
  return data
}

export async function getStep5Compare(taskId: number): Promise<Step5CompareOut> {
  const { data } = await complianceClient.get<Step5CompareOut>(
    `/evaluations/${taskId}/step/5/compare`,
  )
  return data
}

/**
 * 只读已保存的对比结果（不触发 Dify③）。
 * 后端未实现时返回 null，由调用方降级。
 */
export async function getStep5CompareResult(taskId: number): Promise<Step5CompareOut | null> {
  try {
    const { data } = await complianceClient.get<Step5CompareOut>(
      `/evaluations/${taskId}/step/5/compare/result`,
    )
    return data
  } catch (e: unknown) {
    const status =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { status?: number } }).response?.status
        : undefined
    if (status === 404 || status === 405) return null
    throw e
  }
}

/** 构建对比：可选带 compare_pairs 先刷新编排再调 Dify③；失败时由调用方回退 GET */
export async function postStep5Compare(
  taskId: number,
  body?: Step5CompareIn,
): Promise<Step5CompareOut> {
  const { data } = await complianceClient.post<Step5CompareOut>(
    `/evaluations/${taskId}/step/5/compare`,
    body ?? {},
  )
  return data
}

export async function confirmStep5(taskId: number): Promise<ComplianceTaskOut> {
  const { data } = await complianceClient.post<ComplianceTaskOut>(
    `/evaluations/${taskId}/step/5/confirm`,
  )
  return data
}

export async function getSummary(taskId: number): Promise<SummaryOut> {
  const { data } = await complianceClient.get<SummaryOut>(`/evaluations/${taskId}/summary`)
  return data
}

export async function listArtifacts(taskId: number): Promise<ArtifactsListOut> {
  const { data } = await complianceClient.get<ArtifactsListOut>(`/evaluations/${taskId}/artifacts`)
  return data
}

export async function downloadArtifactFile(taskId: number, path: string): Promise<Blob> {
  const { data } = await complianceClient.get<Blob>(`/evaluations/${taskId}/artifacts/file`, {
    params: { path },
    responseType: 'blob',
  })
  return data
}
