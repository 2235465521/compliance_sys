# 合规评价模块 — API 前端对接手册

本文档描述**当前后端已实现**的合规模块 HTTP 接口，供前端对接 **`/api/v1/compliance`** 使用。字段以实际代码为准；与 OpenAPI 不一致时，以本仓库 **`backend/apps/compliance/api/router.py`** 与 **`backend/apps/compliance/schemas/api_schemas.py`** 为准，并可在运行环境访问 **`GET /api/v1/docs`** 查看自动生成的 Schema。

---

## 1. 全局约定

### 1.1 Base URL 与路径前缀

| 项目 | 值 |
|------|-----|
| 服务根路径（示例） | `http://{host}:{port}/` |
| **API 根前缀** | **`/api/v1/`** |
| **合规模块前缀** | **`/api/v1/compliance`** |

**完整 URL 示例**：`http://127.0.0.1:8000/api/v1/compliance/evaluations`

### 1.2 内容类型

| 场景 | `Content-Type` |
|------|----------------|
| JSON 请求体 | `application/json` |
| 文件上传（企标 / 国标） | `multipart/form-data`（浏览器 `FormData` 即可） |

### 1.3 响应体格式

- **成功**：HTTP `200`，响应体为 JSON（或文件下载接口为二进制流，见各节）。
- **业务/参数错误**：多为 **`422`**（状态机、缺参、缺步骤等），部分 **`400`**（非法路径）、**`404`**（任务或文件不存在）、**`403`**（多租户无权限）、**`502`**（Dify 调用失败）。
- **环境不满足**：若设置 **`COMPLIANCE_REQUIRE_MYSQL=true`**（默认 `false`）且当前库**不是** MySQL，依赖业务表的接口返回 **`503`**，`detail` 为说明文案（见 §8）。

Django Ninja 对 `HttpError` 的响应体一般为：

```json
{ "detail": "错误说明字符串" }
```

422 时 `detail` 可能为单字符串；请求体验证失败时可能为字段级数组结构，以前端实际解析为准。

### 1.4 可选鉴权（默认关闭）

环境变量 **`COMPLIANCE_API_AUTH_REQUIRED`**（默认 `false`）：

- **`false`**（默认）：除下文说明外，**不要求** `Authorization` 头。
- **`true`**：除 **`GET /api/v1/compliance/module`** 外，所有本模块接口需携带：

```http
Authorization: Bearer <任意非空 token>
```

占位实现将 token 截断后作为租户标识写入任务的 `created_by`，列表仅返回同租户任务；跨租户访问任务返回 **403**。

### 1.5 业务流程与 `current_step`（必读）

| `current_step` | 含义（摘要） |
|----------------|--------------|
| `1` | 已建任务；在步骤 1：可上传/替换企标、查看解析、提交审核 1 |
| `2` | 审核 1 已通过；审核 2 |
| `3` | 审核 2 已通过；审核 3（引用 + 补充 + 引用证书） |
| `4` | 审核 3 已通过；步骤 4 指标编排与审核 4 |
| `5` | 审核 4 已通过；步骤 5 对比与审核 5 |
| `6` | 审核 5 已通过；步骤 6 汇总与制品下载 |

**禁止跳步**：各 `confirm` 接口会校验当前步骤；不满足时返回 **422**。

### 1.6 企标解析状态 `parse_status`（上传后关注）

| 值 | 含义 |
|----|------|
| `pending` | 已排队异步解析（仅当 `COMPLIANCE_DIFY_PARSE_ASYNC=true` 且 Celery 投递成功） |
| `running` | 同步解析进行中（或 Worker 已接管，视实现） |
| `completed` | 解析成功，`parse_result_json` 可用 |
| `failed` | 解析失败，见 `parse_error`；需重新上传或检查配置 |

异步模式下若 Worker 长期未执行，超过 **`COMPLIANCE_PARSE_ASYNC_PENDING_TIMEOUT_SECONDS`**（默认 600 秒）会自动变为 **`failed`** 并写入超时说明（在拉取任务详情等会触发检查）。

---

## 2. 通用响应模型

### 2.1 `ComplianceTaskOut`（任务摘要，多数接口返回）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `number` | 任务主键；后续所有路径中的 **`task_id`** 必须使用此值 |
| `catalog_std_type_no` | `string \| null` | 企标为 `null`；与 `subject_code` 组成锚表键 |
| `subject_code` | `string \| null` | 企标号（STSC 主体键）；审核 1 确认后才有 |
| `subject_name` | `string \| null` | 企标名称（来自解析或 Step1） |
| `company_name` | `string \| null` | 来自 `parse_result_json.company_name` |
| `current_step` | `number` | 当前步骤 1～6 |
| `status` | `string` | 任务状态，ORM 默认如 `active` |
| `uploaded_file_name` | `string \| null` | 最近上传的企标文件名 |
| `has_parse_result` | `boolean` | 是否已有 `parse_result_json`（有结构化解析结果） |
| `parse_status` | `string` | `pending` / `running` / `completed` / `failed` |
| `parse_error` | `string \| null` | 解析失败时的摘要 |
| `has_compare_result` | `boolean` | 是否已有持久化的 `compare_result_json` |
| `compare_result_updated_at` | `string \| null` | 对比结果写入时间（ISO8601） |
| `step4_indicators_confirmed` | `boolean` | 审核 4 是否已确认 |
| `step5_compare_confirmed` | `boolean` | 审核 5 是否已确认 |
| `updated_at` | `string \| null` | 任务最近更新时间（ISO8601） |
| `progress_percent` | `number` | `round(current_step/6*100)` |
| `step_label` | `string` | 如 `步骤 3/6` |
| `display_status` | `string` | 任务中心展示：`draft` / `in_progress` / `completed` / `failed` |

### 2.2 `ModuleMetaOut`（`GET .../module`）

| 字段 | 类型 |
|------|------|
| `module` | `string` |
| `requirement_section` | `string` |
| `scope` | `string` |

---

## 3. 接口一览表

