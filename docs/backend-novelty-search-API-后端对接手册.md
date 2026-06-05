# 查新服务模块 API — 后端对接手册

本文档描述 **「查新服务」**（`/api/v1/novelty-search`）的 HTTP 接口契约，供后端实现与前端联调。该模块以 **企标号** 为入口，聚合本系统内历史 **合规评价**、**批量合规评价** 的规范性引用与指标，并以 **首次查新基线快照** 对比 **本次实时谱系查新** 结果，在比对明细中展示三列 + 行级/任务级结论。

**与合规模块、批量模块的关系**：

| 模块 | 路径 | 关系 |
|------|------|------|
| 合规评价 | `/api/v1/compliance` | 查新模块 **读取** 已完成 Step3 的映射与指标；**不**暴露 `evaluation_task_id` 给查新前端直接调 `reference-latest` |
| 批量合规 | `/api/v1/batch-normative-reference` | 查新模块 **读取** 子项 `references_resolved` 与指标 |
| 查新服务 | `/api/v1/novelty-search` | **独立任务表**；前端仅调用本模块 |

谱系解析逻辑应与 **`GET /api/v1/compliance/evaluations/{task_id}/step/3/reference-latest`** 使用同一套服务（`standard_pedigree`、`national_standard_basic`、时点推断规则），见《backend-compliance-API-前端对接手册》§4.10。

---

## 1. 通用约定

### 1.1 Base URL

```text
http://{host}:{port}/api/v1/novelty-search
```

下文相对路径均指 **`/api/v1/novelty-search`** 之后部分。

### 1.2 Content-Type

| 场景 | Content-Type |
|------|----------------|
| JSON 请求/响应 | `application/json; charset=utf-8` |
| 创建任务（含文件） | `multipart/form-data` |

### 1.3 鉴权

与合规模块一致，由环境变量 **`COMPLIANCE_API_AUTH_REQUIRED`** 控制：

| 值 | 行为 |
|----|------|
| `false`（默认） | 除 `GET /module` 外可不传 `Authorization` |
| `true` | 需 `Authorization: Bearer <token>`；列表/详情仅返回当前 `created_by` 任务，跨租户 **403** |

```http
Authorization: Bearer <your-token>
```

### 1.4 错误响应

```json
{ "detail": "错误说明（中文）" }
```

