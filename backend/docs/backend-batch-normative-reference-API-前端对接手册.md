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

- 除 **`POST /jobs`** 为 **`multipart/form-data`** 外，**`PATCH .../items/{item_id}`** 为 **`application/json`**；其余读接口为 **GET**；**`DELETE /jobs/{job_id}`** 无请求体。
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

每个子项成功后的 **`references_resolved`** 数组中，**每一个元素**的结构与 **`GET /api/v1/compliance/evaluations/{task_id}/step/3/reference-latest`** 返回体中的 **`references[]` 单条对象**一致（含 `citation_matches_latest`、`is_latest` 及前置阅读字段 + 原有 resolve 字段）。前端若已有审核 3 的查新展示组件，可尽量 **复用同一套渲染逻辑**（注意合规接口根类型为 **对象**，数组在 **`references`** 字段内）。

更完整的字段语义见主手册 **《backend-compliance-API-前端对接手册》§4.10**；**前端改造清单**见 **[《frontend-migration-规范性引用查新接口调整说明》](./frontend-migration-规范性引用查新接口调整说明.md)**。下面 §5 给出字段摘要表。

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
| GET | `/jobs` | **分页**批次列表（摘要，无子项 `items[]`）。 |
| POST | `/jobs` | 创建批量任务（multipart）。**HTTP 201**。 |
| GET | `/jobs/{job_id}` | 查询任务及所有子项与查新结果。 |
| DELETE | `/jobs/{job_id}` | 删除该批次任务及全部子项；并尽量删除本任务上传目录（**HTTP 204**，无响应体）。 |
| GET | `/jobs/{job_id}/items/{item_id}` | 查询单个子项。 |
| PATCH | `/jobs/{job_id}/items/{item_id}` | 持久化人工修订后的 **`references_resolved`**（JSON）。 |

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
| `citation_matches_latest` | `boolean` | **补全后的标准号**（`full_std_at_publication`）与 **主展示现行号**（`latest_std_primary` / `current_latest_id`）经同一规范化比对是否**完全相同**；**两侧均有有效号**才可比为 `true`。**不用** `latest_std_codes` 参与该布尔。 |
| `is_latest` | `boolean` | **与 `citation_matches_latest` 同值**（字段名历史兼容）。 |

子项级汇总（**`GET /jobs/{job_id}`**、**`GET .../items/{item_id}`** 的 `items[]` 元素或单对象上）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `all_references_are_latest` | `boolean \| null` | 仅 **`status === "completed"`** 时有值：对 **`references_resolved`** 中 **`resolution_path` 不为 `qb_enterprise_citation` 且不为 `manual_review_non_gb` 且不为 `missing_enterprise_qb_code`** 的行做「是否全部为 **`citation_matches_latest === true`**」的汇总；**QB 轻工行业标准行、非 GB 待审核行、无完整 `Q/…` 企标号行不参与**（见 `resolution_path` 说明）。**空数组**视为 **`true`**。其它状态为 **`null`**。 |

同一对象内仍包含 **legacy / 解析明细** 字段，便于与旧前端对齐，例如（不完全列举）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `query_bz_id` | `string` | 与 `referenced_std_code` 同源。 |
| `current_latest_id` | `string` | 与 `latest_std_primary` 对齐。 |
| `current_latest_std_codes` | `string[]` | 与 `latest_std_codes` 对齐。 |
| `pedigree_chain` | `string` | 谱系链摘要（可能受 `REFERENCE_PEDIGREE_CHAIN_MAX_CHARS` 截断）。 |
| `resolution_path` | `string` | 内部路径标识；**`qb_enterprise_citation`**：引用号以 **`QB`** 开头（大小写不敏感），**轻工行业标准**，**不做**国标补全与谱系（路径名为历史 API 标识）；**`manual_review_non_gb`**：引用号**非 GB 开头**且非 QB，不自动查新，供审核员处理；**`missing_enterprise_qb_code`**：无 **`Q/…`** 完整企标号，现行侧为空；以上三类在 **`all_references_are_latest`** 汇总时**均忽略**。 |
| `inferred_historical_std_code` | `string \| null` | 无年代号时推断的当时版本号。 |
| `enterprise_as_of_year` | `number \| null` | 无年代号时采用的企标时点年。 |
| `pedigree_anchor_std_code` | `string` | （可选）谱系锚点。 |
| `latest_std_code_raw` | `string \| null` | （可选）谱系表原文。 |
| `historical_full_std_code` | `string \| null` | 与 `full_std_at_publication` 对齐。 |

**说明**：批量场景的「企标时点年」由后端根据 **Dify 扁平解析结果**（如 `publish_date` / `qibiao_release_date` 等）与 **`qb_code` / `qb_id`**、**任务创建时间年** 推导；**须为 `Q/…` 形式**的企标号才参与 GB 引用推断，逻辑与合规任务上的 `enterprise_as_of_year` / `resolve_reference_for_parse_context` 一致。

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

