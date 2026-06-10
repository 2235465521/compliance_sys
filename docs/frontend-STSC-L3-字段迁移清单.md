# STSC L3 前端字段迁移清单

> **适用版本**：后端已切换至 `STSC_standard_database`（L3 表前缀 `regulation_*`）  
> **目标读者**：前端开发  
> **权威来源**：以运行环境 OpenAPI（`GET /api/v1/docs`）及本仓库 `backend/apps/*/schemas/` 为准  
> **更新日期**：2026-05-22

---

## 1. 为什么要改？

后端将企标主体键从 v1 命名（`qb_code` 等）对齐为 STSC 规范（`subject_code` + `catalog_std_type_no`）。**HTTP API 的请求/响应字段名已变更**；仅数据库表名变更、接口路径**大部分不变**。

| 维度 | 改前（v1） | 改后（STSC） |
|------|-----------|--------------|
| 企标号（业务主键展示） | `qb_code` | **`subject_code`** |
| 企标名称 | `qb_name` | **`subject_name`** |
| 企业/公司名称 | `enterprise_name`（任务上混用） | **`company_name`**（公司名）+ **`subject_name`**（标准名称） |
| 企标 catalog 类型 | 无 | **`catalog_std_type_no`**（企标固定为 `null`，一般只读展示） |
| 预警已评价总数 | `total_evaluated_qb` | **`total_evaluated`** |
| 巡检当前处理企标 | `current_qb_code` | **`current_subject_code`** |

---

## 2. 改动范围总览

| 模块 | Base 路径 | 是否必改 | 说明 |
|------|-----------|----------|------|
| **合规评价** | `/api/v1/compliance` | **是** | 任务 CRUD、六步向导、Step4 编排等 |
| **查新** | `/api/v1/novelty-search` | **是** | 创建任务、列表、详情 |
| **预警（兼容路径）** | `/api/warnings/…` | **是** | 正向预警、监控汇总/列表/巡检进度 |
| **批量规范性引用** | `/api/v1/batch-normative-reference` | **否** | 子项展示仍用 `qb_code`（来自 Dify 解析） |
| **标准库 / 国标列表** | `/api/v1/standards` | **否** | 本次未改 |
| **查重** | `/api/v1/duplicate-check`、`/api/duplicate` | **否** | 本次未改 |

---

## 3. 全局兼容策略（过渡期）

后端对部分接口保留了 **旧 query 参数别名**，便于分批改造；**响应体已统一为新字段，旧字段不再返回**。

| 场景 | 旧参数/字段 | 新参数/字段 | 兼容说明 |
|------|-------------|-------------|----------|
| 查新创建任务 form | `qb_code` | `subject_code` | POST 同时接受两者，**优先读 `subject_code`** |
| 预警 forward-by-qb | `?qb_code=` | `?subject_code=` | Query **同时接受**，优先 `subject_code` |
| 预警 monitor detail | `?qb_code=` | `?subject_code=` | 同上 |
| 预警路径参数 | `/enterprises/{qb_code}` | 路径名未改 | 路径段仍是企标号字符串，**与字段名无关** |
| Dify 解析结果 | `parse_result_json.qb_code` | 不变 | 解析 JSON **仍为 Dify 原始键**；任务确认后以 `task.subject_code` 为准 |
| 错误文案 | 偶见「缺少 qb_code」 | 应为「缺少 subject_code」 | 以实际 `detail` 为准，前端提示可统一写「企标号」 |

**建议**：新代码一律使用 `subject_code` / `subject_name` / `company_name`；旧别名仅作回滚缓冲。

---

## 4. 模块一：合规评价 `/api/v1/compliance`

### 4.1 类型定义迁移（TypeScript 示例）

