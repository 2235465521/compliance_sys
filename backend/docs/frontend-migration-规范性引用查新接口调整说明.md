# 前端迁移说明：规范性引用「是否现行」与查新响应结构调整

本文档供 **前端** 对照修改接口调用与数据解析逻辑。涉及 **合规模块** 与 **批量规范性引用** 两类接口；**未列出的接口路径可视为无破坏性变更**（仍建议联调时扫一眼响应 JSON）。

**变更日期（后端）**：2026-05-08 起生效（以当前仓库实现为准）。

---

## 1. 变更总览（给排期用）

| 类型 | 说明 |
|------|------|
| **破坏性** | `GET .../compliance/.../step/3/reference-latest` 的 **HTTP 200 根类型** 由 **JSON 数组** 改为 **JSON 对象**（含 `references` 与 `all_references_are_latest`）。凡把响应当 `Array.isArray(data)` 或按「根即数组」解析的代码 **必须修改**。 |
| **兼容性** | 批量模块路径 **未改 URL**；`GET /jobs/{job_id}`、`GET .../items/{item_id}`、`PATCH .../items/{item_id}` 仍为原路径，但在 **`items[]` 单条** 上 **新增字段**，且 **`references_resolved[]` 每条对象** 上 **新增/重定义字段**（见下文）。 |
| **语义** | 原 `is_latest` 多被理解为「解析是否成功」；现与新增字段 **`citation_matches_latest` 同值**，表示 **「补全后的标准号 `full_std_at_publication` 是否与主展示现行号 `latest_std_primary`（即 `current_latest_id`）规范化后一致」**；**两侧均有有效号**才为 `true`；**不参与** `latest_std_codes` 列表比对。 |

**详细契约仍以主手册为准**：

- [backend-compliance-API-前端对接手册.md](./backend-compliance-API-前端对接手册.md) **§4.10**
- [backend-batch-normative-reference-API-前端对接手册.md](./backend-batch-normative-reference-API-前端对接手册.md) **§5、§6.4**

---

## 2. 受影响的接口清单（前端需改动的范围）

### 2.1 合规模块（破坏性：根结构）

| 方法 | 路径 | 变更说明 |
|------|------|----------|
| **GET** | `/api/v1/compliance/evaluations/{task_id}/step/3/reference-latest` | **根节点**：由 **数组** 改为 **对象** ` { references, all_references_are_latest } `。原「数组元素」现为 **`data.references[i]`**。 |

**不受本次根结构变更直接影响**（一般无需为「根类型」改代码，但列表/详情里若自行拼装了查新结果除外）：

- `GET /api/v1/compliance/module`
- `POST/GET /api/v1/compliance/evaluations`、任务详情、上传、各 step 的 GET/confirm（**除** 上表 `reference-latest`）
- `GET .../step/3/reference-latest` **以外的** 所有合规路由

### 2.2 批量规范性引用模块（非破坏性 URL，响应字段扩展）

| 方法 | 路径 | 变更说明 |
|------|------|----------|
| **GET** | `/api/v1/batch-normative-reference/jobs/{job_id}` | 响应中 **`items[]` 每个元素** 增加 **`all_references_are_latest`**（`boolean \| null`）；**`items[].references_resolved[]`** 每条增加 **`citation_matches_latest`**，**`is_latest` 语义与之一致**。 |
| **GET** | `/api/v1/batch-normative-reference/jobs/{job_id}/items/{item_id}` | 与上表「单个子项」字段一致（同 `BatchNormativeRefItemOut`）。 |
| **PATCH** | `/api/v1/batch-normative-reference/jobs/{job_id}/items/{item_id}` | 请求体仍为 `{ "references_resolved": [...] }`；**响应体** 与 GET 子项一致，含 **`all_references_are_latest`** 及对每条 **`references_resolved`** 的 **服务端重算** 后的 `citation_matches_latest` / `is_latest`。 |

**通常无需改动调用方式**（仅解析/展示要跟上字段）：

- `GET /api/v1/batch-normative-reference/jobs`（分页列表，摘要无子项明细，**无** `references_resolved` / `all_references_are_latest`）
- `POST /api/v1/batch-normative-reference/jobs`
- `GET /api/v1/batch-normative-reference/module`

---

## 3. 合规 `reference-latest`：旧 vs 新

### 3.1 解析方式（必改）

| 项目 | 旧 | 新 |
|------|----|----|
| 根类型 | `Array` | `Object` |
| 引用列表 | `response` 本身 | **`response.references`** |
| 整任务是否全部现行 | 无（需前端自行遍历） | **`response.all_references_are_latest`**（`boolean`） |

### 3.2 示例

**旧（不要再假设根是数组）**：

```json
[
  {
    "referenced_std_code": "GB/T 191",
    "full_std_at_publication": "GB/T 191-2008",
    "latest_std_primary": "GB/T 191-2020",
    "is_latest": true
  }
]
```

**新**：

