/** 企业档案 - 一企一库主档与企标子档（Mock 与后续后端契约对齐时同步修改） */
export type EnterpriseStatus = 'active' | 'inactive' | 'suspending'

/** 从文本/规则中提取的一条指标 */
export interface QibiaoIndicator {
  id: string
  name: string
  value: string
}

/** 单个企标在档案中的展示与编辑单元：基础信息 + 指标行 */
export interface EnterpriseQibiao {
  id: string
  /** 企标号 */
  stdNo: string
  /** 标准/产品名称等 */
  title: string
  /** 其他基础说明（可编辑长文本，演示用） */
  basicNote: string
  /** 提取出的可编辑指标 */
  indicators: QibiaoIndicator[]
  updatedAt: string
}

export interface Enterprise {
  id: string
  name: string
  /** 统一社会信用代码 */
  creditCode: string
  status: EnterpriseStatus
  address: string
  contactName: string
  contactPhone: string
  contactEmail: string
  remark: string
  createdAt: string
  updatedAt: string
  /** 本企业下各企标及其指标（一企多标） */
  qibiaoList: EnterpriseQibiao[]
}

export interface CreateEnterpriseInput {
  name: string
  creditCode: string
  status: EnterpriseStatus
  address: string
  contactName: string
  contactPhone: string
  contactEmail: string
  remark: string
}

export type UpdateEnterpriseInput = Partial<CreateEnterpriseInput> & {
  qibiaoList?: EnterpriseQibiao[]
}