```typescript
// —— 改前 ——
interface ComplianceTaskOut {
  id: number;
  qb_code: string | null;
  enterprise_name: string | null;
  current_step: number;
  // ...
}

interface Step1ConfirmIn {
  qb_code: string;
  qb_name?: string | null;
  company_name?: string | null;
}

interface Step4IndicatorsOut {
  qb_code: string | null;
  enterprise_indicators: Record<string, unknown>[];
  // ...
}

// —— 改后 ——
interface ComplianceTaskOut {
  id: number;
  catalog_std_type_no: string | null;  // 企标一般为 null
  subject_code: string | null;
  subject_name: string | null;
  company_name: string | null;
  current_step: number;
  status: string;
  uploaded_file_name: string | null;
  has_parse_result: boolean;
  parse_status: 'pending' | 'running' | 'completed' | 'failed';
  parse_error: string | null;
  has_compare_result: boolean;
  compare_result_updated_at: string | null;
  step4_indicators_confirmed: boolean;
  step5_compare_confirmed: boolean;
  updated_at: string | null;
  progress_percent: number;
  step_label: string;
  display_status: 'draft' | 'in_progress' | 'completed' | 'failed';
}

interface Step1ConfirmIn {
  subject_code: string;       // 必填
  subject_name?: string | null;
  company_name?: string | null;
}

interface Step4IndicatorsOut {
  subject_code: string | null;
  enterprise_indicators: Record<string, unknown>[];
  national_by_std_code: Record<string, unknown[]>;
  missing_gb_files: Array<{ std_code: string; std_name?: string; reason: string }>;
  dify2_invoked_std_codes: string[];
}
```

### 4.2 按接口逐项对照

| 方法 | 路径 | 变更点 |
|------|------|--------|
| POST | `/evaluations` | 响应 `ComplianceTaskOut` 字段见上 |
| GET | `/evaluations` | 无 query：数组元素为新 `ComplianceTaskOut`；**有分页/筛选时** query `qb_code` → **`subject_code`** |
| GET | `/evaluations/{task_id}` | 响应字段见上 |
| DELETE | `/evaluations/{task_id}` | 无变更 |
| POST | `/evaluations/{task_id}/upload` | 响应 `ComplianceTaskOut` |
| GET | `/evaluations/{task_id}/step/1` | `task` 子对象为新版；`parse_result` **仍为 Dify 结构**（含 `qb_code`） |
| POST | `/evaluations/{task_id}/step/1/confirm` | **Body 改 `Step1ConfirmIn`**（见下） |
| GET/POST | `/evaluations/{task_id}/step/2` … `step/3` | Step2/3 **body 结构不变**；依赖任务已有 `subject_code` |
| GET | `/evaluations/{task_id}/step/3/reference-latest` | 响应结构**不变**；前置条件：任务已有 **`subject_code`**（原 `qb_code`） |
| GET/POST | `/evaluations/{task_id}/step/4/indicators*` | 响应 `Step4IndicatorsOut.subject_code` |
| GET/PUT/POST | `.../step/4/national-indicators` | **仍用 `std_code`**，无变更 |
| POST | `/national-standards/upload` | Query **`std_code`**，无变更 |
| GET/POST | `/evaluations/{task_id}/step/5/compare*` | 对比结果 JSON **不变** |
| GET | `/evaluations/{task_id}/summary` | 见 §4.4 |

#### Step1 确认 — 请求体示例

```json
// 改前
{
  "qb_code": "Q/AHYY 001-2020",
  "qb_name": "《茶制代烟品》",
  "company_name": "安徽御叶生物科技有限公司"
}

// 改后
{
  "subject_code": "Q/AHYY 001-2020",
  "subject_name": "《茶制代烟品》",
  "company_name": "安徽御叶生物科技有限公司"
}
```

#### 任务列表筛选 — Query

```
// 改前
GET /api/v1/compliance/evaluations?status=all&page=1&page_size=20&qb_code=Q/AH

// 改后
GET /api/v1/compliance/evaluations?status=all&page=1&page_size=20&subject_code=Q/AH
```

### 4.3 前端展示逻辑建议

| UI 位置 | 改前取值 | 改后取值 |
|---------|----------|----------|
| 任务卡片企标号 | `task.qb_code` | `task.subject_code` |
| 任务卡片企标名称 | `parse_result.qb_name` 或 `enterprise_name` | `task.subject_name` 或 `parse_result.qb_name`（解析未确认前） |
| 任务卡片公司名 | `enterprise_name` 或 `parse_result.company_name` | **`task.company_name`** 或 `parse_result.company_name` |
| Step1 表单预填 | 从 `parse_result.qb_code` / `qb_name` | 提交时映射为 **`subject_code` / `subject_name`** |
| Step1 提交校验 | `qb_code` 必填 | **`subject_code` 必填** |
| 列表搜索框绑定 | `filters.qb_code` | `filters.subject_code` |

