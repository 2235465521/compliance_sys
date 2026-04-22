// 合规性评价任务类型
export interface ComplianceTask {
  id: string;
  name: string;
  enterprise: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createTime: string;
  deadline: string;
  evaluator: string;
  steps: ComplianceStep[];
}

// 合规性评价步骤类型
export interface ComplianceStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  order: number;
  completedTime?: string;
}

// 企业标准解析结果类型
export interface EnterpriseStandardAnalysis {
  id: string;
  fileName: string;
  fileType: string;
  analysisStatus: 'pending' | 'processing' | 'completed' | 'failed';
  references: StandardReference[];
  technicalIndicators: TechnicalIndicator[];
  analysisTime?: string;
}

// 标准引用类型
export interface StandardReference {
  id: string;
  standardNumber: string;
  standardName: string;
  standardStatus: 'active' | 'deprecated' | 'unknown';
  latestVersion?: string;
}

// 技术指标类型
export interface TechnicalIndicator {
  id: string;
  indicatorName: string;
  enterpriseValue: string;
  nationalStandardValue?: string;
  comparisonResult: 'compliant' | 'non-compliant' | 'unknown';
  deviation?: string;
}

// 指标比对结果类型
export interface IndicatorComparison {
  id: string;
  taskId: string;
  comparisonTime: string;
  totalIndicators: number;
  compliantIndicators: number;
  nonCompliantIndicators: number;
  unknownIndicators: number;
  details: IndicatorComparisonDetail[];
}

// 指标比对详情类型
export interface IndicatorComparisonDetail {
  id: string;
  indicatorName: string;
  enterpriseValue: string;
  nationalStandardValue: string;
  comparisonResult: 'compliant' | 'non-compliant' | 'unknown';
  deviation?: string;
  description?: string;
}

// 合规性评价报告类型
export interface ComplianceReport {
  id: string;
  taskId: string;
  reportNumber: string;
  reportStatus: 'pending' | 'processing' | 'completed' | 'failed';
  reportUrl?: string;
  generateTime?: string;
  evaluationResult: 'compliant' | 'non-compliant' | 'partially-compliant';
  evaluationSummary: string;
}

// 合规性评价统计数据类型
export interface ComplianceStatistics {
  totalTasks: number;
  pendingTasks: number;
  processingTasks: number;
  completedTasks: number;
  failedTasks: number;
  overdueTasks: number;
  complianceRate: number;
  averageEvaluationTime: number;
}

// 合规性评价请求参数类型
export interface CreateComplianceTaskRequest {
  name: string;
  enterpriseId: string;
  enterpriseName: string;
  standardFileId: string;
  evaluatorId: string;
  evaluatorName: string;
  deadline?: string;
}

// 提交合规性评价步骤请求参数类型
export interface SubmitComplianceStepRequest {
  stepId: string;
  taskId: string;
  data: any;
  remarks?: string;
}

// 生成合规性评价报告请求参数类型
export interface GenerateComplianceReportRequest {
  taskId: string;
  reportType: 'certificate' | 'analysis' | 'detailed';
  includeAttachments?: boolean;
}

// 合规性评价历史记录类型
export interface ComplianceHistory {
  id: string;
  taskId: string;
  operation: string;
  operator: string;
  operationTime: string;
  details?: any;
}

// 合规性评价规则类型
export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  ruleType: 'descriptive' | 'normative' | 'technical';
  ruleContent: any;
  status: 'active' | 'inactive';
  priority: number;
}

// 合规性评价预设类型
export interface CompliancePreset {
  id: string;
  name: string;
  description: string;
  presetType: 'standard' | 'custom';
  rules: ComplianceRule[];
  status: 'active' | 'inactive';
}

// 合规性评价审核意见类型
export interface ComplianceAuditOpinion {
  id: string;
  taskId: string;
  stepId: string;
  auditor: string;
  auditTime: string;
  auditResult: 'approve' | 'reject' | 'pending';
  auditOpinion: string;
  auditDetails?: any;
}