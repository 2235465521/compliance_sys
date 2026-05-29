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
| `qb_code` | `string \| null` | 企标号；审核 1 确认后才有 |
| `current_step` | `number` | 当前步骤 1～6 |
| `status` | `string` | 任务状态，ORM 默认如 `active` |
| `uploaded_file_name` | `string \| null` | 最近上传的企标文件名 |
| `has_parse_result` | `boolean` | 是否已有 `parse_result_json`（有结构化解析结果） |
| `parse_status` | `string` | `pending` / `running` / `completed` / `failed` |
| `parse_error` | `string \| null` | 解析失败时的摘要 |

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
| POST | `/evaluations/{task_id}/upload` | 上传企标并触发工作流① |
| GET | `/evaluations/{task_id}/step/1` | 审核 1 展示 |
| POST | `/evaluations/{task_id}/step/1/confirm` | 审核 1 确认 |
| GET | `/evaluations/{task_id}/step/2` | 审核 2 展示 |
| POST | `/evaluations/{task_id}/step/2/confirm` | 审核 2 确认 |
| GET | `/evaluations/{task_id}/step/3/reference-latest` | 引用号 → 现行最新 |
| POST | `/evaluations/{task_id}/step/3/supplements` | n+m 补充行 |
| POST | `/evaluations/{task_id}/step/3/confirm` | 审核 3 确认 |
| GET | `/evaluations/{task_id}/step/4/indicators` | 步骤 4 指标编排 |
| POST | `/evaluations/{task_id}/step/4/confirm` | 审核 4 确认 |
| POST | `/national-standards/upload` | 补传国标文件 |
| GET | `/evaluations/{task_id}/step/5/compare` | 工作流③ 指标对比 |
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

**响应 200**：`ComplianceTaskOut`。新建任务通常 `current_step=1`，`qb_code=null`，`has_parse_result=false`，`parse_status` 多为 `completed`（默认）直至上传。

**鉴权**：若开启 `COMPLIANCE_API_AUTH_REQUIRED`，创建的任务会写入 `created_by`（与 Bearer 关联）。

---

### 4.3 `GET /evaluations`

**说明**：任务列表；默认最多 **100** 条，按 `id` 降序。

**请求参数**：无 Query。

**响应 200**：**`ComplianceTaskOut[]`**（JSON 数组）。

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
| `qb_code` | `string` | 是 | 企标号（用户确认后） |
| `qb_name` | `string \| null` | 否 | 企标名称 |
| `company_name` | `string \| null` | 否 | 企业名称 |

**响应 200**：`ComplianceTaskOut`（`current_step` 变为 `2`，`qb_code` 有值）。

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

**说明**：根据审核 2 写入的 **`enterprise_standard_reference_mapping.referenced_std_code`**（去重后 n 条），将每条引用解析为**现行最新标准号**，供审核 3 展示。

**解析逻辑（后端实现）**：

1. **是否含年代号**：若引用号末段匹配 `-YYYY` / `－YYYY`（四位年），视为**完整标准号**。
2. **有年代号**：用该完整号查 **`standard_pedigree`**（`std_code` 精确匹配），读取 **`latest_std_code`**（可能多条顿号拼接，取**首段**作为展示主「现行号」）；并返回 **`part_chain`** / `ped_id` 摘要。若谱系表无行，再回退 **`national_standard_basic`** 仅校验存在性。
3. **无年代号**：先用**企标时点年** `enterprise_as_of_year` 在 **`national_standard_basic`** 中推断「当时应引用」的具体标准号：在 `std_code = 引用前缀` 或 `std_code LIKE '前缀-%'` 且 `YEAR(publish_date) <= enterprise_as_of_year`（`publish_date` 为空时仍参与排序）中取**发布日期最新**的一条，得到 **`inferred_historical_std_code`**；再以该锚点号查 **`standard_pedigree`** 得现行最新（同第 2 步）。
4. **企标时点年**来源顺序：`parse_result_json.publish_date`（及同义键 `impl_date` / `release_date` / **`qibiao_release_date`** / `enterprise_release_date` 等）解析年份 → **`qb_code` 内四位年** → 任务 **`created_at`** 年份。
5. **`pedigree_chain` 长度**：来自 `standard_pedigree.part_chain` 时，默认最多 **800** 字符（超出加 `…`）；可通过环境变量 **`REFERENCE_PEDIGREE_CHAIN_MAX_CHARS`** 调整；设为 **`0`** 表示**不截断**（注意响应体积）。