| HTTP | 典型场景 |
|------|----------|
| `400` | 参数非法 |
| `403` | 无权限访问他人任务 |
| `404` | 任务不存在 |
| `422` | 业务校验失败（如无历史评价、状态不允许操作） |
| `503` | `COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL；或谱系依赖未就绪 |

**业务错误码（建议在 `detail` 或扩展字段中区分）**：

| code（建议） | 含义 |
|--------------|------|
| `empty_history` | 该企标号在系统中无合规/批量评价记录，无法汇聚引用 |
| `invalid_status` | 当前任务状态不允许该操作 |
| `sheet_not_confirmed` | 未确认专用表即请求比对结果 |

---

## 2. 核心概念

### 2.1 三列比对（前端主表）

| 列名（UI） | 字段 | 说明 |
|------------|------|------|
| 企标中引用的补全年代号的标准号 | `full_std_at_publication` | 与合规 `full_std_at_publication` 一致：有年号时为完整引用；无年号时为推断的发布时点国标 |
| 第一次查新时的最新标准号 | `baseline_latest_std_primary` | 只读：来自 **基线快照表**（见 §2.3） |
| 本次查新的最新标准号 | `current_latest_std_primary` | 本次任务触发时实时谱系查询 |
| 结论 | `row_conclusion` + `row_conclusion_label` | 比较 baseline 与 current（见 §2.2） |

可选展示列：`referenced_std_code`（企标原文引用号，无年号时）。

### 2.2 行级结论 `row_conclusion`

| 值 | 条件 | `row_conclusion_label` 建议 |
|----|------|------------------------------|
| `unchanged` | baseline、current 均非空且规范化后相等 | 无变化 |
| `updated` | 均非空且不等 | 标准已更新 |
| `first_record` | baseline 为空、current 非空 | 首次建立基线 |
| `unresolved` | current 为空 | 无法解析现行号 |
| `not_assessable` | `compliance_assessable === false` | 不可自动比对 |

规范化比对：去首尾空格、统一全角/半角连字符、大小写按后端标准号规则（与合规 `citation_matches_latest` 一致）。

### 2.3 基线快照（硬性依赖）

**表建议名**：`novelty_reference_baseline_snapshot`（或等价）

| 字段 | 类型 | 说明 |
|------|------|------|
| `qb_code` | `string` | 企标号（规范化后） |
| `referenced_std_code` | `string` | 企标中引用的标准号（映射表主键之一） |
| `baseline_latest_std_primary` | `string` | 首次查新时的主现行号 |
| `baseline_recorded_at` | `datetime` | 写入时间 |
| `baseline_source` | `enum` | `compliance` \| `batch` |
| `baseline_source_id` | `int` | `evaluation_task_id` 或 `batch_item_id` |

**写入时机**（仅当 `(qb_code, referenced_std_code)` **不存在** 快照时插入）：

1. 合规 **`POST .../step/3/confirm`** 成功后，对本次映射表每行写入 `latest_std_primary`（或 confirm 时前端提交的 `latest_std_code` 主展示值）。
2. 批量子项 **`status === completed`** 且写入 `references_resolved` 时，对每条 `referenced_std_code` 写入 `latest_std_primary`。

查新任务 **只读** 快照，不在查新模块内重新定义「第一次」。

### 2.4 任务级结论 `task_conclusion`

| 值 | 含义 |
|----|------|
| `has_updates` | 至少一行 `row_conclusion === updated` |
| `all_unchanged` | 所有可比对行均为 `unchanged` |
| `partial` | 含 `unresolved` 或 `not_assessable`，且存在可比对行 |
| `pending` | 比对尚未完成 |
| `empty_history` | 创建时发现无历史（任务可能直接 `failed`） |

**`task_summary`**（string，可选）：如 `共 12 条引用，2 条标准已更新，10 条无变化`。

### 2.5 任务状态 `status`

| 值 | 含义 |
|----|------|
| `queued` | 已创建，等待处理 |
| `loading_history` | 正在汇聚合规/批量历史引用与指标 |
| `parsing` | 可选：正在解析上传的企标 PDF（若创建时带 `file`） |
| `pending_confirm` | 专用表已生成，待人工确认 |
| `comparing` | 已确认专用表，正在逐条谱系查新 |
| `completed` | 比对完成 |
| `failed` | 失败，见 `error_summary` |

**前端轮询**：`status` 为 `queued`、`loading_history`、`parsing`、`comparing` 时，建议每 **1～3 秒** 调用 `GET /tasks/{task_id}`，直至 `completed` 或 `failed`。

---

## 3. 历史汇聚规则（后端实现）

### 3.1 企标号匹配

对请求中的 `qb_code` 做规范化（trim、统一连字符、可选忽略大小写）后匹配：

| 数据源 | 匹配字段 |
|--------|----------|
| `compliance_evaluation_task` | `qb_code`（Step1 确认后） |
| `batch_normative_reference_item` | `qb_code` 及解析结果中的同义字段 |

### 3.2 引用去重

以 **`referenced_std_code`**（规范化后）为键去重；多条历史记录时：

| 字段 | 选取规则 |
|------|----------|
| `full_std_at_publication` | 取 **最近一条** 成功评价中的非空值；若均空则 null |
| `baseline_latest_std_primary` | 读快照表；**永不**用「最近一次评价」覆盖快照 |
| 专用表初稿行 | 合并去重后的引用列表，标准名称可取最近评价的 `std_name` 或国标库 |

### 3.3 指标汇聚

写入任务详情或 `GET .../indicators`：

```json
{
  "enterprise_indicators": [
    { "name": "指标名", "value": "限值", "source": "compliance", "source_id": 12 }
  ],
  "national_by_std_code": {
    "GB/T 1.1-2020": [
      { "indicator_name": "…", "indicator_type": "…", "content": "…" }
    ]
  },
  "source_evaluations": [
    {
      "source_type": "compliance",
      "source_id": 12,
      "evaluated_at": "2025-06-01T10:00:00Z",
      "title": "合规评价任务 #12"
    }
  ]
}
```

字段结构与合规 **`indicator_bundle_json`** / **`GET .../step/4/indicators`** 对齐，便于前端复用展示组件。

### 3.4 无历史数据

`POST /tasks` 时若 `qb_code` 在系统中 **无任何** 已完成 Step3 的合规任务或已完成批量子项：

- 返回 **422**，`detail` 含 `empty_history` 语义；或
- 若同时上传 `file`，可走解析通道生成专用表（**本期前端以有历史为前提**；无历史时提示用户先走合规/批量）。

---

## 4. 数据表建议（查新任务）

**`novelty_search_task`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | PK | |
| `title` | string | 如 `{qb_code} {date}` |
| `qb_code` | string | 企标号 |
| `status` | string | §2.5 |
| `source` | string | `upload` \| `form` \| `national` |
| `file_name` | string \| null | 原始文件名 |
| `sheet_confirmed` | bool | |
| `task_conclusion` | string \| null | §2.4 |
| `task_summary` | string \| null | |
| `error_summary` | string \| null | |
| `compare_done` | int | 已完成比对条数 |
| `compare_total` | int | 总条数 |
| `report_state` | string | `none` \| `generating` \| `ready` \| `failed` |
| `report_generated_at` | datetime \| null | |
| `reference_sheet_json` | JSON | 专用表行数组 |
| `compare_rows_json` | JSON | 比对行数组 |
| `indicators_json` | JSON \| null | 可拆到子接口 |
| `source_evaluations_json` | JSON \| null | |
| `created_by` | string \| null | |
| `created_at` / `updated_at` | datetime | |

---

## 5. 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/module` | 模块元信息（可匿名） |
| POST | `/tasks` | 创建任务（`qb_code` 必填；可选 `file`） |
| GET | `/tasks` | 任务列表（分页、筛选） |
| GET | `/tasks/{task_id}` | 任务详情 |
| PATCH | `/tasks/{task_id}/reference-sheet` | 保存专用表草稿 |
| POST | `/tasks/{task_id}/confirm-sheet` | 确认专用表并触发比对 |
| POST | `/tasks/{task_id}/retry` | 失败任务重试 |
| DELETE | `/tasks/{task_id}` | 删除任务（不可恢复） |
| GET | `/tasks/{task_id}/indicators` | 指标明细（可选，减轻主详情体积） |
| POST | `/tasks/{task_id}/report` | 生成 PDF（可选，本期可 501） |

