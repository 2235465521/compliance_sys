# 合规性评价向导（1–6 步）与后端接口对照

本文档根据前端实现整理：**向导步骤标题**来自 `frontend/src/pages/compliance/ComplianceWizardPanel.tsx` 中的 `WIZARD_STEP_TITLES`；**接口路径**来自 `frontend/src/services/compliance.ts`（经 `frontend/src/services/request.ts` 拼接 `baseURL`，默认为 `import.meta.env.VITE_API_BASE_URL` 或 `'/api'`）。

> 说明：下列路径均为 **相对 `baseURL` 的路径**。完整 URL 形如 `{baseURL}/standards/batch-references/`。

---

## 页面级（不属于某一向导步，但常在同一页使用）

| 用途 | 方法 | 路径 | 封装函数 |
|------|------|------|----------|
| 合规任务/标准列表（侧栏任务数据源） | GET | `/standards/` | `getComplianceTasks` |
| Dify/Celery 解析完成推送（可选） | WebSocket | 默认推导为 `{去 /api 后的 host}/ws/dify_notifications/`，或由 `VITE_WS_DIFY_URL` 指定 | `useDifyNotifications` |

页头「快速上传」区域另见 **第 1 步** 同类接口（`uploadEnterpriseStandard`、`getNationalIndexes`、`getPendingIndexes` 等）。

---

## 第 1 步：企标文件上传

| 用途 | 方法 | 路径 | 封装函数 | 备注 |
|------|------|------|----------|------|
| 上传前记录待审核指标基线（用于只展示本次上传新增） | GET | `/audit/pending_indexes/` | `getPendingIndexes` | `runUpload` 开始时 |
| 上传前记录指标表基线 | GET | `/indexes_table/` | `getNationalIndexes` | 无 query 时拉全表再在前端做 id 过滤 |
| 企标解析：规范性引用等批量入库 | POST | `/standards/batch-references/` | `uploadEnterpriseStandard` | `multipart/form-data`，含 `file` / `files` / `files[]`，可选 `bz_id` |
| 企标解析：指标入专用表 | POST | `/standards/batch-indexes/` | `postInsertIndexes` | 同上 |
| 上传后轮询：待审核指标列表 | GET | `/audit/pending_indexes/` | `getPendingIndexes` | `refreshPending` / `pollPendingAfterUpload` |
| 轮询兜底：从指标表按 `bz_id` 回填 | GET | `/indexes_table/?bz_id={bz_id}` | `getNationalIndexes` | `loadExtractedFromIndexesTable`；无 `bz_id` 时用增量逻辑过滤 |

**第 1 步数据展示**：上传响应体在前端解析出引用行、企标号等，不额外依赖独立「描述性评价」接口。

---

## 第 2 步：描述性合规评价

| 用途 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 提交描述性审核结论 | — | **无** | `submitDescriptiveReview` 仅更新前端状态与同步第 6 步文案，**未调用**后端 |
| 导出第 2 步 CSV | — | **无** | `downloadDescriptiveComplianceCsv` 等纯浏览器下载 |

若用户在向导中点击「刷新提取结果」，仍会调用 **第 1 步** 中的 `getPendingIndexes`（与列表拉取同源）。

---

## 第 3 步：规范性引用与企标指标提取审核

| 用途 | 方法 | 路径 | 封装函数 |
|------|------|------|----------|
| 刷新待审核列表 | GET | `/audit/pending_indexes/` | `getPendingIndexes` |
| 单条通过/驳回 | POST | `/audit/submit/` | `submitAuditDecision`；Body 含 `id`、`action`，人工修正通过时额外含 `modified_bz_id`、`modified_index_name`、`modified_content` |
| 批量通过/驳回（待审核表或引用表） | POST | `/audit/bulk_submit/` | `submitAuditBulkDecision`；Body 含 `ids`、`action` |

---

## 第 4 步：引用标准有效性与更替确认

