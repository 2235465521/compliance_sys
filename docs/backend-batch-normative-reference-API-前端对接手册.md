# 批量规范性引用评价 API — 前端对接说明

本文档描述后端已实现的 **「批量企标规范性引用评价」** 独立模块的 HTTP 接口，供前端联调使用。该模块与 **合规六步向导**（`/api/v1/compliance/...`）**无任务 ID 耦合**：不读写 `compliance_evaluation_task`、`enterprise_standard_reference_mapping` 等表；仅使用独立表 `batch_normative_reference_job`、`batch_normative_reference_item`。

**OpenAPI 文档**（与后端同机部署时）：在浏览器打开 **`/api/v1/docs`**，筛选 tag **`batch-normative-reference`**，可查看 Schema 与在线试调（视后端是否开启文档）。

---

## 1. 通用约定

### 1.1 Base URL

所有路径均挂在 **`/api/v1`** 之下，模块前缀为 **`/batch-normative-reference`**。

示例（本地）：

```text
http://127.0.0.1:8000/api/v1/batch-normative-reference
```

下文若写相对路径，均指 **`/api/v1/batch-normative-reference`** 之后的部分。

### 1.2 Content-Type 与字符编码

- 除 **`POST /jobs`** 为 **`multipart/form-data`** 外，其余接口为 **GET**，无请求体。
- 响应为 **JSON**，UTF-8。

### 1.3 鉴权（与合规模块一致）

由环境变量 **`COMPLIANCE_API_AUTH_REQUIRED`** 控制（与 `compliance` 路由相同逻辑）：

| `COMPLIANCE_API_AUTH_REQUIRED` | 行为 |
|--------------------------------|------|
| `false`（默认） | 除下文说明外，**不要求** `Authorization` 头；`created_by` 可能为空。 |
| `true` | 除 **`GET .../module`** 显式 `auth=None` 外，其余接口需在请求头携带 **`Authorization: Bearer <token>`**（占位校验，与现有 compliance 一致）。创建任务时后端会把当前用户的 **`subject`** 写入 `created_by`；查询他人任务返回 **403**。 |

请求头示例：

```http
Authorization: Bearer <your-token-here>
```

### 1.4 错误响应格式（Django Ninja）

业务错误通常返回 JSON，形如：

```json
{
  "detail": "错误说明（中文）"
}
```

HTTP 状态码与 `detail` 含义见各接口「错误与状态码」小节。

---

## 2. 业务流程与前置条件（必读）

### 2.1 异步模型

1. 前端 **`POST /jobs`** 上传一个或多个企标文件 → 后端立即 **创建任务与子项记录**，将文件落盘，并 **投递 Celery 任务** 异步处理。
2. 响应体中 **`job.status`** 初始多为 **`pending`**，各 **`items[].status`** 为 **`pending`**。
3. 前端需 **`GET /jobs/{job_id}`** 轮询（建议间隔 **1～3 秒**），直到 **`job.status`** 为 **`completed`** 或 **`failed`**（见 §3.3 状态说明）。
4. 每个子项处理完成后，若成功，**`items[].references_resolved`** 为查新结果数组；失败则 **`items[].status === "failed"`** 且 **`error_message`** 有说明。

**重要**：若未启动 **Celery Worker**（或 Broker 不可达），任务会长期停留在 **`pending` / `processing`**。请与后端/运维确认 **`CELERY_BROKER_URL`** 与 Worker 进程已启动。

### 2.2 数据库与迁移

后端需已对应用 **`batch_normative_reference`** 执行迁移，存在表：

- `batch_normative_reference_job`
- `batch_normative_reference_item`

首次部署请在后端项目目录执行：

```bash
python manage.py migrate batch_normative_reference
```

### 2.3 环境与 Dify

创建任务前，后端会检查 **批量专用 Dify** 是否已配置（`BATCH_NORMATIVE_REF_DIFY_API_KEY` 等），未配置则 **`POST /jobs`** 返回 **503**。

