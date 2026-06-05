# 合规性评价 — 过程控制、草稿与步骤快照（后端需求说明）

> **读者**：后端开发  
> **前端状态**：已按本文档约定实现调用逻辑（含 `GET .../step/5/compare/result` 优先、任务中心、企标正文页）；若接口未就绪，前端会降级并提示。  
> **契约基线**：[backend-compliance-API-前端对接手册.md](./backend-compliance-API-前端对接手册.md)、[backend-compliance-前端接入流程指南.md](./backend-compliance-前端接入流程指南.md)

---

## 1. 背景与前端改造范围

| 需求 | 用户痛点 | 前端已做 | 依赖后端 |
|------|----------|----------|----------|
| R1 步骤回退数据保留 | 第 6 步回第 3 步再回第 6 步，第 5 步对比消失 | 进入步骤时 hydrate；离开第 5 步不清 `compareLoaded`；bootstrap 后恢复对比 | **只读对比快照**、步骤快照 |
| R2 描述性评价看企标正文 | 第 2 步需对照原件 | 新页 `/compliance/evaluations/:taskId/document` | artifacts、parse_result 字段 |
| R3 入口为历史/草稿 | 进入模块不应直接落在上次步骤 | `/compliance` 任务中心；`/compliance/evaluations/:id` 向导 | 列表字段与筛选 |
| R4 单向步骤 | 未完成 confirm 不可跳后序；回看已解锁前序步 | 统一 `navigateToWizardStep`，与 `current_step` 对齐 | `current_step` 权威、回退作废策略 |

---

## 2. 第 5 步对比持久化与只读查询（P0）

### 2.1 问题

现有 `GET /api/v1/compliance/evaluations/{task_id}/step/5/compare` **每次调用会执行 Dify 工作流③**（见手册 §4.16），不适合用户「回退查看」时重复触发。前端回退后需读取已写入的 `compare_result_json`，**不得再次跑工作流**。

### 2.2 建议新接口（必须）

```http
GET /api/v1/compliance/evaluations/{task_id}/step/5/compare/result
```

| 项 | 说明 |
|----|------|
| 鉴权 | 与同模块其他接口一致 |
| 前置 | 任务存在；**不要求** `current_step===5`（允许用户在第 6 步回看第 5 步数据） |
| 行为 | **只读** `evaluation_task.compare_result_json`（或等价字段），**不调用** Dify③ |
| 响应 200 | 与现有 `Step5CompareOut` 一致：`{ "compare_result": { ... } }` |
| 响应 404 | 尚未生成过对比（从未成功 GET/POST compare） |
| 响应 422 | 任务不存在等 |

**与现有接口关系**：

| 接口 | 用途 |
|------|------|
| `POST .../step/5/compare` | 用户点击「构建对比」：可带 `compare_pairs`，跑 Dify③，写库 |
| `GET .../step/5/compare` | 保留：首次构建或强制重算（可文档标明副作用） |
| **`GET .../step/5/compare/result`** | **回退/刷新 hydrate**：仅读库 |

### 2.3 任务详情扩展（建议）

在 `GET /evaluations/{task_id}` 的 `ComplianceTaskOut` 增加：

| 字段 | 类型 | 说明 |
|------|------|------|
| `has_compare_result` | `boolean` | `compare_result_json` 非空且可解析 |
| `compare_result_updated_at` | `string \| null` | ISO8601 |
| `step4_indicators_confirmed` | `boolean` | 可选，便于前端判断能否构建对比 |

### 2.4 回退编辑作废策略（需产品确认后实现）

当用户已完成第 5 步，又回到第 3/4 步 **修改并 confirm** 时，建议：

1. 将 `compare_result_json` 置空或标记 `compare_invalidated: true`  
2. `current_step` 回退到 **4** 或 **5**（勿保持 6）  
3. 前端提示：「引用/指标已变更，请重新构建技术指标对比」

若暂不做作废，须在文档中写明「回退编辑不会自动失效第 5 步结果」，避免数据不一致。