**要求**：已完成审核 2（`current_step < 3` 则 **422**）。MySQL 下从依赖表组装引用谱系；SQLite 下返回空列表（见 §8）。依赖表：`enterprise_standard_reference_mapping`、`standard_pedigree`、`national_standard_basic`。

**路径参数**：`task_id`。

**响应 200**：**JSON 数组**，与 `referenced_std_code` 顺序对应；每项字段如下：

| 字段 | 类型 | 说明 |
|------|------|------|
| `query_bz_id` | `string` | 原始引用标准号（映射表中的值） |
| `is_latest` | `boolean` | 是否成功得到可展示的现行侧结论 |
| `current_latest_id` | `string` | **现行最新标准号**（主展示；来自谱系 `latest_std_code` 首段或回退锚点） |
| `pedigree_chain` | `string` | 谱系链摘要或说明（`part_chain` 截断或 `ped_id`） |
| `resolution_path` | `string` | 内部路径标识，如 `pedigree_direct`、`historical_then_pedigree`、`unresolved_no_historical_row` 等，便于联调 |
| `inferred_historical_std_code` | `string \| null` | 仅无年代号路径：在国标库中推断出的「当时版本」标准号 |
| `enterprise_as_of_year` | `number \| null` | 仅无年代号路径：采用的企标时点年 |
| `pedigree_anchor_std_code` | `string` | （可选）实际用于查谱系表的锚点标准号 |
| `latest_std_code_raw` | `string \| null` | （可选）谱系表 `latest_std_code` 字段原文 |
| `historical_full_std_code` | `string \| null` | **与 `inferred_historical_std_code` 语义对齐的展示别名**：有年代号时为**原文引用**（同 `query_bz_id`）；无年代号且推断成功时为**当时完整国标号**（与 `inferred_historical_std_code` 一致）；未推断成功时为 `null` |

**常见错误**：422（未完成审核 2）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

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

**响应 200**：`ComplianceTaskOut`（`current_step=4`）。

**常见错误**：422；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

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

**说明**：审核 4 确认；若当前缓存的 `indicator_bundle_json` 中仍有 `missing_gb_files` 非空，则 **422** 禁止确认。成功则 `current_step=5`。**要求 MySQL**。

**路径参数**：`task_id`。

**请求体**：无 JSON body（可不发送 `{}`）。

**响应 200**：`ComplianceTaskOut`。

**常见错误**：422，且 `detail` 可能为 **JSON 字符串**，内含 `missing_gb_files` 数组（与步骤 4 GET 中结构一致），便于前端解析展示。

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

**常见错误**：422（步骤不对、未确认审核 4）；502（Dify③失败）；**503**（`COMPLIANCE_REQUIRE_MYSQL=true` 且非 MySQL）。

---

### 4.17 `POST /evaluations/{task_id}/step/5/confirm`

**说明**：审核 5 确认；要求已先调用过 **`GET .../step/5/compare`** 以生成 `compare_result_json`。生成**指标对比占位证书 PDF**，写入评价结果占位枚举，推进 **`current_step=6`**。**要求 MySQL**。

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

**说明**：列出本任务 `compliance_certs/{task_id}/` 下可下载文件（相对 **`MEDIA_ROOT`** 的相对路径）。**不要求 MySQL**（读任务 + 扫盘）。

