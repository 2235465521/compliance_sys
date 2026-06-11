# 合规评价模块 — 前端接入流程指南

本文档面向**前端实现与联调**，说明如何**按顺序、按状态**调用后端 **`/api/v1/compliance`** 接口，避免常见理解错误。字段级契约仍以 **[backend-compliance-API-前端对接手册.md](./backend-compliance-API-前端对接手册.md)** 与运行环境 **`GET /api/v1/docs`** 为准。

---

## 1. 必须先建立的三点认知

### 1.1 步骤以服务端为准，不能「只改前端路由」

- 任务当前进度由数据库字段 **`current_step`**（1～6）表示。
- **`POST .../step/*/confirm` 成功**后，后端才会把 **`current_step`** 推进到下一步。
- 前端本地路由（例如 URL 里写 `/step/3`）**不会**自动让后端认为已进入步骤 3；若未调用对应 **confirm**，后续接口会 **422**（例如 `GET .../step/3/reference-latest` 要求「请先完成审核 2」）。

**自检**：不确定时随时 **`GET /api/v1/compliance/evaluations/{task_id}`**，以响应里的 **`current_step`**、`**parse_status**` 为准。

### 1.2 上传企标只允许在步骤 1

- **`POST /evaluations/{task_id}/upload`** 仅在 **`current_step === 1`** 时允许。
- 任务已做过审核 1 确认（`current_step >= 2`）后再调 upload，会得到 **422**：`仅步骤 1 允许上传或替换企标文件`。
- **正确做法**：需要重新走上传时，**新建任务**（`POST /evaluations`）再 upload；或在开发环境由运维把该任务 `current_step` 调回 1（不推荐生产库随意改）。

### 1.3 MySQL / SQLite 与「空数据」

- 部分接口依赖 **`enterprise_standard_*`、`national_standard_*`、`standard_pedigree`、`evaluation_result`** 等表。
- **默认 `COMPLIANCE_REQUIRE_MYSQL=false`** 时，SQLite 下仍可跑**向导与确认**，但依赖上述表的 SQL 会跳过或返回**空数组**，**不是**前端漏调接口。
- 若环境为 **`COMPLIANCE_REQUIRE_MYSQL=true`** 且当前库不是 MySQL，相关接口会 **503**。

详见主手册 **§8** 与 **`.env.example`**。

---

## 2. Base URL 与鉴权

| 项 | 说明 |
|----|------|
| 前缀 | 业务接口均在 **`/api/v1/compliance`** 下 |
| 示例根 | `http://127.0.0.1:8000`（按部署修改） |
| JSON 请求 | `Content-Type: application/json` |
| 文件上传 | `multipart/form-data`（字段名与主手册一致，企标 upload 使用文件字段） |

**鉴权**（`COMPLIANCE_API_AUTH_REQUIRED`，默认 `false`）：

- 为 `false`：一般无需 `Authorization`（`GET .../module` 始终可不鉴权）。
- 为 `true`：除 `GET .../module` 外需 **`Authorization: Bearer <token>`**；列表按租户过滤，跨租户访问任务可能 **403**。

---

## 3. 推荐主流程（六步向导）— 按顺序执行

下列步骤中 **`{task_id}`** 一律使用 **`POST /evaluations` 返回的 `id`**，勿写死示例数字。

### 阶段 0：可选自检

| 顺序 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 0-1 | GET | `/api/v1/compliance/module` | 模块存活与说明；可不鉴权 |

### 阶段 1：建任务 → 上传企标 → 等解析

| 顺序 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 1-1 | POST | `/api/v1/compliance/evaluations` | 创建任务；**保存响应体中的 `id`** 为 `task_id` |
| 1-2 | POST | `/api/v1/compliance/evaluations/{task_id}/upload` | **仅当** `GET .../evaluations/{task_id}` 的 `current_step === 1`；`multipart/form-data` 上传文件；触发工作流①解析 |
| 1-3 | GET | `/api/v1/compliance/evaluations/{task_id}` | **轮询**：若 `parse_status` 为 `pending` / `running`，间隔拉取直至 `completed` 或 `failed` |
| 1-4 | GET | `/api/v1/compliance/evaluations/{task_id}/step/1` | 审核 1 页数据：含 `task` 摘要 + **`parse_result`**（完整解析 JSON） |

**异步解析**（`COMPLIANCE_DIFY_PARSE_ASYNC=true`）：upload 可能很快返回且 `parse_status=pending`，必须执行 **1-3** 轮询，不可假设 upload 返回即解析完成。

**解析失败**（`parse_status=failed`）：阅读 `parse_error`；需用户**重新上传**时仍须满足 **`current_step === 1`**（见 §1.2）。

### 阶段 2：审核 1

| 顺序 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 2-1 | POST | `/api/v1/compliance/evaluations/{task_id}/step/1/confirm` | JSON：`Step1ConfirmIn`（至少 **`qb_code` 必填**）；成功后 **`current_step` 变为 `2`** |

**前置条件**：解析已完成且成功（`parse_status=completed` 且有解析结果）；否则 confirm 会 **422**。

### 阶段 3：审核 2（引用 + 指标）

| 顺序 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 3-1 | GET | `/api/v1/compliance/evaluations/{task_id}/step/2` | 展示：`task`、`suggested_references`（含 `referenced_std_code`、`has_year`、`full_text` 等）、`indicators` |
| 3-2 | POST | `/api/v1/compliance/evaluations/{task_id}/step/2/confirm` | JSON：`Step2ConfirmIn`（`references`、`indicator_set`）；成功后 **`current_step` 变为 `3`** |