---

## 3. 企标正文预览（P1）

### 3.1 前端数据优先级

1. `GET .../artifacts` → `GET .../artifacts/file?path=`（上传的 PDF/Word）  
2. `GET .../step/1` 的 `parse_result`（结构化字段 + `references_detail[].full_text`）  
3. （次要）国标库 `GET /api/v1/standards/detail-text/preview/?bz_id=` — 仅当企标号恰好在国标库

### 3.2 artifacts 约定（请后端明确）

在 `GET .../artifacts` 每条 `ArtifactItem` 中建议：

| 字段 | 说明 |
|------|------|
| `kind` | 固定枚举：`uploaded_qb` \| `compare_cert_pdf` \| `other` |
| `label` | 展示名 |
| `path` | 相对 `MEDIA_ROOT` 路径，供 `artifacts/file` 使用 |
| `content_type` | 可选：`application/pdf` 等 |

上传文件应在 upload 成功后**立即**出现在 artifacts 列表。

### 3.3 可选聚合接口

```http
GET /api/v1/compliance/evaluations/{task_id}/enterprise-document
```

**响应 200 示例**：

```json
{
  "qb_code": "Q/ABC 001-2026",
  "qb_name": "某某企标",
  "company_name": "某某公司",
  "uploaded_file": {
    "artifact_path": "compliance_certs/12/企标.pdf",
    "content_type": "application/pdf",
    "download_url": "/api/v1/compliance/evaluations/12/artifacts/file?path=..."
  },
  "parse_result": { },
  "full_text": "可选：Dify① 抽取的全文 Markdown/HTML"
}
```

### 3.4 parse_result 扩展（可选）

在 `DifyWorkflow1Output` / `parse_result_json` 增加：

| 字段 | 类型 | 说明 |
|------|------|------|
| `document_full_text` | `string \| null` | 企标全文纯文本/Markdown，供无 PDF 预览时展示 |
| `document_sections` | `array` | `{ "title", "content" }` 分节 |

---

## 4. 任务列表与草稿（P1）

### 4.1 列表接口扩展

```http
GET /api/v1/compliance/evaluations?status=in_progress&page=1&page_size=20
```

| Query | 说明 |
|-------|------|
| `status` | `draft` \| `in_progress` \| `completed` \| `failed` \| `all`（默认 `all`） |
| `current_step_max` | 例如 `5` 表示 `current_step <= 5` |
| `qb_code` | 模糊搜索 |
| `page` / `page_size` | 分页 |

**响应**（建议由数组改为分页对象，兼容期可双写）：

```json
{
  "items": [ { /* ComplianceTaskOut + 扩展字段 */ } ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```

**`ComplianceTaskOut` 建议扩展**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `enterprise_name` | `string \| null` | 来自 parse_result.company_name |
| `updated_at` | `string` | ISO8601，列表排序 |
| `progress_percent` | `number` | `round(current_step/6*100)` 可由后端算 |
| `step_label` | `string` | 如「审核 3 / 步骤 4」 |

### 4.2 status 与 current_step 关系（建议）

| status | 条件 |
|--------|------|
| `draft` | `current_step===1` 且未 confirm step1 |
| `in_progress` | `1 < current_step < 6` 或 step6 未完成 |
| `completed` | `current_step >= 6` 且评价结果已写入 |
| `failed` | `parse_status===failed` |

### 4.3 删除评价任务（P0 — 任务列表「删除」按钮已对接）

前端任务中心 [`ComplianceTaskHub.tsx`](../frontend/src/pages/compliance/ComplianceTaskHub.tsx) 对 **`current_step < 6`** 的任务展示「删除」；已完成任务禁用删除并提示。

#### 4.3.1 接口定义

```http
DELETE /api/v1/compliance/evaluations/{task_id}
```