同时会调用 **`require_mysql()`**：当 **`COMPLIANCE_REQUIRE_MYSQL=true`** 且 Django **default 库不是 MySQL** 时，**`POST /jobs`** 返回 **503**（`detail` 为合规模块通用 MySQL 说明）。联调/生产建议 **MySQL + 已导入国标/谱系相关表**（与 `GET .../compliance/.../reference-latest` 查新依赖一致），否则查新结果可能不完整或走 SQLite 占位逻辑（取决于库类型与数据）。

### 2.4 与合规 `reference-latest` 的关系

每个子项成功后的 **`references_resolved`** 数组中，**每一个元素**的结构与 **`GET /api/v1/compliance/evaluations/{task_id}/step/3/reference-latest`** 返回数组中的**单条对象**一致（含前置阅读字段 + 原有 resolve 字段）。前端若已有审核 3 的查新展示组件，可尽量 **复用同一套渲染逻辑**。

更完整的字段语义见主手册 **《backend-compliance-API-前端对接手册》§4.10**；下面 §5 给出字段摘要表。

---

## 3. 状态枚举

### 3.1 任务 `job.status`（`BatchNormativeReferenceJob`）

| 值 | 含义 |
|----|------|
| `pending` | 已创建，等待或刚开始由 Worker 处理。 |
| `processing` | Worker 已开始处理（循环子项）。 |
| `completed` | Worker 已跑完本轮处理（**允许部分子项失败**，见 `failed_items`）。 |
| `failed` | 整批级致命错误时可能出现（例如未捕获异常；具体以后端实现为准）。 |

**计数字段**（便于 UI 展示进度）：

| 字段 | 说明 |
|------|------|
| `total_items` | 子项总数（等于上传文件数）。 |
| `completed_items` | `status === "completed"` 的子项数。 |
| `failed_items` | `status === "failed"` 的子项数。 |
| `error_summary` | 整批级错误摘要（若有）。 |

### 3.2 子项 `items[].status`（`BatchNormativeReferenceItem`）

| 值 | 含义 |
|----|------|
| `pending` | 尚未被 Worker 处理。 |
| `running` | 正在调用 Dify / 写解析与查新结果。 |
| `completed` | 该文件处理成功；此时 **`references_resolved`** 有值。 |
| `failed` | 该文件失败；读 **`error_message`**。 |

### 3.3 前端轮询结束条件建议

- **正常结束**：`job.status === "completed"`（或若将来出现 `failed` 亦应停止轮询并提示）。
- **展示**：可同时展示 `completed_items + failed_items` 与 `total_items` 对比；**部分失败不表示整批 HTTP 失败**。

---

## 4. 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/module` | 模块元信息（无需鉴权时可匿名）。 |
| POST | `/jobs` | 创建批量任务（multipart）。**HTTP 201**。 |
| GET | `/jobs/{job_id}` | 查询任务及所有子项与查新结果。 |
| GET | `/jobs/{job_id}/items/{item_id}` | 查询单个子项（大结果时可减少重复拉整包）。 |

---

## 5. `references_resolved` 单条元素（与 §4.10 对齐）

`items[].references_resolved` 为 **`array`** 或 **`null`**：

- 仅当 **`items[].status === "completed"`** 时为 **非 null 数组**（可能为空数组 `[]`，表示 Dify 未解析出任何引用号）。
- 其它状态为 **`null`**（尚未出结果或已失败）。

数组每个元素为 **对象**，**推荐阅读字段**（与合规 `reference-latest` 一致）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `referenced_std_code` | `string` | 引用标准号（展示主键之一）。 |
| `full_std_at_publication` | `string \| null` | 企标发布时点下的完整国标号。 |
| `pedigree_lookup_std_code` | `string \| null` | 查 `standard_pedigree` 用的锚点号。 |
| `latest_std_codes` | `string[]` | 现行标准号列表（多现行拆分后全量）。 |
| `latest_std_primary` | `string` | 主展示现行号。 |