| 方法 | 路径（相对 `/api/v1/compliance`） | 说明 |
|------|-------------------------------------|------|
| GET | `/module` | 模块元信息（无需鉴权） |
| POST | `/evaluations` | 创建任务 |
| GET | `/evaluations` | 任务列表 |
| GET | `/evaluations/{task_id}` | 任务详情 |
| DELETE | `/evaluations/{task_id}` | 删除评价任务（含已完成） |
| POST | `/evaluations/{task_id}/upload` | 上传企标并触发工作流① |
| GET | `/evaluations/{task_id}/step/1` | 审核 1 展示 |
| POST | `/evaluations/{task_id}/step/1/confirm` | 审核 1 确认 |
| GET | `/evaluations/{task_id}/step/2` | 审核 2 展示 |
| POST | `/evaluations/{task_id}/step/2/confirm` | 审核 2 确认 |
| GET | `/evaluations/{task_id}/step/3/reference-latest` | 引用号 → 现行最新（**JSON 对象**：`references` + `all_references_are_latest`） |
| POST | `/evaluations/{task_id}/step/3/supplements` | n+m 补充行 |
| POST | `/evaluations/{task_id}/step/3/confirm` | 审核 3 确认 |
| GET | `/evaluations/{task_id}/step/4/indicators` | 步骤 4 指标编排 |
| POST | `/evaluations/{task_id}/step/4/confirm` | 审核 4 确认 |
| POST | `/national-standards/upload` | 补传国标文件 |
| GET | `/evaluations/{task_id}/step/5/compare/result` | **只读**已保存的对比结果（不调用 Dify③，回退 hydrate 用） |
| GET | `/evaluations/{task_id}/step/5/compare` | 工作流③ 指标对比（**会重新执行** Dify③） |
| POST | `/evaluations/{task_id}/step/5/compare` | 工作流③ 指标对比（可选 `compare_pairs` 先刷新编排） |
| POST | `/evaluations/{task_id}/step/5/confirm` | 审核 5 确认 |
| GET | `/evaluations/{task_id}/summary` | 步骤 6 汇总 |
| GET | `/evaluations/{task_id}/artifacts` | 制品列表 |
| GET | `/evaluations/{task_id}/artifacts/file` | 下载单个制品 |

---

## 4. 接口详述

以下路径均省略公共前缀 **`/api/v1/compliance`**，实际请求请拼接完整。

---

### 4.1 `GET /module`

**说明**：模块自检与元信息；**即使开启 `COMPLIANCE_API_AUTH_REQUIRED` 也不需要 Bearer**。

**请求参数**：无。

**响应 200**：`ModuleMetaOut` JSON，例如：

```json
{
  "module": "compliance",
  "requirement_section": "8.4",
  "scope": "六步向导五审、Dify①解析、国标指标表优先②按需补缺、③对比、n→n+m引用补充、多证书与终局汇总；状态快照与engine编排"
}
```

---

### 4.2 `POST /evaluations`

**说明**：创建一条新的合规评价任务。

**请求体**：无（可不发送 body）。

**响应 200**：`ComplianceTaskOut`。新建任务通常 `current_step=1`，`subject_code=null`，`has_parse_result=false`，`parse_status` 多为 `completed`（默认）直至上传。

**鉴权**：若开启 `COMPLIANCE_API_AUTH_REQUIRED`，创建的任务会写入 `created_by`（与 Bearer 关联）。

---

### 4.3 `GET /evaluations`

**说明**：任务列表。

**兼容响应**：

| 场景 | 响应 200 形态 |
|------|----------------|
| **无任何 Query**（旧前端） | **`ComplianceTaskOut[]`** 数组，最多 **100** 条，按 `updated_at`、`id` 降序 |
| **带任一 Query**（任务中心） | **`{ items, total, page, page_size }`**，见下表 |

**Query 参数**（均可选；**只要出现任意一个**即走分页对象）：

| 参数 | 说明 |
|------|------|
| `status` | `draft` \| `in_progress` \| `completed` \| `failed` \| `all`（默认 `all`） |
| `current_step_max` | 如 `5` 表示 `current_step <= 5` |
| `subject_code` | 企标号模糊搜索 |
| `page` | 页码，默认 `1` |
| `page_size` | 每页条数，默认 `20`，最大 `100` |

**分页响应示例**：

```json
{
  "items": [ { /* ComplianceTaskOut */ } ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```

**鉴权**：开启多租户时仅返回当前 Bearer 对应 `created_by` 的任务。

---

### 4.4 `GET /evaluations/{task_id}`

**说明**：单任务详情（与列表元素结构一致）。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `integer` | 创建任务接口返回的 `id` |

**响应 200**：`ComplianceTaskOut`。

**错误**：`404` 任务不存在；`403` 无租户权限（鉴权开启时）。

---

### 4.4b `DELETE /evaluations/{task_id}`

**说明**：删除评价任务（含 `current_step >= 6` 已完成记录）。删除主表行、步骤快照（级联）、MySQL 下 `evaluation_result` 行，以及 `compliance_certs/{task_id}/`、`compliance_uploads/{task_id}/` 目录。

**路径参数**：`task_id`（创建任务返回的 `id`）。

**请求体**：无。

**响应 204**：无 body（删除成功）。

**错误**：

| HTTP | 场景 |
|------|------|
| 404 | `评价任务不存在` |
| 403 | `无权删除该任务`（多租户） |
| 409 | `任务正在处理中，请稍后再试`（`parse_status` 为 `pending` / `running`） |

---

### 4.5 `POST /evaluations/{task_id}/upload`

**说明**：在**步骤 1**上传企标文件，保存到服务器并触发 **Dify 工作流①**（未配置 Dify 环境变量时为 Mock 解析）。仅 `current_step===1` 且解析非 `pending`/`running` 时允许上传/替换。

**路径参数**：`task_id`（`integer`）。