---

## 6. 接口详情

### 6.1 `GET /module`

**鉴权**：无。

**响应 200**：

```json
{
  "module": "novelty_search",
  "requirement_section": "8.2",
  "scope": "按企标号汇聚历史合规/批量引用，三列比对查新"
}
```

---

### 6.2 `POST /tasks`

**用途**：创建查新任务；异步汇聚历史并生成专用表初稿。

**Content-Type**：`multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `qb_code` | string | 是 | 企标号 |
| `source` | string | 否 | `upload`（默认）、`form`、`national` |
| `file` | file | 否 | 企标 PDF/DOCX；有则可能进入 `parsing` |
| `form_std_nos` | string | 否 | `source=form` 时额外标准号，逗号/换行分隔 |
| `national_std_nos` | string | 否 | `source=national` 时国标列表，顿号分隔 |

**响应 201**：`NoveltyTaskOut`（见 §7.1）

**错误**：

- **422** `empty_history`：无合规/批量历史
- **503**：MySQL / 谱系依赖不可用

**curl 示例**：

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/novelty-search/tasks" \
  -H "Authorization: Bearer dev-token" \
  -F "qb_code=Q/XXX 001-2020" \
  -F "source=upload" \
  -F "file=@./sample.pdf"
```

---

### 6.3 `GET /tasks`

**Query 参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | int | 默认 1 |
| `page_size` | int | 默认 20，最大 100 |
| `qb_code` | string | 模糊或精确匹配企标号 |
| `status` | string | 任务状态筛选 |
| `keyword` | string | 标题关键字 |

**响应 200**：

```json
{
  "results": [ { "...NoveltyTaskSummaryOut" } ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```

---

### 6.4 `GET /tasks/{task_id}`

**用途**：任务详情；轮询比对进度。

**响应 200**：`NoveltyTaskOut`（完整，含 `reference_sheet`、`compare_rows`、`source_evaluations`；`indicators` 可内嵌或仅返回 `indicators_available: true`）。

---

### 6.5 `PATCH /tasks/{task_id}/reference-sheet`

**要求**：`status === pending_confirm` 且 `sheet_confirmed === false`。

**请求体**：

```json
{
  "rows": [
    {
      "id": "1",
      "std_no": "GB/T 1.1",
      "std_name": "标准化工作导则",
      "tech_fragment": "…",
      "remark": ""
    }
  ]
}
```

**响应 200**：`NoveltyTaskOut`

---

### 6.6 `POST /tasks/{task_id}/confirm-sheet`

**用途**：确认专用表；后端对每行 `referenced_std_code`（或 `std_no`）执行实时谱系查新，填充 `compare_rows`。

**请求体**（可选）：`{ "rows": [...] }`，若省略则使用已保存的专用表。

**响应 200**：`NoveltyTaskOut`（`status` 可能仍为 `comparing`，前端继续轮询）

**后端逻辑**：

1. `sheet_confirmed = true`，`status = comparing`
2. 对每行：读 baseline 快照 → 调谱系服务得 `current_latest_std_primary` → 计算 `row_conclusion`
3. 汇总 `task_conclusion`、`task_summary`
4. `status = completed`，`compare_done = compare_total`

---

### 6.7 `POST /tasks/{task_id}/retry`

**要求**：`status === failed`。

**响应 200**：`NoveltyTaskOut`（`status` 重置为 `queued` 或 `loading_history`）

---

### 6.8 `DELETE /tasks/{task_id}`

