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

### 2.4 回退编辑作废策略（已实现）

当用户已完成第 5 步，又回到第 3/4 步 **修改并 confirm** 时（`current_step` 已大于该步时允许重提）：

| 操作 | 后端行为 |
|------|----------|
| 重提 **审核 3** | 清空 `compare_result_json`；`step5_compare_confirmed=false`；`step4_indicators_confirmed=false`；`current_step=4` |
| 重提 **审核 4** | 清空对比；`step5_compare_confirmed=false`；`current_step=5`（保留 `step4_indicators_confirmed`） |

前端应在 `has_compare_result=false` 时提示：「引用/指标已变更，请重新构建技术指标对比」。

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

### 4.3 删除任务（已实现）

```http
DELETE /api/v1/compliance/evaluations/{task_id}
```

| 规则 | 说明 |
|------|------|
| 允许 | 任意 `current_step`（含已完成 `>= 6`） |
| 解析中 | `parse_status` 为 `pending` / `running` → 409 |
| 成功 | **204 No Content** |

归档接口 `POST .../archive` 仍为备选，未实现。

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

- [x] 完成 POST compare 后，**仅** `GET compare/result` 返回相同 `compare_result`，且**不**触发 Dify③（查日志/worker）  
- [x] 前端：第 6 步 → 第 3 步 → 第 5 步，对比表仍在，无需重新点击「构建对比预览」  
- [x] `GET /evaluations` 列表含 `qb_code`、`current_step`、`uploaded_file_name`（带 query 时分页对象）  
- [x] 新建任务后进入 `/compliance/evaluations/{id}`，`current_step` 与 Steps 禁用态一致  
- [x] 第 2 步链接打开 document 页，能下载/预览上传 PDF（`artifacts` 含 `uploaded_qb`）或看到 parse_result  
- [ ] 未 confirm step2 时，顶部 Steps 无法点 step3（index 2）（前端行为）  
- [x] 修改 step3 confirm 后（`current_step>3` 重提），`has_compare_result=false`、`current_step=4`，前端提示重算

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