```json
{
  "references": [
    {
      "referenced_std_code": "GB/T 191",
      "full_std_at_publication": "GB/T 191-2008",
      "latest_std_primary": "GB/T 191-2020",
      "latest_std_codes": ["GB/T 191-2020"],
      "citation_matches_latest": false,
      "is_latest": false
    }
  ],
  "all_references_are_latest": false
}
```

**空映射 / 无 `qb_code` 等仍 200 时**：

```json
{
  "references": [],
  "all_references_are_latest": true
}
```

### 3.3 前端修改要点（ checklist ）

- [ ] 所有调用 **`GET .../step/3/reference-latest`** 的封装：返回值改为 **对象**，取 **`references`** 作为列表数据源。
- [ ] TypeScript 类型：根类型由 **`SomeRow[]`** 改为 **`{ references: SomeRow[]; all_references_are_latest: boolean }`**（或与后端 OpenAPI 生成类型对齐）。
- [ ] 若使用 **`response.json()` 后直接 `.map`**：改为 **`data.references?.map`**（并处理 `data` 非数组的兼容分支）。
- [ ] 产品若需「整份企标映射引用是否全部现行」：优先使用 **`all_references_are_latest`**，避免与本地遍历逻辑不一致。

---

## 4. 批量模块：`references_resolved` 与 `all_references_are_latest`

### 4.1 子项对象（`items[]` 元素或单 item GET/PATCH 响应）

**新增根级字段（子项上）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `all_references_are_latest` | `boolean \| null` | 仅 **`status === "completed"`** 时有 **`boolean`**：对 **`resolution_path` 非 `qb_enterprise_citation` 且非 `manual_review_non_gb` 且非 `missing_enterprise_qb_code`** 的行，每条 **`citation_matches_latest`** 均为 `true` 时为 `true`；**QB 轻工行业标准行、非 GB 待审核行、无完整 `Q/…` 企标号行不参与**汇总。**空数组** 视为 `true`。`pending` / `failed` 等为 **`null`**。 |

### 4.2 `references_resolved[]` 每条对象

| 字段 | 说明 |
|------|------|
| **`citation_matches_latest`** | **新增**。与合规 `references[]` 中单条语义一致。 |
| **`is_latest`** | **语义变更**：与 **`citation_matches_latest` 同值**（不再表示「仅解析成功」）。 |

其余字段（如 `referenced_std_code`、`full_std_at_publication`、`latest_std_codes`、`latest_std_primary`、`resolution_path` 等）**键名未改**，但 **`is_latest` 的布尔含义**已变，**凡依赖旧语义的 UI/规则需按新语义调整**。

### 4.3 前端修改要点（ checklist ）

- [ ] **`GET /jobs/{job_id}`**：解析 **`items[].all_references_are_latest`**（注意可能为 `null`）。
- [ ] **`GET .../items/{item_id}`**、**`PATCH .../items/{item_id}`** 响应：同上。
- [ ] 渲染 **`references_resolved[]`** 时：展示「是否现行」请使用 **`citation_matches_latest`** 或 **`is_latest`**（二者一致）；若需与合规 Step3 一致，建议统一读 **`citation_matches_latest`** 减少歧义。
- [ ] **PATCH 请求体**：仍可只提交业务字段；**响应**里服务端会对每条 **重算** `citation_matches_latest` / `is_latest`，应以 **响应体** 为准刷新本地 state。

---

## 4.4 轻工行业标准：以 `QB` 开头的标准号（2026-05-08 起；2026-05-23 更正说明：QB 为轻工行业标准，非企业标准）

- **识别**：引用号（`referenced_std_code` / `query_bz_id`）**去掉首尾空白** 后，**大小写不敏感** 以 **`QB`** 开头（例如 `QB/T xxx`、`qb-xxx`）。
- **语义说明**：**`QB` 表示轻工行业标准**，与企标 **`Q/…`** 不同；路径名 **`qb_enterprise_citation`** 为历史 API 标识，保留不改。
- **后端行为**：**不**做国标 **`full_std_at_publication` 补全**、**不**查 **`standard_pedigree` / `national_standard_basic`**；**`latest_std_*` / `current_latest_*` 为空**；`resolution_path` 固定为 **`qb_enterprise_citation`**；`explanation` / `pedigree_chain` 为固定中文说明（需管理员编辑核对）。
- **单条标志**：**`citation_matches_latest` / `is_latest` 为 `false` 或 `null`**（表示未走国标「现行一致」自动结论，**不等于**国标解析失败）。
- **整份汇总**：根级 **`all_references_are_latest`**（合规）与子项 **`all_references_are_latest`**（批量）在计算时 **忽略** `resolution_path === "qb_enterprise_citation"` **与** `manual_review_non_gb` **与** `missing_enterprise_qb_code` 的行，避免 QB 轻工行业标准、非 GB 引用或无企标上下文把「全部国标现行」打成 false。
- **前端建议**：若 `resolution_path === "qb_enterprise_citation"`，单独展示「轻工行业标准（QB）/ 未做国标自动查新 / 待管理员处理」，**勿**与国标「非现行」混用同一套红色样式（除非产品明确要求）。