### 4.4 汇总接口 `GET .../summary`

`SummaryOut` 结构不变，子对象变更：

```typescript
interface SummaryOut {
  task: ComplianceTaskOut;  // 新版字段
  evaluation_result: {
    subject_code: string | null;  // 原 qb_code，现从任务带出
    descriptive_result: string | null;
    reference_result: string | null;
    indicator_result: string | null;
    overall_result: string | null;
    descriptive_result_report_file_path: string | null;
    reference_result_report_file_path: string | null;
    indicator_result_report_file_path: string | null;
    certificate_file_path: string | null;
  } | null;
  artifacts: Array<{ kind: string; label: string; path: string; content_type?: string }>;
  report_path: string | null;
}
```

### 4.5 明确不改的部分（合规）

- **路径 URL**（除列表 query 外）均未改名  
- **`parse_result_json`**：Dify 工作流① 输出仍为 `qb_id` / `qb_code` / `qb_name` 等  
- **国标相关**：`std_code`、`national_by_std_code`、`compare_pairs` 等  
- **Step2 `references`**：`referenced_std_code`、`latest_std_code` 不变  
- **Step3 `reference-latest` 响应**：`references[]` 内字段不变（仍为 `referenced_std_code`、`latest_std_primary` 等）  
- **Dify 工作流③ 入参**：后端拼装给 Dify 的 JSON 内键名仍为 **`qb_code`**（仅服务端内部，前端不直接构造则可忽略）

---

## 5. 模块二：查新 `/api/v1/novelty-search`

### 5.1 类型定义

```typescript
// 改前
interface NoveltyTaskSummary {
  id: number;
  title: string;
  qb_code: string;
  enterprise_name: string | null;
  status: string;
  // ...
}

// 改后
interface NoveltyTaskSummary {
  id: number;
  title: string;
  subject_code: string;
  subject_name: string | null;
  status: string;
  source: string;
  file_name: string | null;
  sheet_confirmed: boolean;
  task_conclusion: string | null;
  task_summary: string | null;
  compare_done: number;
  compare_total: number;
  report_state: string;
  created_at: string;
  updated_at: string;
}
```

### 5.2 按接口对照

| 方法 | 路径 | 变更点 |
|------|------|--------|
| POST | `/tasks` | Form：**`subject_code` 必填**（兼容 `qb_code`）；响应 `NoveltyTaskOut` |
| GET | `/tasks` | Query：`qb_code` → **`subject_code`**；`keyword` 仍搜标题+企标号 |
| GET | `/tasks/{id}` | 响应字段见上 |
| PATCH | `/tasks/{id}/reference-sheet` | Body **不变** |
| POST | `/tasks/{id}/confirm-sheet` | Body **不变** |
| 其余 | retry、report、indicators 等 | 路径不变；任务对象为新字段 |

#### 创建任务 — multipart 示例

```javascript
// 改后（推荐）
const form = new FormData();
form.append('subject_code', 'Q/XXX 001-2020');
form.append('source', 'upload');
form.append('file', file);

// 过渡期仍可用（不推荐）
form.append('qb_code', 'Q/XXX 001-2020');
```

#### 列表筛选

```
GET /api/v1/novelty-search/tasks?subject_code=Q/XXX&page=1&page_size=20
```

### 5.3 错误文案

| HTTP | 改前 detail 示例 | 改后 |
|------|------------------|------|
| 400 | `qb_code 必填` | **`subject_code 必填`** |

---

## 6. 模块三：预警 `/api/warnings/…`

> 挂载在 **`/api/`**（非 `/api/v1/`），响应外包一层 `{ success, data, error }`（`envelope_ok`）。

### 6.1 正向预警 `build_forward_warning` 响应

```typescript
// 改前
interface ForwardWarningData {
  qb_code: string;
  enterprise_name: string | null;
  task_conclusion: string;
  task_summary: string;
  compare_rows: CompareRow[];
  source_evaluations: SourceEval[];
}

// 改后
interface ForwardWarningData {
  subject_code: string;
  subject_name: string | null;
  task_conclusion: string;
  task_summary: string;
  compare_rows: CompareRow[];      // 行内字段不变
  source_evaluations: SourceEval[]; // 不变
}
```