**请求体**：`multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | 文件 | 是 | 企标文件（PDF/Word 等） |

**响应 200**：`ComplianceTaskOut`（含最新 `parse_status` / `has_parse_result` 等）。

**常见错误**：

- **422**：非步骤 1、或解析进行中不允许上传、或其它状态机提示（`detail` 为中文说明）。
- **502**：真实 Dify 调用失败（`detail` 含上游错误摘要）。

**异步说明**：若 `COMPLIANCE_DIFY_PARSE_ASYNC=true` 且 Celery 投递成功，可能很快返回 `parse_status=pending`，前端需轮询 **`GET /evaluations/{task_id}`** 直至 `completed` 或 `failed`。

---

### 4.6 `GET /evaluations/{task_id}/step/1`

**说明**：审核 1 页面数据：任务摘要 + 工作流①解析结果 JSON。

**路径参数**：`task_id`。

**响应 200**：JSON 对象（非 `ComplianceTaskOut` 裸对象）：

```json
{
  "task": { ...ComplianceTaskOut 各字段... },
  "parse_result": { ... 见 §6.1，可能为 null ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `task` | `object` | 与 `ComplianceTaskOut` 一致 |
| `parse_result` | `object \| null` | 即后端 `parse_result_json`；未完成解析时可能为 `null`。字段见 §6.1（含可选 `references_detail`）。 |

---

### 4.7 `POST /evaluations/{task_id}/step/1/confirm`

**说明**：提交审核 1；落库企标基础信息并推进到步骤 2。MySQL 下写入 `enterprise_standard_*`；SQLite 下跳过落库仍可推进步骤（见 §8）。

**路径参数**：`task_id`。

**请求体 JSON**：`Step1ConfirmIn`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subject_code` | `string` | 是 | 企标号（用户确认后） |
| `subject_name` | `string` | 否 | 企标名称 |
| `qb_name` | `string \| null` | 否 | 企标名称 |
| `company_name` | `string \| null` | 否 | 企业名称 |

**响应 200**：`ComplianceTaskOut`（`current_step` 变为 `2`，`subject_code` 有值）。

**常见错误**：422（未解析完成、非步骤 1 等）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

| `parse_result` | `object \| null` | 即后端 `parse_result_json`；未完成解析时可能为 `null`。字段见 §6.1（含可选 `references_detail`）。 |

---

### 4.8 `GET /evaluations/{task_id}/step/2`

**说明**：审核 2 展示：任务 + 建议引用列表（含规范性引用提取的**标准编号**、**是否含年**、**原文描述**）+ 企标技术指标列表（仍为 `parse_result.indicators`，与此前一致）。

**路径参数**：`task_id`。

**请求**：无请求体；若开启鉴权则与其它接口相同携带 `Authorization`（见 §7）。

**响应 200**：`Content-Type: application/json`，结构如下：

```json
{
  "task": {
    "id": 1,
    "qb_code": "Q/AHYY 001-2020",
    "current_step": 2,
    "status": "active",
    "uploaded_file_name": "企标.pdf",
    "has_parse_result": true,
    "parse_status": "completed",
    "parse_error": null
  },
  "suggested_references": [
    {
      "referenced_std_code": "GB/T 191",
      "latest_std_code": null,
      "has_year": false,
      "full_text": "GB/T191 包装储运图示标志"
    }
  ],
  "indicators": [
    {
      "name": "理化指标 / 焦油量",
      "value": "≤18 mg/支",
      "raw": {
        "index_name": "理化指标",
        "key": "焦油量",
        "value": "≤18 mg/支",
        "index_type": "具体值"
      }
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `task` | `object` | 与 **`ComplianceTaskOut`** 一致（与 `GET /evaluations/{task_id}` 中任务对象字段含义相同） |
| `suggested_references` | `array` | 规范性引用展示行。优先来自 `parse_result.references_detail`；若无则回退为仅 **`referenced_std_codes`** 生成的行（此时 `has_year`、`full_text` 为 `null`） |
| `suggested_references[].referenced_std_code` | `string \| null` | 引用标准编号（与 `POST .../step/2/confirm` 中 `references[].referenced_std_code` 对齐） |
| `suggested_references[].latest_std_code` | `null` | 本接口固定为 **`null`**，供审核 2 人工填写现行标准号后随 confirm 提交 |
| `suggested_references[].has_year` | `boolean \| null` | Dify/解析是否标注「引用号含年代」；无提取时为 `null` |
| `suggested_references[].full_text` | `string \| null` | 该条规范性引用的原文描述；无提取时为 `null` |
| `indicators` | `array` | 与此前一致：来自 **`parse_result.indicators`**，元素多为 `{ "name", "value", "raw" }`（见 §6.1） |

**兼容说明**：旧任务 `parse_result` 中无 `references_detail` 时，`suggested_references` 仍按 `referenced_std_codes` 展开，仅多 `has_year`、`full_text` 两个可为 `null` 的字段。

---

### 4.9 `POST /evaluations/{task_id}/step/2/confirm`

**说明**：提交审核 2；写入引用映射与指标集 JSON。MySQL 下写入业务表；SQLite 下跳过（见 §8）。

**路径参数**：`task_id`。

**请求体 JSON**：`Step2ConfirmIn`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `indicator_set` | `array` | 否 | 每项为 **任意键的 JSON 对象**（`dict`），由前端与后端约定结构；默认 `[]` |
| `references` | `array` | 否 | 每项为 `ReferenceRowIn`，默认 `[]` |

**`ReferenceRowIn`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `referenced_std_code` | `string \| null` | 引用标准号 |
| `latest_std_code` | `string \| null` | 现行最新标准号（可空） |

**响应 200**：`ComplianceTaskOut`（`current_step=3`）。

**常见错误**：422（缺少 `qb_code`、非步骤 2 等）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

### 4.10 `GET /evaluations/{task_id}/step/3/reference-latest`

**说明**：根据审核 2 写入的 **`enterprise_standard_reference_mapping.referenced_std_code`**（按映射表 **`MIN(id)`** 稳定排序，与审核 2 写入顺序一致），将每条引用解析为**现行最新标准号**，供审核 3 展示。

**解析逻辑（后端实现）**：

1. **国标自动查新范围**：仅当引用号（`strip` 后）**以 `GB` 开头**（大小写不敏感，含 `GB/T`、`GB/Z` 等）时，才执行下列「年代号判定 + 国标库推断 + 谱系表查新」。**以 `QB` 开头**（大小写不敏感）为**轻工行业标准**（**`qb_enterprise_citation`**，路径名为历史标识）：不查国标谱系。**非 GB 且非 QB** 的引用（如行标、地标、其他行业标准等）为 **`manual_review_non_gb`**：不自动补全年代号、不查谱系，**`latest_std_*` / `current_latest_*` 为空**，由审核员处理。
2. **完整企标号（`Q/…`）**：对 GB 类引用，若任务/解析中未提供 **`Q/` 开头**的企业标准号（`qb_code`、`qb_id` 或解析扁平结果中的企标号同义键之一；全角 `／` 归一为 `/`），**`resolution_path`=`missing_enterprise_qb_code`**：**`latest_std_*` / `current_latest_*` 为空**，**不**执行无年代号推断与谱系查新（**不把**企标正文中的引用标准号当作「现行最新标准号」）。
3. **是否含年代号**：若引用号末段匹配 `-YYYY` / `－YYYY`（四位年），视为**完整标准号**。
4. **有年代号**：用该完整号查 **`standard_pedigree`**（`std_code` 精确匹配），读取 **`latest_std_code`**（可能多条，以顿号、逗号、分号等分隔）；**全部**拆入响应字段 **`current_latest_std_codes`**；**`current_latest_id`** 为其**首项**（与旧版「仅首段」展示兼容）；并返回 **`part_chain`** / `ped_id` 摘要。若谱系表无行，再回退 **`national_standard_basic`** 仅校验存在性。
5. **无年代号**：先用**企标时点年** `enterprise_as_of_year` 在 **`national_standard_basic`** 中推断「当时应引用」的具体标准号：在 `std_code = 引用前缀` 或 `std_code LIKE '前缀-%'` 且 `YEAR(publish_date) <= enterprise_as_of_year`（`publish_date` 为空时仍参与排序）中取**发布日期最新**的一条，得到 **`inferred_historical_std_code`**；**若推断成功**，再以该锚点号查 **`standard_pedigree`** 得现行最新（同第 4 步）。**若推断失败**，**`resolution_path`=`unresolved_no_historical_row`**：**`historical_full_std_code`/`full_std_at_publication` 为 `null`**，**`latest_std_primary`/`current_latest_id` 为空串**，**`latest_std_codes`/`current_latest_std_codes` 为空数组**（不把企标中的引用原文当作「现行最新标准号」）。
6. **企标时点年**来源顺序：`parse_result_json.publish_date`（及同义键 `impl_date` / `release_date` / **`qibiao_release_date`** / `enterprise_release_date` 等）解析年份 → **`qb_code` 内四位年** → 任务 **`created_at`** 年份。
7. **`pedigree_chain` 长度**：来自 `standard_pedigree.part_chain` 时，默认最多 **800** 字符（超出加 `…`）；可通过环境变量 **`REFERENCE_PEDIGREE_CHAIN_MAX_CHARS`** 调整；设为 **`0`** 表示**不截断**（注意响应体积）。

**要求**：已完成审核 2（`current_step < 3` 则 **422**）。本接口为**批量查新**：当任务已有 **`qb_code`** 时，**必须**使用 **MySQL** 且已导入 **`enterprise_standard_reference_mapping`、`standard_pedigree`、`national_standard_basic`** 等表，并在**同一库**完成审核 2 确认；若 Django **`default` 为 SQLite**，返回 **503**（见 §8），**不再**返回假空数组。若 **`qb_code` 为空**，仍返回 **`200`**，且 **`references` 为 `[]`**、**`all_references_are_latest` 为 `true`**（无引用可判）。依赖表：`enterprise_standard_reference_mapping`、`standard_pedigree`、`national_standard_basic`。

**路径参数**：`task_id`。

**响应 200**：**JSON 对象**（**破坏性变更**：此前根类型为数组；请改为读取 **`references`** 与 **`all_references_are_latest`**）。**前端改造清单（路径、旧/新 JSON、checklist）** 见独立文档 **[《frontend-migration-规范性引用查新接口调整说明》](./frontend-migration-规范性引用查新接口调整说明.md)**。

| 字段 | 类型 | 说明 |
|------|------|------|
| **`references`** | `array` | 与映射表查询顺序一致；每项为下表「单条引用」对象。 |
| **`all_references_are_latest`** | `boolean` | **`true`** 当且仅当 **`references`** 中**每一条参与汇总的行**（**`resolution_path` 不为 `qb_enterprise_citation` 且不为 `manual_review_non_gb` 且不为 `missing_enterprise_qb_code`**）的 **`citation_matches_latest`**（与 **`is_latest`** 同值）均为 **`true`**。**`qb_enterprise_citation`**（**QB 轻工行业标准**，不参与国标自动查新）、**`manual_review_non_gb`**（非 GB 前缀、待审核员处理）与 **`missing_enterprise_qb_code`**（无完整 `Q/…` 企标号）**不参与**本汇总。无引用时（`references` 为空数组）为 **`true`**。任一条参与汇总的为 **`false`** 即整份企标映射引用侧视为「未全部现行」（前端可用于「规范性引用不合格」类提示）。 |

**`references[]` 单条对象**（前部为推荐阅读字段，与 legacy 并存）：

| 字段 | 类型 | 说明 |
|------|------|------|
| **`referenced_std_code`** | `string` | **审核后引用标准号**（与 `query_bz_id` 相同） |
| **`full_std_at_publication`** | `string \| null` | **企标发布时点下的完整国标号**（与 `historical_full_std_code` 相同；无年号且国标库推断失败为 `null`） |
| **`pedigree_lookup_std_code`** | `string \| null` | **用于查 `standard_pedigree.std_code` 的锚点完整号**（与 `pedigree_anchor_std_code` 相同；无谱系步骤时可能为 `null`） |
| **`latest_std_codes`** | `string[]` | **谱系表 `latest_std_code` 拆分后的全部现行号**（与 `current_latest_std_codes` 相同）；**`unresolved_no_historical_row` 时为 `[]`** |
| **`latest_std_primary`** | `string` | **主展示现行号**（与 `current_latest_id` 相同）；**推断失败（`unresolved_no_historical_row`）时为空串** |
| `query_bz_id` | `string` | 原始引用标准号（映射表中的值） |
| **`citation_matches_latest`** | `boolean` | **「补全后的标准号」是否与主展示现行号一致**：将 **`full_std_at_publication`** 与 **`latest_std_primary`**（即 **`current_latest_id`**）经同一规范化后比对；**二者规范化后均非空**且相等为 **`true`**，否则 **`false`**。**不使用** **`latest_std_codes`** 列表参与该布尔。 |
| `is_latest` | `boolean` | **与 `citation_matches_latest` 同值**（兼容旧字段名；语义已从前版「解析是否成功」改为「补全号是否与现行号一致」）。 |
| `current_latest_id` | `string` | **现行最新标准号**（主展示；与 **`current_latest_std_codes[0]`** 一致；无列表时与回退锚点一致）；**`unresolved_no_historical_row` 时为空串** |
| `current_latest_std_codes` | `string[]` | 谱系 **`latest_std_code`** 拆分后的**全部**现行号（有序、去重）；主表回退等单号场景为单元素数组；**推断失败时为 `[]`** |
| `pedigree_chain` | `string` | 谱系链摘要或说明（`part_chain` 截断或 `ped_id`） |
| `resolution_path` | `string` | 内部路径标识，如 `pedigree_direct`、`historical_then_pedigree`、`unresolved_no_historical_row`、**`missing_enterprise_qb_code`**（无 **`Q/…`** 完整企标号：现行侧为空）、**`qb_enterprise_citation`**（引用号以 **`QB`** 开头：**轻工行业标准**，**不做**国标补全与谱系；路径名为历史 API 标识）、**`manual_review_non_gb`**（引用号**非 GB 开头**且非 QB：不自动查新，供审核员处理）等 |
| `inferred_historical_std_code` | `string \| null` | 仅无年代号路径：在国标库中推断出的「当时版本」标准号 |
| `enterprise_as_of_year` | `number \| null` | 仅无年代号路径：采用的企标时点年 |
| `pedigree_anchor_std_code` | `string` | （可选）实际用于查谱系表的锚点标准号 |
| `latest_std_code_raw` | `string \| null` | （可选）谱系表 `latest_std_code` 字段原文 |
| `historical_full_std_code` | `string \| null` | **与 `inferred_historical_std_code` 语义对齐的展示别名**：有年代号时为**原文引用**（同 `query_bz_id`）；无年代号且推断成功时为**当时完整国标号**（与 `inferred_historical_std_code` 一致）；未推断成功时为 `null` |

**常见错误**：422（未完成审核 2）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL；或 **`reference-latest` 专用**：任务已有 **`qb_code`** 但当前 **`default` 库非 MySQL**，见 §8）。

---

### 4.11 `POST /evaluations/{task_id}/step/3/supplements`

**说明**：在审核 3 阶段增加 **n+m** 的补充行（仅 `latest_std_code`，无 `referenced`）。**要求 MySQL**。

**路径参数**：`task_id`。

**请求体 JSON**：`SupplementsBodyIn`

| 字段 | 类型 | 说明 |
|------|------|------|
| `rows` | `array` | 每项为 `SupplementRowIn` |

**`SupplementRowIn`**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `latest_std_code` | `string` | 是 | 补充的最新标准号 |

**响应 200**：`ComplianceTaskOut`（不改变 `current_step`，仅写库补充行）。

**常见错误**：422（缺少 `qb_code`）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

### 4.12 `POST /evaluations/{task_id}/step/3/confirm`

**说明**：提交审核 3；更新映射行人工状态、生成**引用合规占位证书 PDF**、推进步骤 4。**要求 MySQL**。

**路径参数**：`task_id`。

**请求体 JSON**：`Step3ConfirmIn`

| 字段 | 类型 | 说明 |
|------|------|------|
| `rows` | `array` | 每项为 JSON 对象，至少可含：`id`（映射表主键）、`manual_review_status`（人工结论） |

**响应 200**：`ComplianceTaskOut`（首次确认 `current_step=4`）。

**重提（`current_step > 3`）**：允许在已推进到后续步骤时再次提交；将作废第 5 步对比（`has_compare_result=false`）、重置审核 4 确认，并 **`current_step=4`**。

**常见错误**：422（尚未到达步骤 3）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

### 4.13 `GET /evaluations/{task_id}/step/4/indicators`

**说明**：步骤 4 编排：企标侧指标 + 按 n+m 最新标准号聚合国标指标表；缺文件时返回 `missing_gb_files`；可对缺指标且本地国标路径可用的标准调用 Dify②（未配置则为 Mock 插入）。**要求 MySQL**；且 **`current_step >= 4`**（未完成审核 3 为 422）。

**路径参数**：`task_id`。

**响应 200**：`Step4IndicatorsOut`

| 字段 | 类型 | 说明 |
|------|------|------|
| `qb_code` | `string \| null` | 企标号 |
| `enterprise_indicators` | `array` | 企标侧指标（来自解析结果） |
| `national_by_std_code` | `object` | 键为 `std_code`，值为指标行数组，行形状见 §6.2 |
| `missing_gb_files` | `array` | 缺国标文件项，见下表 |
| `dify2_invoked_std_codes` | `array` | 本次实际触发工作流②（或 Mock）的标准号列表 |

**`missing_gb_files` 元素（`MissingGbFileItem`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `std_code` | `string` | 标准号 |
| `std_name` | `string \| null` | 标准名称 |
| `reason` | `string` | 枚举：`empty_std_file_path` \| `file_not_found` |

**副作用**：本接口会更新任务上的 `indicator_bundle_json`（及可能的 `dify_run_metadata_json`），供步骤 5 对比使用。前端可在用户补传国标后**重复调用**本 GET 刷新编排结果。

**常见错误**：502（Dify②失败）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

### 4.14 `POST /evaluations/{task_id}/step/4/confirm`

**说明**：审核 4 确认；若当前缓存的 `indicator_bundle_json` 中仍有 `missing_gb_files` 非空，则 **422** 禁止确认。首次成功则 `current_step=5`。**要求 MySQL**。

**路径参数**：`task_id`。

**请求体**：无 JSON body（可不发送 `{}`）。

**响应 200**：`ComplianceTaskOut`。

**重提（`current_step > 4`）**：允许再次确认；作废第 5 步对比（`has_compare_result=false`），**`current_step=5`**（保留 `step4_indicators_confirmed=true`）。

**常见错误**：422（尚未到达步骤 4；或 `missing_gb_files` 非空，`detail` 可能为 **JSON 字符串** 内含该数组）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

### 4.15 `POST /national-standards/upload`

**说明**：按标准号上传国标文件，落盘并更新 **`national_standard_basic.std_file_path`**。用于消除步骤 4 的 `missing_gb_files`。**要求 MySQL**。

**注意**：路径在 **`/compliance`** 下，**无** `task_id`（全库按 `std_code` 更新）。

**请求**：`multipart/form-data` + Query

| Query 参数 | 类型 | 必填 | 说明 |
|------------|------|------|------|
| `std_code` | `string` | 是 | 标准号 |

| Form 字段 | 类型 | 必填 |
|-----------|------|------|
| `file` | 文件 | 是 |

**响应 200**：

```json
{
  "std_file_path": "相对或绝对路径字符串（服务端写入库的路径）"
}
```

**常见错误**：422（`std_code` 为空）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

### 4.15c `GET /evaluations/{task_id}/step/5/compare/result`

**说明**：**只读**任务表中的 `compare_result_json`，**不调用** Dify③。用于向导回退到第 5 步或刷新时 hydrate；**不要求** `current_step === 5`（可在第 6 步回看）。

**路径参数**：`task_id`。

**响应 200**：`Step5CompareOut`（与 §4.16 相同结构）。

**常见错误**：`404`（尚未生成过对比）；`404`（任务不存在）。

**前端约定**：回退/刷新对比表请**优先**本接口；勿用 `GET .../step/5/compare` 做 hydrate（该接口会重新跑工作流）。

---

### 4.16 `GET /evaluations/{task_id}/step/5/compare`

**说明**：执行 **Dify 工作流③** 指标对比（未配置 API Key 时返回 Mock 对比结果）。要求 **`current_step === 5`** 且已通过审核 4（`step4_indicators_confirmed`）。**要求 MySQL**。

**路径参数**：`task_id`。

**响应 200**：`Step5CompareOut`

```json
{
  "compare_result": { ... 任意 JSON 对象，含 Dify 返回或 Mock 字段 ... }
}
```

Mock 时 `compare_result` 大致含：`summary`、`details`、`markdown` 等字段。

**副作用**：写入任务的 `compare_result_json` 与部分 `dify_run_metadata_json`。

**常见错误**：422（步骤不对、未确认审核 4、bundle 空、缺 `latest_std_codes`/`publication_std_codes`、`missing_gb_files` 非空）；502（Dify③失败）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

**入参拼装**：从 `indicator_bundle_json` 的 `publication_std_codes` / `latest_std_codes` 截取 `national_by_std_code` 子集；`enterprise_data` 含企标 + `publication_side`，`reference_data` 仅含 `latest_side`（详见 workflow3 说明文档）。

---

### 4.16b `POST /evaluations/{task_id}/step/5/compare`

**说明**：与 GET 相同触发 Dify③，Body 可选 `Step5CompareIn`：`compare_pairs` 非空时先执行与 `POST step/4/indicators/ensure` 相同的编排并刷新 bundle，再对比。前端「立即构建」推荐本接口。

**请求体**（可 `{}`）：

```json
{
  "compare_pairs": [
    { "publication_std_code": "GB 10035-2006", "latest_std_code": "GB/T 20882.1-2025" },
    { "publication_std_code": null, "latest_std_code": "GB/T 1628-2020" }
  ]
}
```

**响应 200**：同 `Step5CompareOut`（§4.16）。

---

### 4.17 `POST /evaluations/{task_id}/step/5/confirm`

**说明**：审核 5 确认；要求已存在 `compare_result_json`（通过 **`POST`/`GET .../step/5/compare`** 构建）。生成**指标对比占位证书 PDF**，写入评价结果占位枚举，推进 **`current_step=6`**。**要求 MySQL**。

**路径参数**：`task_id`。

**请求体**：无 JSON body。

**响应 200**：`ComplianceTaskOut`。

**常见错误**：422（未拉取对比结果等）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

### 4.18 `GET /evaluations/{task_id}/summary`

**说明**：步骤 6 汇总：任务 + `evaluation_result` 表一行 + 制品列表。**要求 MySQL**。

**路径参数**：`task_id`。

**响应 200**：`SummaryOut`

| 字段 | 类型 | 说明 |
|------|------|------|
| `task` | `object` | 与 `ComplianceTaskOut` 字段一致的字典 |
| `evaluation_result` | `object \| null` | 无记录时为 `null` |
| `artifacts` | `array` | 每项为 `ArtifactItem` |

**`evaluation_result`（存在时）常见键**（与 SQL 查询一致）：

| 键 | 类型 | 说明 |
|----|------|------|
| `qb_code` | `string` | 企标号 |
| `descriptive_result` | `string \| null` | 枚举字符串：`compliant` / `non_compliant` / `partial` / `unknown` / `not_applicable` |
| `reference_result` | `string \| null` | 同上 |
| `indicator_result` | `string \| null` | 同上 |
| `overall_result` | `string \| null` | 同上 |
| `descriptive_result_report_file_path` | `string \| null` | 当前多为占位策略外，可为 `null` |
| `reference_result_report_file_path` | `string \| null` | 引用证书相对路径等 |
| `indicator_result_report_file_path` | `string \| null` | 指标对比证书相对路径等 |
| `certificate_file_path` | `string \| null` | 总证书路径（占位阶段可为 `null`） |

当前后端在审核 1/3/5 确认后会写入部分 **`*_result` 占位枚举**（多为 `compliant`），证书为**空白占位 PDF** 路径，非模板填内容。

**常见错误**：**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

### 4.19 `GET /evaluations/{task_id}/artifacts`

**说明**：列出本任务可下载文件（相对 **`MEDIA_ROOT`** 的路径）。包含：

| `kind` | 来源 |
|--------|------|
| `uploaded_qb` | 上传的企标 PDF/Word（`compliance_uploads/{task_id}/`） |
| `compare_cert_pdf` / `other` | 证书目录 `compliance_certs/{task_id}/` |

上传成功后下次调用本接口即可看到 `uploaded_qb`。**不要求 MySQL**。

**路径参数**：`task_id`。

**响应 200**：

```json
{
  "artifacts": [
    { "kind": "uploaded_qb", "label": "企标.pdf", "path": "compliance_uploads/12/企标.pdf", "content_type": "application/pdf" }
  ]
}
```

---

### 4.20 `GET /evaluations/{task_id}/artifacts/file`

**说明**：下载单个制品文件；**路径穿越防护**：仅允许 `compliance_certs/{task_id}/**` 或 `compliance_uploads/{task_id}/**`（及任务记录的 `uploaded_file_path`）下文件。

**路径参数**：`task_id`。

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | **`GET .../artifacts` 返回的 `path` 原样传递**（需 URL 编码，如 `%2F`） |

**响应 200**：二进制流，`Content-Disposition: attachment`，文件名为磁盘文件名。

**常见错误**：`400`（非法路径）、`403`（非本任务目录）、`404`（文件不存在）。

---

## 5. 推荐前端调用顺序（向导）

1. `POST /evaluations` → 保存 `id` 为 `task_id`  
2. `POST /evaluations/{task_id}/upload`（`multipart/form-data`）  
3. 若 `parse_status` 为 `pending`/`running`：轮询 `GET /evaluations/{task_id}` 至 `completed` 或 `failed`  
4. `GET .../step/1` → 用户确认后 `POST .../step/1/confirm`（JSON）  
5. `GET .../step/2` → `POST .../step/2/confirm`（JSON）  
6. `GET .../step/3/reference-latest` →（可选）`POST .../step/3/supplements` → `POST .../step/3/confirm`（JSON）  
7. `GET .../step/4/indicators`  
   - 若 `missing_gb_files.length > 0`：`POST /national-standards/upload?std_code=...` 补文件后**再调**步骤 7 GET  
8. `POST .../step/4/confirm`  
9. `POST .../step/5/compare`（构建）或需要重算时 `GET .../step/5/compare`
10. 回退 hydrate：`GET .../step/5/compare/result`（只读，不触发 Dify③）
11. `POST .../step/5/confirm`
11. `GET .../summary`、`GET .../artifacts`、按需 `GET .../artifacts/file?path=...`

---

## 6. 附录：解析与指标 JSON 形状

### 6.1 `parse_result`（工作流①输出，校验用契约 `DifyWorkflow1Output`）

成功时常见字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `qb_code` | `string` | 企标号 |
| `qb_name` | `string \| null` | 企标名称 |
| `company_name` | `string \| null` | 企业名称 |
| `publish_date` | `string \| null` | 企标发布日期（若 Dify `QB_init_info` 提供；用于无年代号引用时的时点推断，可为 ISO 或中文日期片段） |
| `indicators` | `array` | `{ "name", "value", "raw" }` |
| `referenced_std_codes` | `string[]` | 规范性引用标准号列表（与 `references_detail` 中 `standard_id` 顺序、条数一致） |
| `references_detail` | `array` | 规范性引用逐条提取；元素为 `{ "standard_id", "has_year", "full_text" }`（见下表）；无对象型引用时可为 `[]`（仅 `referenced_std_codes` 有值） |

**`references_detail` 单条元素**

| 字段 | 类型 | 说明 |
|------|------|------|
| `standard_id` | `string \| null` | 标准编号，与 `referenced_std_codes` 对应项一致 |
| `has_year` | `boolean \| null` | 是否含发布年等年代信息（来自 Dify） |
| `full_text` | `string \| null` | 该条引用的原文描述 / 展示用全文 |

Mock 或未对齐时字段可能略有差异，以前端容错解析为宜。

### 6.2 `national_by_std_code` 指标行（步骤 4）

每个 `std_code` 对应数组元素常见字段：

| 字段 | 类型 |
|------|------|
| `id` | `number` | 国标指标表主键 |
| `std_code` | `string` | 标准号 |
| `specific_indicator_value` | `string` | 指标文本 |

---

## 6.3 批量规范性引用评价（独立路由，与合规任务无关）

前端在新界面批量上传企标文件，后端为每个文件调用**专用 Dify 工作流**（环境变量 `BATCH_NORMATIVE_REF_*`，输入变量默认 `QB_file`），抽取规范性引用后按与 **`GET /api/v1/compliance/evaluations/{task_id}/step/3/reference-latest`** 相同的规则做谱系查新，结果写入表 `batch_normative_reference_job` / `batch_normative_reference_item`，**不写** `compliance_evaluation_task` 等合规表。

**给前端的专项说明（字段、状态机、示例代码）**：见仓库内 **[`docs/backend-batch-normative-reference-API-前端对接手册.md`](backend-batch-normative-reference-API-前端对接手册.md)**。

### 6.3.1 创建任务（异步）

- **方法 / 路径**：`POST /api/v1/batch-normative-reference/jobs`
- **Content-Type**：`multipart/form-data`
- **表单字段**：
  - **`files`**：一个或多个企标文件（字段名固定为 `files`；与 Django `request.FILES.getlist("files")` 一致）
  - **`label`**（可选）：批次说明字符串

**成功**：`201`，JSON 与 **`GET /jobs/{job_id}`** 结构相同（创建后 `status` 一般为 `pending`，`items[].status` 为 `pending`）。须启动 **Celery Worker** 后任务才会进入 `processing` / `completed`。

**常见错误**：

| HTTP | 说明 |
|------|------|
| `422` | 未上传任何文件，或超过 `BATCH_NORMATIVE_REF_MAX_FILES`（默认与上限均为 **100**） |
| `503` | 未配置 `BATCH_NORMATIVE_REF_DIFY_API_KEY` 等；或 **`COMPLIANCE_REQUIRE_MYSQL=true`** 且当前库非 MySQL（与合规模块 `require_mysql()` 行为一致） |

### 6.3.2 查询任务与结果（轮询）

- **方法 / 路径**：`GET /api/v1/batch-normative-reference/jobs/{job_id}`

**响应要点**：

| 字段 | 说明 |
|------|------|
| `status` | `pending` → `processing` → `completed`（单文件失败不阻断整批，`failed_items` 递增） |
| `total_items` / `completed_items` / `failed_items` | 计数 |
| `items[]` | 每项含 `id`、`sort_order`、`original_filename`、`status`、`error_message`、`all_references_are_latest`（见下） |
| `items[].references_resolved` | 仅当该项 `status === "completed"` 时有值：**数组**，元素结构与 **`GET .../reference-latest` 的 `references[]` 单条**一致（含 `citation_matches_latest`、`is_latest` 及 §4.10 所列字段） |
| `items[].all_references_are_latest` | **`boolean \| null`**：`completed` 时由后端重算——对 **`resolution_path` 非 `qb_enterprise_citation` 且非 `manual_review_non_gb` 且非 `missing_enterprise_qb_code`** 的 **`references_resolved`** 行，**全部** **`citation_matches_latest`** 为 **`true`** 则为 **`true`**；**QB 轻工行业标准行、非 GB 待审核行、无完整 `Q/…` 企标号行不参与**（空数组视为 **`true`**）；非 `completed` 为 **`null`**。 |

### 6.3.3 单子项详情（可选）

- **方法 / 路径**：`GET /api/v1/batch-normative-reference/jobs/{job_id}/items/{item_id}`  
- 返回体字段与 `items[]` 单元素一致。

### 6.3.4 模块元信息

- **`GET /api/v1/batch-normative-reference/module`**：同合规模块 `GET .../compliance/module` 形式（`ModuleMetaOut`）。

### 6.3.5 鉴权

与合规一致：当 **`COMPLIANCE_API_AUTH_REQUIRED=true`** 时须带 **`Authorization: Bearer`**；任务按 **`created_by`** 与 token 中 `subject` 绑定，跨用户访问返回 **403**。

### 6.3.6 curl 示例（占位符）

```bash
curl -sS -X POST "http://127.0.0.1:8000/api/v1/batch-normative-reference/jobs" \
  -F "label=试跑批次" \
  -F "files=@/path/to/enterprise1.pdf" \
  -F "files=@/path/to/enterprise2.pdf"

curl -sS "http://127.0.0.1:8000/api/v1/batch-normative-reference/jobs/1"
```

---

## 7. 环境与配置（前端可提示用户）

| 环境变量 | 作用 |
|----------|------|
| `MYSQL_DATABASE` 等 | 配置后 Django 使用 MySQL；**完整落库与谱系/汇总**依赖 MySQL + `v1.0-sql` 表；未配置时默认 SQLite 可跑通向导（见 `COMPLIANCE_REQUIRE_MYSQL`、§8） |
| `DIFY_API_BASE`、`DIFY_API_KEY`、`DIFY_WORKFLOW1_FILES_INPUT_KEY` 等 | 工作流①真实调用；不配则 Mock |
| `DIFY_WORKFLOW2_*` / `DIFY_WORKFLOW3_*` | 工作流②③；不配则 Mock |
| `BATCH_NORMATIVE_REF_DIFY_API_BASE` | 可选；未设时与 `DIFY_API_BASE` 共用。须含 `/v1` |
| `BATCH_NORMATIVE_REF_DIFY_API_KEY` | 批量规范性引用专用 Dify 应用密钥（**勿**提交仓库） |
| `BATCH_NORMATIVE_REF_FILES_INPUT_KEY` | 默认 `QB_file`，须与 Dify「开始」文件变量名一致 |
| `BATCH_NORMATIVE_REF_FILE_PAYLOAD_MODE` | 可选；同 `DIFY_WORKFLOW1_FILE_PAYLOAD_MODE` |
| `BATCH_NORMATIVE_REF_WORKFLOW_ID` | 可选；空则 `POST /workflows/run` |
| `BATCH_NORMATIVE_REF_MAX_FILES` | 可选；单次上传最大文件数，默认 `100`，有效范围 **1～100**（配置超出按 100） |
| `COMPLIANCE_API_AUTH_REQUIRED` | `true` 时除 `/module` 外需 `Authorization: Bearer` |
| `COMPLIANCE_REQUIRE_MYSQL` | 默认 `false`；为 `true` 且非 MySQL 时，依赖业务表的接口返回 **503** |
| `COMPLIANCE_DIFY_PARSE_ASYNC` | `true` 时上传后异步解析，需 Celery Worker |
| `COMPLIANCE_PARSE_ASYNC_PENDING_TIMEOUT_SECONDS` | 异步 `pending` 超时秒数，默认 `600` |
| `REFERENCE_PEDIGREE_CHAIN_MAX_CHARS` | `GET .../step/3/reference-latest` 中 `pedigree_chain`（`part_chain`）最大字符数，默认 `800`；`0` 表示不截断 |

自检接口（可选给运维/前端联调）：**`GET /api/v1/engine/dify/config-probe`**（不返回密钥）。

---

## 8. HTTP 503：强制 MySQL（`COMPLIANCE_REQUIRE_MYSQL`）与 `reference-latest`

环境变量 **`COMPLIANCE_REQUIRE_MYSQL`** 默认为 **`false`**：使用 **SQLite** 时仍可调用多数审核确认等接口，**不会**仅因「非 MySQL」触发 **`require_mysql()`** 的 503（但写入 `enterprise_*` / `national_*` / `evaluation_result` 的 SQL 会跳过，汇总等字段可能为空）。

**例外**：**`GET .../step/3/reference-latest`** 在任务已有 **`qb_code`**（且 **`current_step >= 3`**）时，若 Django **`default` 库仍非 MySQL**，**始终**返回 **503**，`detail` 为批量查新专用说明（要求 MySQL + 同库审核 2 映射、谱系表等），**不再**返回 **`200` + 假空数组**。

当 **`COMPLIANCE_REQUIRE_MYSQL=true`** 且 Django **`default` 库不是 MySQL** 时，以下接口在调用 **`require_mysql()`** 时会返回 **503**，`detail` 为中文长说明：

- `POST .../step/1/confirm`
- `POST .../step/2/confirm`
- `GET .../step/3/reference-latest`
- `POST .../step/3/supplements`
- `POST .../step/3/confirm`
- `GET .../step/4/indicators`
- `POST /national-standards/upload`
- `POST .../step/5/confirm`
- `POST /api/v1/batch-normative-reference/jobs`
- `GET .../summary`

（`POST .../step/4/confirm`、`GET .../step/5/compare` 不依赖上述强制检查。）

**SQLite 自测常用接口**：`/module`、`POST/GET /evaluations`、任务详情、上传、`GET step/1`、`GET step/2`、`GET artifacts`、`GET artifacts/file`。**批量查新**（`reference-latest`）请在 **MySQL** 环境或 **`qb_code` 为空** 的任务上验证（后者返回 **`{"references":[],"all_references_are_latest":true}`**）。

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-06 | 批量 **`BATCH_NORMATIVE_REF_MAX_FILES`**：默认与硬上限均为 **100**（单次上传文件数）。 |
| 2026-05-06 | **仅 GB 开头**引用自动补全年代号并查国标谱系；**`manual_review_non_gb`**：非 GB 且非 QB 的引用不自动查新；**`all_references_are_latest`** 汇总与 **`citation_matches_latest`** 规则同步。 |
| 2026-05-06 | **`unresolved_no_historical_row`**（无年代号且国标库推断失败）：**`latest_std_primary`/`current_latest_id` 为空串**，**`latest_std_codes`/`current_latest_std_codes` 为 `[]`**，不再用企标引用原文冒充现行最新号。 |
| 2026-05-06 | **`missing_enterprise_qb_code`**：GB 引用在上下文无 **`Q/…`** 完整企标号时现行侧为空、不推断谱系；**`all_references_are_latest`** 汇总排除此类行。 |
| 2026-05-08 | 引用号以 **`QB`** 开头（**轻工行业标准**）：**`resolution_path=qb_enterprise_citation`**，现行侧为空，不查国标谱系；**`all_references_are_latest`** 汇总排除此类行。 |
| 2026-05-06 | **`citation_matches_latest` / `is_latest`**：仅比对 **`full_std_at_publication`** 与 **`latest_std_primary`**（两侧规范化后均非空才比较）；**不再**用 **`latest_std_codes`** 集合判定。 |
| 2026-05-08 | **`GET .../step/3/reference-latest`**：响应根由 **JSON 数组** 改为 **`{ "references": [...], "all_references_are_latest": boolean }`**（破坏性变更）。每条引用增加 **`citation_matches_latest`**；**`is_latest`** 与其同值，语义改为「**`full_std_at_publication` 规范化后是否等于现行侧主项或在 `latest_std_codes` 集合中**」。根级 **`all_references_are_latest`** 表示该任务映射下引用是否**全部**现行。 |
| 2026-05-06 | 增加 §6.3 批量规范性引用评价（`POST/GET /api/v1/batch-normative-reference/jobs`）及环境变量说明 |
| 2026-05 | `reference-latest`：每项响应**前置** `referenced_std_code`、`full_std_at_publication`、`pedigree_lookup_std_code`、`latest_std_codes`、`latest_std_primary`（与既有字段语义等价，便于前端阅读） |
| 2026-05 | `reference-latest`：非 MySQL 且任务有 `qb_code` 时 **503**（不再假空 `[]`）；映射行按 `MIN(id)` 排序；响应增加 **`current_latest_std_codes`**；谱系多现行号全量返回 |
| 2026-05 | `reference-latest`：`enterprise_as_of_year` 增加 `qibiao_release_date` / `enterprise_release_date`；响应增加 `historical_full_std_code`；`pedigree_chain` 截断长度由 `REFERENCE_PEDIGREE_CHAIN_MAX_CHARS` 控制（0=不截断） |
| 2026-05 | 首版：覆盖当前 `compliance` 路由全部接口、请求/响应与流程约定 |