- 默认单次最多 **100** 个文件；可通过环境变量 **`BATCH_NORMATIVE_REF_MAX_FILES`** 调整（**1～100**，超出按 **100** 计）。
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

### 6.3 `GET /jobs`（分页列表）

**用途**：「批量规范性评价」首页 **批次列表 + 分页**；仅返回任务**摘要**，不含子项 `items[]`，避免列表过大。

**鉴权**：与 **`GET /jobs/{job_id}`** 相同；若开启 **`COMPLIANCE_API_AUTH_REQUIRED`**，仅返回 **`created_by` 等于当前 Bearer `subject`** 的任务；未开启鉴权时返回全部任务（开发环境注意数据量）。

**查询参数**（Query String）

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | `integer` | `1` | 页码，从 1 起；非法值按 1 处理。 |
| `page_size` | `integer` | `20` | 每页条数；后端限制 **1～100**，超出按边界截断。 |

**排序**：按任务 **`id` 降序**（新任务在前）。

**响应 200**：`BatchNormativeRefJobListOut`

| 字段 | 类型 | 说明 |
|------|------|------|
| `results` | `array` | 本页任务摘要列表，元素类型见下表 **`BatchNormativeRefJobSummaryOut`**。 |
| `count` | `number` | 符合筛选条件的**总条数**（全库，非仅本页）。 |
| `total` | `number` | 与 **`count` 相同**，便于前端宽松解析（`count` / `total` 二选一）。 |
| `page` | `number` | 当前页码。 |
| `page_size` | `number` | 当前每页条数。 |

**`results[]` 每项字段（与 `BatchNormativeRefJobOut` 头部一致，无 `items`）**

| 字段 | 类型 |
|------|------|
| `id` | `number` |
| `status` | `string` |
| `label` | `string \| null` |
| `total_items` | `number` |
| `completed_items` | `number` |
| `failed_items` | `number` |
| `error_summary` | `string \| null` |
| `created_at` | `string` (ISO 8601) |
| `updated_at` | `string` (ISO 8601) |

**说明**：列表中的 **`results`** 与前端约定的 **`items` / `data`** 命名不同；若封装层需要，可在前端将 `results` 映射为 `items`。后端定稿以 **`results` + `count` + `total`** 为准。

---

### 6.4 `GET /jobs/{job_id}`

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
| `company_name` | `string \| null` | **整批**维度公司名：取 **`items[]`** 中按 **`sort_order`** 第一个非空的 **`company_name`**；无则 **`null`**（与子项展示/导出兜底一致）。 |
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
| `company_name` | `string \| null` | 该文件解析结果中的公司名（来自 **`parse_result_json`**，多键名容错）。 |
| `qb_name` | `string \| null` | 企标简称等。 |
| `enterprise_standard_name` | `string \| null` | 标准/备案名称类。 |
| `qb_code` | `string \| null` | 企标号。 |
| `qb_title` | `string \| null` | 标准全名/标题（展示用）。 |
| `standard_name` | `string \| null` | 标准名称（与上类字段二选一或并存）。 |
| `implementation_date` | `string \| null` | 实施日期（多为 ISO 日期字符串）。 |
| `effective_date` | `string \| null` | 生效日期。 |
| `publish_date` | `string \| null` | 发布日期。 |
| `references_resolved` | `array \| null` | **仅** `status === "completed"` 时为 **数组**（结构见 §5）；否则 **`null`**。 |
| `all_references_are_latest` | `boolean \| null` | 见 §5；与 **`references_resolved`** 联动重算。 |

**错误与状态码**

| HTTP | 条件 |
|------|------|
| **404** | `job_id` 不存在。 |
| **403** | 已开启鉴权且 `created_by` 与当前用户不一致。 |

---

### 6.4.1 `DELETE /jobs/{job_id}`

**用途**：删除指定批次；数据库中 **`batch_normative_reference_job`** 行及其 **`items`**（外键 **CASCADE**）一并删除；并尽量删除落盘目录 **`MEDIA_ROOT/batch_normative_reference/{job_id}/`**（删除目录失败不影响接口成功）。

**鉴权**：与 **`GET /jobs/{job_id}`** 相同。

**成功**：**HTTP 204**，无 JSON 响应体。

**错误与状态码**

| HTTP | 条件 |
|------|------|
| **404** | `job_id` 不存在。 |
| **403** | 已开启鉴权且 `created_by` 与当前用户不一致。 |

**说明**：若 Celery Worker 仍在处理同一 `job_id`，删除后 Worker 可能提前结束或对已删数据无操作；以「任务已从列表消失」为准即可。

---

### 6.5 `GET /jobs/{job_id}/items/{item_id}`