| 用途 | 方法 | 路径 | 封装函数 |
|------|------|------|----------|
| 批量校验引用标准是否最新、谱系链 | GET | `/standards/check-latest/?bz_id={标准号}` | `checkLatestStandard` |
| 人工补录「最新标准」时校验库中是否有指标 | GET | `/indexes_table/?bz_id={最新标准号}` | `getNationalIndexes` |
| 审核完成后写入企标-国标映射 | POST | `/save_mapping/` | `saveReferenceMapping`；若 404 则 fallback `POST /mapping/save/`（兼容路径） |

Body 字段（映射）：`enterprise_bz_id`、`national_bz_id`（前端对应「引用标准」与「当前最新标准」）。

第 4 步的 CSV 导出为前端生成，无独立接口。

---

## 第 5 步：指标映射与技术对比确认

| 用途 | 方法 | 路径 | 封装函数 |
|------|------|------|----------|
| 构建对比：按引用标准号拉旧版指标 | GET | `/indexes_table/?bz_id={引用标准号}` | `getNationalIndexes`（对每个引用编号并发请求） |
| 构建对比：每条引用是否最新及最新编号 | GET | `/standards/check-latest/?bz_id={引用标准号}` | `checkLatestStandard` |
| 构建对比：按「最新标准号」拉指标 | GET | `/indexes_table/?bz_id={最新标准号}` | `getNationalIndexes` |
| 补齐缺失引用文件（补传） | POST | `/standards/batch-references/` | `uploadEnterpriseStandard` |
| 补齐缺失引用文件（指标） | POST | `/standards/batch-indexes/` | `postInsertIndexes` |

「技术指标对比已人工审核通过」等操作在前端完成，**无单独提交接口**。

---

## 第 6 步：三项评价总结与报告生成

| 用途 | 方法 | 路径 | 封装函数 |
|------|------|------|----------|
| 导出合规报告（服务端生成文件流） | GET | `/standards/export-report/?bz_id={bz_id}` | `exportComplianceReport` |
| 批量导出（服务层已封装，向导主按钮以单标准为主） | POST | `/standards/export-report/` | `exportComplianceReportBatch`；Body：`{ bz_ids: string[] }`，`responseType: 'blob'` |

第 6 步中的描述性/技术性/有效性等 **段落 CSV 或文本导出**（如 `stepReportExport.ts`）为 **前端生成**，不请求后端。

---

## `compliance.ts` 中已定义、但向导流程未使用的接口

以下函数在 `frontend/src/services/compliance.ts` 中存在，**当前合规向导组件未 import 调用**（供其他模块或后续扩展）：

- `GET /standards/basic-search/` — `getStandardsBasicSearch`
- `GET /standards/warning-trace/` — `getStandardsWarningTrace`
- `GET /standards/download-doc/` — `downloadStandardDoc`
- `GET /standards/dashboard-alerts/` — `getStandardsDashboardAlerts`
- `GET /standards/statistics/` — `getStandardsStatistics`
- `POST /analyze_qb_references_auto/` — `analyzeQbReferencesAuto`
- `GET /dify/preface-diff/` — `getDifyPrefaceDiff`
- `GET /get_tree_data/` — `getTreeData`
- `POST /check_references/` — `checkReferencesComparison`
- `POST /insert_anti_warn/` — `postInsertAntiWarn`
- `GET /standards/{id}/` — `getComplianceTask`（任务详情；`useComplianceTask` 使用，向导不直接使用）
- `createComplianceTask` / `updateComplianceTask` / `deleteComplianceTask` — 当前为 **抛错占位**，无真实后端路径

---

## 文档生成说明

- 对照代码版本：`ComplianceWizardPanel.tsx`（`WIZARD_STEP_TITLES` 与 `current === 0..5` 分支）、`pages/compliance/index.tsx`、`services/compliance.ts`。
- 若后端路径与上文不一致，请以实际部署的 OpenAPI/接口文档为准，并同步修改 `compliance.ts` 中的常量。