**用途**：删除查新任务及其专用表、比对结果等关联数据（逻辑删除或物理删除由后端实现）。

**鉴权**：与创建任务一致；非本人任务返回 **403**（鉴权开启时）。

**响应**：**204 No Content** 或 **200** `{ "ok": true }`。

**错误**：`404` 任务不存在。

---

### 6.9 `GET /tasks/{task_id}/indicators`

**响应 200**：`NoveltyIndicatorsOut`（§7.4）

---

### 6.10 `POST /tasks/{task_id}/report`（可选）

**要求**：`status === completed`。

**响应 200**：`{ "report_state": "ready", "report_url": "/api/v1/novelty-search/tasks/1/report/file" }`  
或 **501** 未实现。

---

## 7. JSON Schema

### 7.1 `NoveltyTaskOut`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int \| string | 任务 ID |
| `title` | string | |
| `qb_code` | string | 企标号 |
| `enterprise_name` | string | 可空 |
| `status` | string | §2.5 |
| `source` | string | |
| `file_name` | string \| null | |
| `sheet_confirmed` | bool | |
| `task_conclusion` | string \| null | |
| `task_summary` | string \| null | |
| `error_summary` | string \| null | |
| `compare_done` | int | |
| `compare_total` | int | |
| `report_state` | string | |
| `report_generated_at` | string \| null | ISO8601 |
| `reference_sheet` | `ReferenceSheetRowOut[]` | |
| `compare_rows` | `NoveltyCompareRowOut[]` | |
| `source_evaluations` | `SourceEvaluationOut[]` | |
| `indicators_available` | bool | 若指标走子接口则为 true |
| `created_at` | string | ISO8601 |
| `updated_at` | string | ISO8601 |

### 7.2 `ReferenceSheetRowOut`

| 字段 | 类型 |
|------|------|
| `id` | string |
| `std_no` | string |
| `std_name` | string |
| `tech_fragment` | string \| null |
| `remark` | string \| null |

### 7.3 `NoveltyCompareRowOut`（比对行）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | |
| `sheet_row_id` | string | 关联专用表行 |
| `referenced_std_code` | string | 企标原文引用 |
| `full_std_at_publication` | string \| null | **列 1** |
| `baseline_latest_std_primary` | string \| null | **列 2** |
| `current_latest_std_primary` | string \| null | **列 3** |
| `row_conclusion` | string | §2.2 |
| `row_conclusion_label` | string | 中文展示 |
| `compliance_assessable` | bool | |
| `explanation` | string \| null | 谱系说明 |
| `baseline_source` | string \| null | `compliance` \| `batch` |
| `baseline_recorded_at` | string \| null | ISO8601 |

### 7.4 `NoveltyIndicatorsOut`

| 字段 | 类型 |
|------|------|
| `enterprise_indicators` | array |
| `national_by_std_code` | object（key 为标准号） |
| `source_evaluations` | array |

### 7.5 `SourceEvaluationOut`

| 字段 | 类型 |
|------|------|
| `source_type` | `compliance` \| `batch` |
| `source_id` | int |
| `evaluated_at` | string |
| `title` | string |

---

## 8. 前端调用示例（TypeScript）

```typescript
import { noveltySearchClient } from '@/services/novelty-search-client'

// 创建
const form = new FormData()
form.append('qb_code', 'Q/XXX 001-2020')
form.append('source', 'upload')
if (file) form.append('file', file)
const { data: task } = await noveltySearchClient.post('/tasks', form)

// 轮询
const poll = async (id: number) => {
  const { data } = await noveltySearchClient.get(`/tasks/${id}`)
  if (['queued', 'loading_history', 'parsing', 'comparing'].includes(data.status)) {
    await new Promise((r) => setTimeout(r, 2000))
    return poll(id)
  }
  return data
}

// 确认专用表
await noveltySearchClient.post(`/tasks/${task.id}/confirm-sheet`, {})
```

---

## 9. 实现检查清单（后端）

- [ ] 新建 `novelty_search` Django app 与路由 `/api/v1/novelty-search`
- [ ] 表 `novelty_search_task` 及迁移
- [ ] 表 `novelty_reference_baseline_snapshot` 及迁移
- [ ] Step3 confirm / 批量完成时写入 baseline（仅首次）
- [ ] `POST /tasks` 汇聚合规+批量引用，去重生成 `reference_sheet`
- [ ] `confirm-sheet` 实时谱系 + 三列 + `row_conclusion`
- [ ] `GET /tasks` 分页与筛选
- [ ] `GET /tasks/{id}/indicators` 返回汇聚指标
- [ ] MySQL + 谱系表与合规模块一致

---

## 10. 版本

| 日期 | 说明 |
|------|------|
| 2026-05-23 | 初版：三列比对、基线快照、历史汇聚、任务状态机 |