**用途**：只拉取单个子项，字段与 **`GET /jobs/{job_id}`** 中对应 `items[]` 元素一致；适合单文件结果很大或 UI 按需加载。

**路径参数**

| 参数 | 类型 |
|------|------|
| `job_id` | `integer` |
| `item_id` | `integer`（即列表里的 `items[].id`） |

**响应 200**：`BatchNormativeRefItemOut`（单对象，字段同 §6.4 的 `items[]` 元素）

**错误与状态码**

| HTTP | 条件 |
|------|------|
| **404** | 任务不存在，或该 `item_id` 不属于该 `job_id`。 |
| **403** | 同 `GET /jobs/{job_id}`。 |

---

### 6.6 `PATCH /jobs/{job_id}/items/{item_id}`

**用途**：用户在单文件引用表中 **编辑 / 删行** 后，将修订结果写入数据库字段 **`reference_resolution_json`**（对外响应字段名仍为 **`references_resolved`**），刷新或换设备后仍可加载。**不**写入合规相关表。

**鉴权与范围**：与 **`GET /jobs/{job_id}`** 相同；`item_id` 必须属于该 `job_id`；否则 **404**；越权 **403**。

**Content-Type**：**`application/json`**

**路径参数**：`job_id`、`item_id`（同 GET 子项）。

**请求体 JSON**

```json
{
  "references_resolved": [ /* 对象数组；可为 [] 表示删光 */ ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `references_resolved` | `array` | 是 | 每个元素须为 **JSON 对象**；结构与 §5、`GET .../reference-latest` 单条、以及 GET 子项返回的 **`references_resolved[]`** 元素一致。 |

**业务规则**

- **仅**当子项 **`status === "completed"`** 时允许 PATCH；否则 **422**，`detail`：`仅 completed 状态的子项可编辑 references_resolved（查新完成后）`。
- 数组元素若不是对象，**422**，`detail` 指明下标。
- 写库后更新 **`updated_at`**；**不**自动修改子项 `status`、**不**回写 Dify 原始 `parse_result_json`（仍保留为只读底稿）。

**响应 200**：`BatchNormativeRefItemOut`（更新后的完整子项，便于前端直接替换状态）。

**错误与状态码**

| HTTP | 条件 |
|------|------|
| **404** | 任务或子项不存在、或子项不属于该任务。 |
| **403** | 鉴权开启且非本人任务。 |
| **422** | 非 `completed` 子项；或 `references_resolved` 非数组；或某元素非对象。 |

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

curl -sS "$BASE/jobs?page=1&page_size=10"

curl -sS -X PATCH "$BASE/jobs/1/items/2" \
  -H "Content-Type: application/json" \
  -d "{\"references_resolved\":[{\"referenced_std_code\":\"GB/T 191\",\"query_bz_id\":\"GB/T 191\",\"is_latest\":true,\"current_latest_id\":\"GB/T 191-2008\",\"latest_std_primary\":\"GB/T 191-2008\",\"latest_std_codes\":[\"GB/T 191-2008\"],\"current_latest_std_codes\":[\"GB/T 191-2008\"],\"pedigree_chain\":\"\",\"resolution_path\":\"pedigree_direct\"}]}"
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
| 2026-05-06 | **`POST /jobs`**：单次上传默认最多 **100** 个文件（**`BATCH_NORMATIVE_REF_MAX_FILES`**，有效 **1～100**）。 |
| 2026-05-06 | 新增 **`DELETE /jobs/{job_id}`**（**204**），鉴权与 **`GET /jobs/{job_id}`** 一致；删除子项及上传目录。 |
| 2026-05-06 | **`GET /jobs/{job_id}`** 响应：任务级 **`company_name`**；子项增加企标展示字段（`qb_code`、`publish_date` 等），取自 **`parse_result_json`**（多键名容错，含嵌套 **`keya`**）。 |
| 2026-05-06 | **仅 GB 开头**引用走自动补全与谱系查新；**`manual_review_non_gb`**（非 GB 且非 QB）不自动查新；**`missing_enterprise_qb_code`**（无 **`Q/…`** 企标号）现行侧为空；**`all_references_are_latest`** 汇总排除 **`qb_enterprise_citation`**、**`manual_review_non_gb`** 与 **`missing_enterprise_qb_code`**。 |
| 2026-05-08 | 引用号以 **`QB`** 开头（**轻工行业标准**）：**`resolution_path=qb_enterprise_citation`**，不查国标谱系；现行侧为空；**`all_references_are_latest`** 汇总排除此类行。 |
| 2026-05-06 | 增加 **`GET /jobs` 分页列表**、**`PATCH .../items/{item_id}`** 持久化 `references_resolved`；接口列表与 §6 同步更新。 |
| 2026-05-06 | 初版：批量模块基础接口、状态机、multipart 约定、`references_resolved` 与 §4.10 对齐说明。 |