| 方法 | 路径 | Query / Body | 说明 |
|------|------|--------------|------|
| GET | `/api/warnings/forward-by-qb` | **`subject_code`**（或兼容 `qb_code`） | 路径名未改 |
| POST | `/api/warnings/forward-by-file` | `file`；可选 form **`qb_code`** 作提示 | 解析仍读 `parsed.qb_code` |
| GET | `/api/warnings/monitor/enterprises/detail` | **`subject_code`**（或 `qb_code`） | 含 `/` 的企标号必须用 Query |

### 6.2 监控汇总 `GET /api/warnings/monitor/summary`

```typescript
// data 内改前
{
  last_scan_at: string | null;
  total_evaluated_qb: number;
  need_attention_count: number;
  all_ok_count: number;
  no_eval_record_count: number;
  not_scanned_count: number;
  pending_count: number;
  active_scan?: {
    job_id: string;
    status: string;
    processed_count: number;
    total_count: number;
    current_qb_code: string | null;
    phase: string | null;
    // ...
  };
}

// data 内改后
{
  last_scan_at: string | null;
  total_evaluated: number;           // 原 total_evaluated_qb
  need_attention_count: number;
  all_ok_count: number;
  no_eval_record_count: number;
  not_scanned_count: number;
  pending_count: number;               // 仍等于 not_scanned_count
  active_scan?: {
    job_id: string;
    status: string;
    processed_count: number;
    total_count: number;
    current_subject_code: string | null;  // 原 current_qb_code
    phase: string | null;
    pause_requested: boolean;
    need_attention_count: number;
    all_ok_count: number;
    no_eval_record_count: number;
    not_scanned_count: number;
  };
}
```

**前端校验**：`total_evaluated === need_attention_count + all_ok_count + no_eval_record_count + not_scanned_count`（四类之和）。

### 6.3 监控列表 `GET /api/warnings/monitor/enterprises`

`data.items[]` 每项：

```typescript
// 改前
{ qb_code: string; enterprise_name: string; task_conclusion: string; task_summary: string; last_checked_at: string | null }

// 改后
{ subject_code: string; subject_name: string; task_conclusion: string; task_summary: string; last_checked_at: string | null }
```

`keyword` 筛选同时匹配 **`subject_code`** 与 **`subject_name`**。

### 6.4 反向预警（若使用）

`affected_enterprises[]` 每项：

| 改前 | 改后 |
|------|------|
| `qb_code` | **`subject_code`** |
| `enterprise_name` | **`subject_name`** |

`enterprise_need_modify`、`enterprise_conclusion_label`、`summary` **不变**。

### 6.5 巡检队列（内部字段，若前端解析 `active_scan` 或调试）

服务端队列 JSON 元素：`{ subject_code, phase }`（原 `qb_code`）。

---

## 7. 不改动的模块（无需前端改字段）

### 7.1 批量规范性引用 `/api/v1/batch-normative-reference`

子项 `BatchNormativeRefItemOut` **仍含** `qb_code`、`qb_name`、`enterprise_standard_name` 等（来自 Dify 解析展示，未做 STSC 重命名）。

### 7.2 标准库 `/api/v1/standards`

国标列表、指标入库、`std_code` 相关接口 **未改**。

### 7.3 查重 `/api/v1/duplicate-check`

**未改**。

---

## 8. 推荐改造顺序与工作量粗估

| 优先级 | 页面/功能 | 主要改动 | 粗估 |
|--------|-----------|----------|------|
| P0 | 合规任务中心列表/详情 | `ComplianceTaskOut` 类型、列表 `subject_code` 筛选 | 0.5～1d |
| P0 | 合规 Step1 确认表单 | Body 字段重命名 + 预填映射 | 0.5d |
| P1 | 合规 Step4 指标编排展示 | 读 `subject_code` 替代 `qb_code` | 0.25d |
| P1 | 合规 Step6 汇总 / 报告 | `evaluation_result.subject_code` | 0.25d |
| P1 | 查新任务创建/列表/详情 | Form + 类型 | 0.5～1d |
| P2 | 预警正向五列表 | 响应字段 | 0.5d |
| P2 | 预警监控大盘 + 列表 + 巡检进度 | `total_evaluated`、`current_subject_code`、列表行 | 1d |
| — | 批量引用、标准库、查重 | 无 | 0 |