| 项 | 说明 |
|----|------|
| 路径参数 | `task_id`：整数，创建任务时返回的 `id` |
| 鉴权 | 与同模块一致；开启多租户时仅允许删除 `created_by` 为本人的任务 |
| 成功响应 | **204 No Content**，或 **200** + `{ "success": true, "message": "已删除" }`（二选一，前端按 2xx 视为成功） |
| 业务规则 | **禁止**删除 `current_step >= 6`（已完成）的任务，返回 **422**，`detail` 建议：`已完成评价不可删除` |
| 可选规则 | `parse_status === 'running'` 且 Celery 解析中：返回 **409**，提示稍后再删 |
| 副作用 | 删除 DB 中任务行及关联评价结果；删除 `compliance_certs/{task_id}/` 下制品文件（若存在） |

#### 4.3.2 错误码

| HTTP | 场景 | `detail` 示例 |
|------|------|----------------|
| 404 | 任务不存在 | `评价任务不存在` |
| 403 | 无权限 | `无权删除该任务` |
| 422 | 已完成 | `已完成评价不可删除` |
| 409 | 解析/巡检进行中 | `任务正在处理中，请稍后再试` |
| 503 | MySQL 要求未满足 | 同手册 §8 |

#### 4.3.3 前端调用

- 封装：`deleteEvaluation(taskId)` → [`compliance-api.ts`](../frontend/src/services/compliance-api.ts)  
- 适配：`deleteComplianceEvaluationTask(taskId)` → [`compliance.ts`](../frontend/src/services/compliance.ts)  
- 删除成功后若为本机 `localStorage` 当前任务 id，会清除 `compliance_evaluation_task_id`

#### 4.3.4 归档（P2，可选）

若需保留审计痕迹，可改为软删除：

```http
POST /api/v1/compliance/evaluations/{task_id}/archive
```

列表默认不返回 `archived=true` 的任务；前端可后续增加「已归档」筛选项。

---

## 5. 各步快照 API（P1，可分期）

统一模式：只读已 confirm 数据，**无副作用**。

| 路径 | 返回 |
|------|------|
| `GET .../step/1/snapshot` | `parse_result` + task 摘要 |
| `GET .../step/2/snapshot` | 同现 `GET step/2` |
| `GET .../step/3/snapshot` | reference-latest 缓存 + supplements |
| `GET .../step/4/snapshot` | indicators bundle |
| `GET .../step/5/snapshot` | 同 **compare/result** |
| `GET .../step/6/snapshot` | 同 `GET summary` |

首期 **仅需实现 `step/5/compare/result`** 即可解除前端最大痛点。

---

## 6. 联调检查清单

- [ ] 完成 POST compare 后，**仅** `GET compare/result` 返回相同 `compare_result`，且**不**触发 Dify③（查日志/worker）  
- [ ] 前端：第 6 步 → 第 3 步 → 第 5 步，对比表仍在，无需重新点击「构建对比预览」  
- [ ] `GET /evaluations` 列表含 `qb_code`、`current_step`、`uploaded_file_name`  
- [ ] 新建任务后进入 `/compliance/evaluations/{id}`，`current_step` 与 Steps 禁用态一致  
- [ ] 第 2 步链接打开 document 页，能下载/预览上传 PDF 或看到 parse_result  
- [ ] 未 confirm step2 时，顶部 Steps 无法点 step3（index 2）
- [ ] `DELETE /evaluations/{id}`：未完成可删、已完成返回 422；删后列表不再出现  
- [ ] 修改 step3 confirm 后，若实现作废策略，`has_compare_result=false` 且前端提示重算

---

## 7. 环境与依赖（引用）

| 变量/依赖 | 影响 |
|-----------|------|
| Celery + Dify① | 上传解析 |
| Dify② | 国标指标 |
| Dify③ | **仅** POST/GET compare（构建），**不应**在 compare/result 出现 |
| MySQL | step3+ 落库；SQLite 下多项为空 |
| `COMPLIANCE_REQUIRE_MYSQL` | true 时非 MySQL 返回 503 |

---

**文档版本**：2026-06，与合规向导过程控制改造同步。