同一对象内仍包含 **legacy / 解析明细** 字段，便于与旧前端对齐，例如（不完全列举）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `query_bz_id` | `string` | 与 `referenced_std_code` 同源。 |
| `is_latest` | `boolean` | 是否得到可展示的现行侧结论。 |
| `current_latest_id` | `string` | 与 `latest_std_primary` 对齐。 |
| `current_latest_std_codes` | `string[]` | 与 `latest_std_codes` 对齐。 |
| `pedigree_chain` | `string` | 谱系链摘要（可能受 `REFERENCE_PEDIGREE_CHAIN_MAX_CHARS` 截断）。 |
| `resolution_path` | `string` | 内部路径标识，便于联调。 |
| `inferred_historical_std_code` | `string \| null` | 无年代号时推断的当时版本号。 |
| `enterprise_as_of_year` | `number \| null` | 无年代号时采用的企标时点年。 |
| `pedigree_anchor_std_code` | `string` | （可选）谱系锚点。 |
| `latest_std_code_raw` | `string \| null` | （可选）谱系表原文。 |
| `historical_full_std_code` | `string \| null` | 与 `full_std_at_publication` 对齐。 |

**说明**：批量场景的「企标时点年」由后端根据 **Dify 扁平解析结果**（如 `publish_date` / `qibiao_release_date` 等）与 **`qb_code`**、**任务创建时间年** 推导，逻辑与合规任务上的 `enterprise_as_of_year` 规则一致（实现为 `resolve_reference_for_parse_context`）。

---

## 6. 接口详情

### 6.1 `GET /module`

**用途**：探测模块是否部署、职责说明（与 `GET /api/v1/compliance/module` 形式一致）。

**鉴权**：**无**（`auth=None`）。

**响应 200**：`ModuleMetaOut`（JSON）

| 字段 | 类型 | 示例 / 说明 |
|------|------|-------------|
| `module` | `string` | 固定为 `batch_normative_reference`。 |
| `requirement_section` | `string` | 文档占位，如 `8.x-batch`。 |
| `scope` | `string` | 模块职责中文摘要。 |

---

### 6.2 `POST /jobs`

**用途**：创建批量任务并上传文件；成功后由后台异步逐文件调用 Dify 与查新。

**鉴权**：若开启 `COMPLIANCE_API_AUTH_REQUIRED`，需 **Bearer**；创建时写入 `created_by`。

**Content-Type**：**`multipart/form-data`**

**表单字段**

| 字段名 | 必填 | 类型 | 说明 |
|--------|------|------|------|
| `files` | **是** | 文件，**可多文件** | 字段名必须为 **`files`**。多个文件时，使用 **同名 `files`** 多次出现（与 HTML `<input type="file" name="files" multiple>` 或多次追加 `files` 一致）。 |
| `label` | 否 | 文本 | 批次标签，最大约 256 字符；纯空格会视为未传。 |

**文件数量限制**：

- 默认单次最多 **50** 个文件；可通过环境变量 **`BATCH_NORMATIVE_REF_MAX_FILES`** 调整，后端硬上限 **200**。
- 超出返回 **422**，`detail` 提示超出上限。

**响应 201 Created**

响应体 JSON 与 **`GET /jobs/{job_id}`** 的结构相同，为 **`BatchNormativeRefJobOut`**（见 §6.3）。创建后常见状态：

- `job.status`: `pending`
- `completed_items`: `0`，`failed_items`: `0`
- 每个 `items[]`：`status`: `pending`，`references_resolved`: `null`

**错误与状态码**