---

## 9. 联调自测清单

### 合规

- [ ] 创建任务 → 上传企标 → `GET step/1` 解析结果含 `qb_code`（Dify）  
- [ ] Step1 confirm 使用 **`subject_code` / `subject_name`** → 任务详情 `subject_code` 有值、`current_step=2`  
- [ ] 任务列表 `?subject_code=` 筛选生效  
- [ ] Step4 `GET step/4/indicators` 响应含 **`subject_code`**  
- [ ] `GET summary` 中 `evaluation_result.subject_code` 与任务一致  

### 查新

- [ ] `POST /tasks` 仅传 `subject_code` 可创建  
- [ ] 列表/详情显示 `subject_code`、`subject_name`  

### 预警

- [ ] `GET /api/warnings/forward-by-qb?subject_code=Q/...` 返回 `data.subject_code`  
- [ ] `GET /api/warnings/monitor/summary` 含 **`total_evaluated`**（非 `total_evaluated_qb`）  
- [ ] 监控列表行含 **`subject_code` / `subject_name`**  
- [ ] 巡检进行中 `active_scan.current_subject_code` 有值  

### 回归（应仍正常）

- [ ] 批量引用任务列表仍显示 `qb_code`  
- [ ] 国标 `std_code` 查询、上传国标 PDF  
- [ ] `reference-latest` 响应结构  

---

## 10. 环境与依赖说明（给前端参考）

- 后端已连接 **`STSC_standard_database`**（`192.168.10.225`）  
- **Step3 引用查新**依赖 DBA 在库上执行 L1 只读视图脚本：`scripts/stsc_l1_compat_views.sql`（未执行时 `reference-latest` 可能 500/空数据）  
- 合规/查新/预警接口需 **MySQL**（`COMPLIANCE_REQUIRE_MYSQL=true` 时 SQLite 返回 503）  

---

## 11. 相关文档索引

| 文档 | 说明 |
|------|------|
| [backend-compliance-API-前端对接手册.md](./backend-compliance-API-前端对接手册.md) | 合规主手册（§2.1 已更新为新字段；部分章节仍有旧 `qb_code` 表述，以本文为准） |
| [backend-novelty-search-API-后端对接手册.md](./backend-novelty-search-API-后端对接手册.md) | 查新（已改为 `subject_code`） |
| [backend-warnings-API-前端对接手册.md](./backend-warnings-API-前端对接手册.md) | 预警（部分已更新） |
| `GET /api/v1/docs` | 在线 OpenAPI |
| `backend/apps/compliance/schemas/api_schemas.py` | 合规 Schema 源码 |
| `backend/apps/novelty/schemas/api_schemas.py` | 查新 Schema 源码 |

---

## 12. 常见问题 FAQ

**Q：解析结果里还有 `qb_code`，和任务的 `subject_code` 以哪个为准？**  
A：Step1 确认前展示用 `parse_result_json`；确认后以 **`task.subject_code`** 为准。提交 Step1 时把解析里的 `qb_code`/`qb_id` 填入 **`subject_code`**。

**Q：`enterprise_name` 删了吗？**  
A：任务对象上已拆分为 **`subject_name`（标准名）** 与 **`company_name`（公司名）**。预警列表原 `enterprise_name` 改为 **`subject_name`**（多数场景为公司名或解析公司名，与旧行为接近）。

**Q：预警 URL 还带 `forward-by-qb` 要改吗？**  
A：**路径可不改**；Query 建议改为 `subject_code`，响应读新字段。

**Q：需要改数据库或环境变量吗？**  
A：前端**不需要**；确保请求打到已切 STSC 的后端实例即可。

**Q：国标指标行里的 `std_code` 要改成 `subject_code` 吗？**  
A：**不要**。国标侧 API 与指标编排仍用 **`std_code`**；`subject_code` 仅指企标主体。

---

如有接口 422/字段缺失，请附带 **请求 URL、Body、响应 JSON** 与后端同事核对；也可直接对照 OpenAPI Schema。
