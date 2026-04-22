# 合规性评价模块已接入接口清单

## 文档对账结论

- `docs/frontend-parallel-dev/成员二-合规性评价.md` 与 `README.md` 主要约束的是目录和协作方式，并未定义具体后端接口命名。
- 合规模块接口命名实际以 `frontend/src/services/compliance.ts` 为准。
- 下列接口已在前端服务层完成封装，其中“已用于页面”表示当前已在合规页面逻辑中调用。

## 已用于合规页面的接口

| 前端方法 | 接口 | 方法 | 用途 |
|---|---|---|---|
| `getComplianceTasks()` | `/api/standards/` | GET | 合规任务/标准列表 |
| `uploadEnterpriseStandard()` | `/api/standards/batch-references/` | POST | 批量上传并解析规范性引用 |
| `postInsertIndexes()` | `/api/standards/batch-indexes/` | POST | 批量上传并解析指标 |
| `getPendingIndexes()` | `/api/audit/pending_indexes/` | GET | 读取待审核指标 |
| `submitAuditDecision()` | `/api/audit/submit/` | POST | 单条审核裁决 |
| `submitAuditBulkDecision()` | `/api/audit/bulk_submit/` | POST | 批量审核裁决 |
| `getNationalIndexes()` | `/api/indexes_table/` | GET | 查询指标库（含 `bz_id` 过滤） |
| `checkLatestStandard()` | `/api/standards/check-latest/` | GET | 引用标准最新性与更替链 |
| `saveReferenceMapping()` | `/api/save_mapping/`、`/api/mapping/save/` | POST | 保存旧引用到最新标准映射 |
| `exportComplianceReport()` | `/api/standards/export-report/` | GET | 导出单标准报告 |

## 当前已实现功能清单（页面层）

| 模块步骤 | 已实现功能 | 主要依赖接口 |
|---|---|---|
| 第1步 企标文件上传 | 批量上传文档、并行触发“规范性引用+指标”解析 | `/api/standards/batch-references/`、`/api/standards/batch-indexes/` |
| 第2步 描述性合规评价 | 可编辑企标号/企业名、结构化人工审核、结论同步第6步 | 无新增后端依赖（前端态） |
| 第3步 提取审核 | 规范性引用与企标指标双表人工审核（单条/批量） | `/api/audit/pending_indexes/`、`/api/audit/submit/`、`/api/audit/bulk_submit/` |
| 第4步 有效性与更替 | 生成有效性、人工确认数据完整并批量映射入库、支持新增最新标准编号 | `/api/standards/check-latest/`、`/api/save_mapping/`、`/api/indexes_table/` |
| 第5步 指标映射与对比 | 拉取旧/最新标准指标、构建对比表、人工审核通过 | `/api/indexes_table/`、`/api/standards/check-latest/` |
| 第6步 总结与报告 | 自动统计检查清单、人工审核闭环校验、导出报告 | `/api/standards/export-report/` |

## 已封装、可直接启用的接口（本次新增）

| 前端方法 | 接口 | 方法 | 说明 |
|---|---|---|---|
| `exportComplianceReportBatch()` | `/api/standards/export-report/` | POST | 按 `bz_ids` 批量导出报告 |
| `getStandardsBasicSearch()` | `/api/standards/basic-search/` | GET | 工作台基础搜索 |
| `getStandardsWarningTrace()` | `/api/standards/warning-trace/` | GET | 级联依赖反向预警追踪 |
| `getStandardsDashboardAlerts()` | `/api/standards/dashboard-alerts/` | GET | 生命周期提醒 |
| `getStandardsStatistics()` | `/api/standards/statistics/` | GET | 大屏统计 |
| `downloadStandardDoc()` | `/api/standards/download-doc/` | GET | 下载标准 PDF |
| `analyzeQbReferencesAuto()` | `/api/analyze_qb_references_auto/` | POST | 旧版异步企标解析入口（保留封装） |
| `getDifyPrefaceDiff()` | `/api/dify/preface-diff/` | GET | 前言修订差异提取 |
| `getTreeData()` | `/api/get_tree_data/` | GET | 标准演变家族树数据 |

## 备注

- 当前业务页主要依赖“新批量上传链路”（`batch-references` / `batch-indexes`）。
- 若后续需要快速接入“查找/预警/图谱/前言差异”能力，可直接在页面中调用本文件新增方法，无需再改 service 层。