| HTTP | 条件 | `detail`（摘要） |
|------|------|------------------|
| **422** | `files` 为空或未传 | 请使用 multipart 字段 files 上传至少一个企标文件 |
| **422** | 文件个数超过上限 | 单次最多上传 N 个文件 |
| **503** | 未配置批量 Dify | 批量规范性引用评价未配置 Dify：请设置 BATCH_NORMATIVE_REF_DIFY_API_KEY… |
| **503** | `COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL | 合规评价本接口依赖 MySQL…（与合规模块相同长文案） |

---

### 6.3 `GET /jobs/{job_id}`

**用途**：轮询整批任务状态，并获取每个文件的查新结果。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `job_id` | `integer` | 创建任务接口返回的 **`id`**。 |

**响应 200**：`BatchNormativeRefJobOut`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `number` | 任务 ID。 |
| `status` | `string` | 见 §3.1。 |
| `label` | `string \| null` | 批次标签。 |
| `total_items` | `number` | 子项总数。 |
| `completed_items` | `number` | 已完成子项数。 |
| `failed_items` | `number` | 失败子项数。 |
| `error_summary` | `string \| null` | 整批错误摘要。 |
| `created_at` | `string` (ISO 8601) | 创建时间（Django 序列化带时区）。 |
| `updated_at` | `string` (ISO 8601) | 更新时间。 |
| `items` | `array` | 子项列表，见下表。 |

**`items[]` 每个元素（`BatchNormativeRefItemOut`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `number` | 子项 ID，用于 **`GET .../items/{item_id}`**。 |
| `sort_order` | `number` | 与上传顺序一致，从 **0** 起。 |
| `original_filename` | `string` | 客户端原始文件名。 |
| `status` | `string` | 见 §3.2。 |
| `error_message` | `string \| null` | 失败原因；成功时多为 `null`。 |
| `references_resolved` | `array \| null` | **仅** `status === "completed"` 时为 **数组**（结构见 §5）；否则 **`null`**。 |

**错误与状态码**

| HTTP | 条件 |
|------|------|
| **404** | `job_id` 不存在。 |
| **403** | 已开启鉴权且 `created_by` 与当前用户不一致。 |

---

### 6.4 `GET /jobs/{job_id}/items/{item_id}`

**用途**：只拉取单个子项，字段与 **`GET /jobs/{job_id}`** 中对应 `items[]` 元素一致；适合单文件结果很大或 UI 按需加载。

**路径参数**

| 参数 | 类型 |
|------|------|
| `job_id` | `integer` |
| `item_id` | `integer`（即列表里的 `items[].id`） |

**响应 200**：`BatchNormativeRefItemOut`（单对象，字段同 §6.3 的 `items[]` 元素）

**错误与状态码**

| HTTP | 条件 |
|------|------|
| **404** | 任务不存在，或该 `item_id` 不属于该 `job_id`。 |
| **403** | 同 `GET /jobs/{job_id}`。 |

---

## 7. 前端调用示例

### 7.1 使用 `fetch` 创建任务（多文件）

```javascript
const base = "http://127.0.0.1:8000/api/v1/batch-normative-reference";

async function createBatchJob(fileList /* File[] */, label /* string | undefined */) {
  const form = new FormData();
  if (label) form.append("label", label);
  for (const f of fileList) {
    form.append("files", f, f.name); // 同名 files，多次 append
  }
  const res = await fetch(`${base}/jobs`, {
    method: "POST",
    body: form,
    // headers: { Authorization: `Bearer ${token}` }, // 若后端开启鉴权则必填
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  return res.json(); // 201 + BatchNormativeRefJobOut
}
```

### 7.2 轮询任务直到结束

```javascript
async function waitJobDone(jobId, { intervalMs = 2000, maxWaitMs = 600_000 } = {}) {
  const base = "http://127.0.0.1:8000/api/v1/batch-normative-reference";
  const t0 = Date.now();
  while (Date.now() - t0 < maxWaitMs) {
    const res = await fetch(`${base}/jobs/${jobId}`);
    if (!res.ok) throw new Error(await res.text());
    const job = await res.json();
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("等待批量任务超时");
}
```

### 7.3 `curl` 示例

```bash
BASE=http://127.0.0.1:8000/api/v1/batch-normative-reference

curl -sS -X POST "$BASE/jobs" \
  -F "label=测试批次" \
  -F "files=@./企标1.pdf" \
  -F "files=@./企标2.pdf"

curl -sS "$BASE/jobs/1"
```

---

## 8. 与主手册的交叉引用

| 主题 | 文档位置 |
|------|----------|
| 合规 `reference-latest` 字段详解 | `docs/backend-compliance-API-前端对接手册.md` **§4.10** |
| 批量模块简要说明（与 §6.3 重复处） | 同上 **§6.3** |
| `COMPLIANCE_REQUIRE_MYSQL`、503 行为 | 同上 **§7、§8** |
| 环境变量 `BATCH_NORMATIVE_REF_*` | 同上 **§7** 表格；`backend/.env.example` |

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-06 | 初版：批量模块四接口、状态机、multipart 约定、`references_resolved` 与 §4.10 对齐说明。 |