**要点**：未完成 **3-2** 前，不要调用步骤 3 的 `reference-latest`（会 422「请先完成审核 2」）。

### 阶段 4：审核 3（引用现行 + 补充 + 确认）

| 顺序 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 4-1 | GET | `/api/v1/compliance/evaluations/{task_id}/step/3/reference-latest` | **必须**已 **3-2** 成功且服务端 **`current_step >= 3`**；返回 **JSON 对象** `references`（数组，每条为引用解析结果）与 **`all_references_are_latest`**（是否全部现行）；单条含 **`citation_matches_latest`** / **`is_latest`**、`full_std_at_publication`、`latest_std_codes`、`latest_std_primary` 等 |
| 4-2 | （可选）POST | `/api/v1/compliance/evaluations/{task_id}/step/3/supplements` | n+m 补充行 |
| 4-3 | POST | `/api/v1/compliance/evaluations/{task_id}/step/3/confirm` | 审核 3 确认；成功后 **`current_step` 变为 `4`** |

**SQLite / 无 `qb_code`**：若任务尚无企标号，本接口可能为 **200 + `[]`**。**SQLite 且已有 `qb_code`**：本接口返回 **503**（批量查新不可用），勿误判为「无引用数据」。

**MySQL 下空数组**：多为映射表无有效 `referenced_std_code`，或审核 2 未在同一库落库。

### 阶段 5：步骤 4 — 指标编排与审核 4

| 顺序 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 5-1 | GET | `/api/v1/compliance/evaluations/{task_id}/step/4/indicators` | 企标侧指标 + 按标准号聚合的国标指标 + `missing_gb_files` |
| 5-2 | （按需循环）POST | `/api/v1/compliance/national-standards/upload?std_code=...` | 对缺失国标文件的标准补传；补完后**再 GET 5-1** 刷新 |
| 5-3 | POST | `/api/v1/compliance/evaluations/{task_id}/step/4/confirm` | 若仍有未解决的 `missing_gb_files` 可能 **422**；成功后 **`current_step` 变为 `5`** |

### 阶段 6：步骤 5 — 对比与审核 5

| 顺序 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 6-1 | GET | `/api/v1/compliance/evaluations/{task_id}/step/5/compare` | 工作流③对比结果（未配 Dify 可能为 Mock） |
| 6-2 | POST | `/api/v1/compliance/evaluations/{task_id}/step/5/confirm` | 成功后 **`current_step` 变为 `6`** |

### 阶段 7：步骤 6 — 汇总与制品

| 顺序 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 7-1 | GET | `/api/v1/compliance/evaluations/{task_id}/summary` | 汇总（依赖 MySQL 时才有完整库表数据） |
| 7-2 | GET | `/api/v1/compliance/evaluations/{task_id}/artifacts` | 制品列表 |
| 7-3 | GET | `/api/v1/compliance/evaluations/{task_id}/artifacts/file?path=...` | 下载；`path` 为 7-2 返回值 URL 编码 |

---

## 4. 与「任务详情」接口的分工

| 接口 | 用途 |
|------|------|
| **`GET .../evaluations/{task_id}`** | **轻量轮询**：`current_step`、`parse_status`、`qb_code`、文件名等；**不含** `parse_result` 大 JSON |
| **`GET .../evaluations/{task_id}/step/1`** | 审核 1 **详情**：含 **`parse_result`** |

前端不要用「任务详情」代替「审核 1 展示」拉解析正文。

---

## 5. 常见错误与排查

| 现象 | 常见原因 |
|------|----------|
| upload **422**「仅步骤 1…」 | `current_step !== 1`，已走过审核 1；应新建任务或换任务 id |
| reference-latest **503**（批量查新说明文案） | **SQLite**（或 default 非 MySQL）且任务已有 **`qb_code`**：须改用 MySQL + 导入表并在同库完成审核 2 |
| reference-latest **422**「请先完成审核 2」 | 未成功调用 **`POST .../step/2/confirm`**，或 confirm 失败；先 `GET .../evaluations/{id}` 看 `current_step` |
| reference-latest **200** 且 **`references` 为空** | 多为 **`qb_code` 为空**，或 MySQL 下映射表无有效 `referenced_std_code`（审核 2 未写入同库）；此时 **`all_references_are_latest`** 为 **`true`** |
| 某 confirm **422**「当前不在步骤 x」 | 调用了与 **`current_step`** 不匹配的 confirm；按 `GET evaluations/{id}` 对齐界面步骤 |
| **503** 长文案 | `COMPLIANCE_REQUIRE_MYSQL=true` 且当前库非 MySQL，或依赖表未导入 |

---

## 6. 与主手册的关系

- **接口路径、请求/响应字段、错误码、环境变量**：见 **[backend-compliance-API-前端对接手册.md](./backend-compliance-API-前端对接手册.md)**（尤其 **§1、§3、§4、§5、§6、§7、§8**）。
- 本文侧重 **调用顺序、状态依赖、易错点**；版本迭代时两处文档应交叉核对。

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-08 | `reference-latest`：响应根为 **`{ references, all_references_are_latest }`**；与主手册 §4.10 对齐 |
| 2026-05 | `reference-latest`：SQLite + 有 `qb_code` 时 **503**；与主手册 §4.10 / §8 对齐 |
| 2026-05 | 首版：前端接入主流程、状态机认知、与主手册分工及排错表 |