**路径参数**：`task_id`。

**响应 200**：

```json
{
  "artifacts": [
    { "kind": "file", "label": "文件名", "path": "相对 media 的路径" }
  ]
}
```

---

### 4.20 `GET /evaluations/{task_id}/artifacts/file`

**说明**：下载单个制品文件；**路径穿越防护**：仅允许 `compliance_certs/{task_id}/**` 下文件。

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
9. `GET .../step/5/compare`  
10. `POST .../step/5/confirm`  
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

## 7. 环境与配置（前端可提示用户）

| 环境变量 | 作用 |
|----------|------|
| `MYSQL_DATABASE` 等 | 配置后 Django 使用 MySQL；**完整落库与谱系/汇总**依赖 MySQL + `v1.0-sql` 表；未配置时默认 SQLite 可跑通向导（见 `COMPLIANCE_REQUIRE_MYSQL`、§8） |
| `DIFY_API_BASE`、`DIFY_API_KEY`、`DIFY_WORKFLOW1_FILES_INPUT_KEY` 等 | 工作流①真实调用；不配则 Mock |
| `DIFY_WORKFLOW2_*` / `DIFY_WORKFLOW3_*` | 工作流②③；不配则 Mock |
| `COMPLIANCE_API_AUTH_REQUIRED` | `true` 时除 `/module` 外需 `Authorization: Bearer` |
| `COMPLIANCE_REQUIRE_MYSQL` | 默认 `false`；为 `true` 且非 MySQL 时，依赖业务表的接口返回 **503** |
| `COMPLIANCE_DIFY_PARSE_ASYNC` | `true` 时上传后异步解析，需 Celery Worker |
| `COMPLIANCE_PARSE_ASYNC_PENDING_TIMEOUT_SECONDS` | 异步 `pending` 超时秒数，默认 `600` |
| `REFERENCE_PEDIGREE_CHAIN_MAX_CHARS` | `GET .../step/3/reference-latest` 中 `pedigree_chain`（`part_chain`）最大字符数，默认 `800`；`0` 表示不截断 |

自检接口（可选给运维/前端联调）：**`GET /api/v1/engine/dify/config-probe`**（不返回密钥）。

---

## 8. HTTP 503：强制 MySQL（`COMPLIANCE_REQUIRE_MYSQL`）

环境变量 **`COMPLIANCE_REQUIRE_MYSQL`** 默认为 **`false`**：使用 **SQLite** 时仍可调用审核确认等接口，**不会**因「非 MySQL」返回 503（但写入 `enterprise_*` / `national_*` / `evaluation_result` 的 SQL 会跳过，汇总等字段可能为空）。

当 **`COMPLIANCE_REQUIRE_MYSQL=true`** 且 Django **`default` 库不是 MySQL** 时，以下接口在调用 **`require_mysql()`** 时会返回 **503**，`detail` 为中文长说明：

- `POST .../step/1/confirm`
- `POST .../step/2/confirm`
- `GET .../step/3/reference-latest`
- `POST .../step/3/supplements`
- `POST .../step/3/confirm`
- `GET .../step/4/indicators`
- `POST /national-standards/upload`
- `POST .../step/5/confirm`
- `GET .../summary`

（`POST .../step/4/confirm`、`GET .../step/5/compare` 不依赖上述强制检查。）

**SQLite 自测常用接口**：`/module`、`POST/GET /evaluations`、任务详情、上传、`GET step/1`、`GET step/2`、`GET artifacts`、`GET artifacts/file`。

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05 | `reference-latest`：`enterprise_as_of_year` 增加 `qibiao_release_date` / `enterprise_release_date`；响应增加 `historical_full_std_code`；`pedigree_chain` 截断长度由 `REFERENCE_PEDIGREE_CHAIN_MAX_CHARS` 控制（0=不截断） |
| 2026-05 | 首版：覆盖当前 `compliance` 路由全部接口、请求/响应与流程约定 |