### 4.5 非 GB 前缀引用（`manual_review_non_gb`）

- **识别**：引用号 **去掉首尾空白** 后，**大小写不敏感** **不以 `GB` 开头**，且**不是**第 4.4 节的 **`QB`** 轻工行业标准。
- **后端行为**：**不**自动补全年代号、**不**查 **`standard_pedigree` / `national_standard_basic`**；**`latest_std_*` / `current_latest_*` 为空**；`resolution_path` 为 **`manual_review_non_gb`**；`pedigree_chain` 说明由审核员在映射等环节处理。
- **单条标志**：**`citation_matches_latest` / `is_latest` 为 `false`**（与 QB 类似，表示未走国标自动现行结论）。
- **整份汇总**：与第 4.4 节相同，**`manual_review_non_gb`** 行被 **忽略**，不计入 **`all_references_are_latest`**。
- **前端建议**：单独展示「非 GB 引用 / 待审核员补全或手工查新」，勿与国标「非现行」混用同一套样式（除非产品明确要求）。

### 4.6 无完整企标号（`missing_enterprise_qb_code`，2026-05-06 起）

- **识别**：对 **GB 类**引用，任务或解析扁平结果中未提供 **`Q/` 开头**的企业标准号（`qb_code`、`qb_id` 或解析中的企标号同义键；全角 `／` 按 `/` 归一后判断）。仅有内部流水号、备案文号等**不以 `Q/` 开头**的占位串，视为**无完整企标号**。
- **后端行为**：**不**执行无年代号国标推断与谱系查新；**`latest_std_*` / `current_latest_*` 为空**；**不把**企标正文中的引用标准号当作现行最新号；`resolution_path` 固定为 **`missing_enterprise_qb_code`**；`pedigree_chain` 为固定中文说明。
- **单条标志**：**`citation_matches_latest` / `is_latest` 为 `false`**。
- **整份汇总**：与第 4.4、4.5 节同类路径，**`missing_enterprise_qb_code`** 行被 **忽略**，不计入 **`all_references_are_latest`**。
- **前端建议**：提示补全 **`Q/…` 企标号**或检查 Dify 解析字段映射。

---

## 5. 与「不合格」类业务文案的对应关系（供产品/前端对齐）

- **单条引用**：`citation_matches_latest === false`（或 `is_latest === false`）且 **`resolution_path` 不是 `qb_enterprise_citation` 且不是 `manual_review_non_gb` 且不是 `missing_enterprise_qb_code`** 时，多表示 **「补全后的标准号」与现行查新结果不一致**（例如仍引用旧年号版本）。若为 **`qb_enterprise_citation`**，表示 **QB 轻工行业标准、未做国标自动比对**，请见 **第 4.4 节**。若为 **`manual_review_non_gb`**，表示 **非 GB 前缀、系统未自动查新**，请见 **第 4.5 节**。若为 **`missing_enterprise_qb_code`**，表示 **缺少 `Q/…` 企标上下文**，请见 **第 4.6 节**。
- **合规任务维度**：`GET reference-latest` 的 **`all_references_are_latest === false`** 表示 **至少一条**引用非现行，可用于「映射引用未全部满足现行」类提示。
- **批量单文件维度**：**`items[].all_references_are_latest === false`** 表示该上传文件解析出的引用 **未全部现行**。

（「无引用」时后端当前约定：**`references` 为空数组** 或 **`references_resolved` 为空数组** 时 **`all_references_are_latest` 为 `true`**；若产品要求「无引用算不合格」需另开需求，不在本文档范围内。）

---

## 6. 建议交给前端的交付物

1. 本文档（**接口差异 + checklist**）。
2. 主手册 **§4.10**、批量手册 **§5 / §6.4**（字段级说明与修订记录）。
3. 联调环境打开 **`/api/v1/docs`**（Django Ninja），对照 **`reference-latest`** 与 **`batch-normative-reference`** 下各接口的 **实际响应示例**。

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-06 | **`citation_matches_latest`**：仅 **`full_std_at_publication`** 与 **`latest_std_primary`** 比对；不再用 **`latest_std_codes`**。 |
| 2026-05-06 | **仅 GB 开头**走自动查新；**`manual_review_non_gb`** 与 **`all_references_are_latest`** 汇总排除说明见 **§4.5**。 |
| 2026-05-06 | **`missing_enterprise_qb_code`**：无 **`Q/…`** 企标号时 GB 引用现行侧为空；**`all_references_are_latest`** 汇总排除；见 **第 4.6 节**。 |
| 2026-05-08 | 增加 **第 4.4 节**：**轻工行业标准 `QB`** 前缀引用（`qb_enterprise_citation`）及 **`all_references_are_latest`** 汇总排除规则。 |
| 2026-05-23 | **第 4.4 节更正**：QB 为**轻工行业标准**，非企标；`qb_enterprise_citation` 路径名为历史标识。 |
| 2026-05-08 | 初版：汇总受影响接口、合规根结构破坏性变更、批量字段扩展与前端 checklist。 |
