# 前端对接说明：规范性引用查新 / 批量评价（后端变更）

**文档用途**：供前端同事按本文档修改页面解析、TypeScript 类型、展示逻辑与文案。  
**适用仓库**：`regulation_and_evaluation_platform_backend_v1.0`（以当前分支实现为准）。  
**变更性质**：开发阶段接口契约调整，**与此前《frontend-migration-规范性引用查新接口调整说明》中部分字段名、语义不一致处，以本文档为准**。

---

## 1. 受影响的 HTTP 接口一览

| 模块 | 方法 | 路径 | 变更要点 |
|------|------|------|----------|
| 合规 | GET | `/api/v1/compliance/evaluations/{task_id}/step/3/reference-latest` | 根级字段 **`all_references_are_latest` 已删除**，改为 **`file_compliance_outcome`**；`references[]` **每条对象结构精简**（见第 3 节）。 |
| 批量 | GET | `/api/v1/batch-normative-reference/jobs/{job_id}` | 子项 **`items[]`** 上：**`all_references_are_latest` 已删除**，改为 **`file_compliance_outcome`**；**`items[].references_resolved[]`** 每条为精简结构。 |
| 批量 | GET | `/api/v1/batch-normative-reference/jobs/{job_id}/items/{item_id}` | 同上（单个子项对象）。 |
| 批量 | PATCH | `/api/v1/batch-normative-reference/jobs/{job_id}/items/{item_id}` | 请求体仍为 `{ "references_resolved": [...] }`；**响应体**与 GET 子项一致，服务端会对每条 **重算** `citation_matches_latest` 并 **重算** `file_compliance_outcome`。 |

**未改 URL、未改鉴权方式**；列表分页 `GET .../jobs` 仍**不含**子项明细字段（无 `references_resolved` / `file_compliance_outcome`）。

---

## 2. 根级响应：整文件结论 `file_compliance_outcome`

### 2.1 字段说明

- **字段名**：`file_compliance_outcome`  
- **类型**：`string`（合规 Step3）或 `string | null`（批量子项：`completed` 时有值，其它状态为 `null`）。  
- **取值**（四态，**英文小写枚举**，请前端写死常量比对，勿依赖中文）：

| 取值 | 含义（产品语义） |
|------|------------------|
| `no_references` | **无引用行**：`references` 或 `references_resolved` 为空数组。合规接口在 **`qb_code` 为空** 等无映射引用时，也会返回空 `references`，此时为该值。 |
| `non_compliant` | **规范性引用不合格（自动结论）**：存在 **至少一条** **`compliance_assessable === true`** 且 **`citation_matches_latest === false`** 的引用。 |
| `compliant` | **规范性引用合规（自动强结论）**：**每一条**引用均满足 **`compliance_assessable === true`** 且 **`citation_matches_latest === true`**。 |
| `undetermined` | **不确定（需人工）**：不满足上述「合规」且不满足「不合格」的其余情况。典型包括：任一条 **`compliance_assessable === false`**，或任一条 **`citation_matches_latest === null`**，或条数非空但无法全部达成「可比对且为 true」。 |

### 2.2 与旧字段 `all_references_are_latest` 的对应关系（便于迁移心智）

| 旧（已删除） | 新 |
|--------------|-----|
| `all_references_are_latest === true` 且曾用于「全部现行」 | **不能**简单映射为 `compliant`。新语义下 **`compliant` 要求更高**：必须 **每条均可自动比对** 且 **每条比对为 true**。以前「跳过非 GB / QB 行再汇总为 true」的逻辑 **已取消**。 |
| `all_references_are_latest === false` | 可能对应 `non_compliant`，也可能对应 `undetermined`，需结合 **`compliance_assessable`** 与 **`citation_matches_latest`** 判断。 |
| 无引用时旧批量可能为 `true` | 现为 **`no_references`**（合规空引用亦为 **`no_references`**）。 |

### 2.3 前端展示建议

- **标签色 / 文案**：建议为四态分别配置（例如：`no_references` 灰、`undetermined` 橙、`non_compliant` 红、`compliant` 绿），**勿**再用单一布尔「是否全部现行」驱动所有场景。  
- **「不确定」**：明确提示「系统无法对全部引用给出自动合规结论，需管理员审核」。  
- **「无引用」**：与「不确定」区分，避免用户误以为解析失败。

---

## 3. 每条引用：`references[]` / `references_resolved[]` 对象结构（精简后）

后端 **不再**在每条里返回大段 legacy 扁平字段（如 `query_bz_id`、`current_latest_id`、`current_latest_std_codes`、`latest_std_codes`、`pedigree_lookup_std_code`、`is_latest`、`pedigree_chain` 等与精简结构重复的键）。**请以本节为准对接类型定义。**

### 3.1 字段表（单条元素）

| 字段 | 类型 | 说明 |
|------|------|------|
| `referenced_std_code` | `string` | 本条规范性引用标准号（审核后 / 解析出的展示主键）。 |
| `resolution_path` | `string` | 内部分辨路径，用于调试与分支展示；取值示例：`pedigree_direct`、`historical_then_pedigree`、`unresolved_no_historical_row`、`pedigree_direct_miss`、`manual_review_non_gb`、`qb_enterprise_citation`、`missing_enterprise_qb_code`、`sqlite_stub`、`empty` 等。 |
| `compliance_assessable` | `boolean` | **是否参与「整文件自动合规」强结论的比对子集**。仅当后端在 **谱系表** 上拿到可用于比对的 **`latest_std_code`** 且具备时点完整号逻辑时为 `true`。为 `false` 时，本条 **不参与** `compliant` / `non_compliant` 的自动结论（整文件倾向 **`undetermined`**，除非已被其它条判为 `non_compliant`）。 |
| `citation_matches_latest` | `boolean \| null` | **`null`**：本条 **不可自动比对**（`compliance_assessable === false`），前端应 **勿**按 true/false 展示「是否现行」。**`true`/`false`**：仅在可比对时存在，表示「**时点完整标准号** `full_std_at_publication` 与 **谱系给出的主现行号** `latest_std_primary` 规范化后是否完全一致」。 |
| `full_std_at_publication` | `string \| null` | 企标发布时点下的完整国标号；无年号且无法在谱系前缀族中补全时为 `null`。 |
| `latest_std_primary` | `string` | 谱系侧主展示现行号；无法给出时为 **空字符串** `""`（**不会**再用引用原文冒充现行）。 |
| `explanation` | `string` | 人类可读说明（原 `pedigree_chain` 语义合并至此），可展示在详情/气泡中。 |

### 3.2 前端对 `citation_matches_latest` 的解析约定（重要）

1. **先读** `compliance_assessable`：  
   - 若为 `false`，**忽略** `citation_matches_latest` 的 true/false 语义（应为 `null`），UI 建议展示「未自动评价」/「另册」类文案，**不要**显示绿色「现行」或红色「非现行」。  
2. 若 `compliance_assessable === true`：  
   - `citation_matches_latest === true` → 可展示「引用时点号与谱系现行号一致」。  
   - `citation_matches_latest === false` → 可展示「引用时点号与谱系现行号不一致」（自动不合格的一条证据）。  

TypeScript 建议将三者写为联合类型，避免把 `null` 当 `false`：

```ts
type CitationMatchesLatest = true | false | null;
```

### 3.3 已删除或不再返回的字段（前端应移除依赖）

若旧代码仍访问下列键，需删除或改为使用上表：

- `all_references_are_latest`（根级）  
- `query_bz_id`（与 `referenced_std_code` 重复场景）  
- `is_latest`（不再与 `citation_matches_latest` 同步返回；**不要再绑定旧「解析是否成功」语义**）  
- `latest_std_codes`、`current_latest_std_codes`（列表形式已去掉）  
- `current_latest_id`（请用 `latest_std_primary`）  
- `historical_full_std_code`（请用 `full_std_at_publication`）  
- `pedigree_chain`（请用 `explanation`）  
- `pedigree_lookup_std_code`、`pedigree_anchor_std_code`、`latest_std_code_raw`、`enterprise_as_of_year`、`inferred_historical_std_code` 等 **默认不再出现在精简行中**（除非你们 PATCH 手工塞回扩展字段——不推荐，易与 GET 不一致）。

---

## 4. 后端业务逻辑变更摘要（便于前端配文案 / 预期）

以下内容影响 **`resolution_path`** 与 **`explanation`** 的文案，**不改变**前端字段名，但可帮助解释「为什么会出现 `undetermined`」。

1. **无年号国标补全**：改为仅在 **`standard_pedigree`** 上做 **`std_code` 精确或前缀族 + 时点年筛选**，**不再**使用 **`national_standard_basic`** 推断年代号或「仅主表命中」作为现行结论。  
2. **合规自动结论**：**仅认谱系表给出的现行信息**；无谱系命中或谱系无有效 `latest_std_code` 时，**现行侧为空**，且 **`compliance_assessable` 为 `false`**。  
3. **整文件 `compliant`**：要求 **每一条**引用 **`compliance_assessable === true`** 且 **`citation_matches_latest === true`**。因此混有 **非 GB**、**QB 企标互引**、**缺 Q/ 企标号**、**谱系未命中** 等任一情况时，整文件结论一般为 **`undetermined`**，而不是「部分合规」。

---

## 5. PATCH 批量子项时的注意点

- 请求体：`{ "references_resolved": [ { ... }, ... ] }`。  
- 建议每条至少包含：`referenced_std_code`、`resolution_path`、`compliance_assessable`、`full_std_at_publication`、`latest_std_primary`（及可选 `explanation`）；**不要**依赖服务端从旧大对象推断。  
- 服务端保存前会对每条调用 **`enrich_normative_reference_row`**：  
  - 若 **`compliance_assessable`** 为 `false` 或未传（缺省按 `false` 处理），会把 **`citation_matches_latest`** 置为 **`null`**。  
  - 若为 `true`，会按 `full_std_at_publication` 与 `latest_std_primary` **重算** `citation_matches_latest`。  
- 响应中的 **`file_compliance_outcome`** 为基于**保存后**列表的**重算结果**，请以 **响应体** 刷新本地 state。

---

## 6. 合规 `reference-latest` 与批量子项对齐关系

两处 **单条引用** 的 JSON 形状 **一致**（均为第 3 节精简结构），便于共用组件：

- 合规：`data.references[i]`  
- 批量：`data.items[j].references_resolved[i]`  

根级字段名：

- 合规：`data.file_compliance_outcome` + `data.references`  
- 批量：`items[j].file_compliance_outcome` + `items[j].references_resolved`  

---

## 7. 前端改造 Checklist（建议按顺序执行）

- [ ] 全局搜索并替换 **`all_references_are_latest`**（合规根、批量子项）。  
- [ ] 接入 **`file_compliance_outcome`** 四态枚举及 UI。  
- [ ] 将 **`citation_matches_latest`** 类型改为 **`boolean | null`**，并分支处理 **`null`**。  
- [ ] 列表/详情列：「现行号」列绑定 **`latest_std_primary`**，**勿**再绑定 `current_latest_id`。  
- [ ] 「时点完整号」绑定 **`full_std_at_publication`**。  
- [ ] 说明文案绑定 **`explanation`**。  
- [ ] 删除对已下线字段的解构与表格列（见 3.3）。  
- [ ] PATCH 成功后用 **响应体** 覆盖 `references_resolved` 与 `file_compliance_outcome`。  
- [ ] OpenAPI / 若从 Ninja 生成类型：重新生成或手改 `BatchNormativeRefItemOut` 等模型。  
- [ ] E2E / 单测 mock 数据更新为精简结构。

---

## 8. 参考代码位置（后端，便于联调时对照）

| 说明 | 路径 |
|------|------|
| 整文件四态计算 | `backend/apps/standards/services/reference_bundle.py` → `compute_normative_reference_file_outcome` |
| 单条精简输出 | 同上 → `normative_reference_row_out`、`enrich_normative_reference_row` |
| 解析与 `compliance_assessable` | `backend/apps/standards/services/reference_resolution.py` → `resolve_reference_for_parse_context` |
| 合规 bundle 组装 | `backend/apps/compliance/services/evaluation_flow.py` → `get_reference_latest_bundle` |
| 批量序列化 | `backend/apps/batch_normative_reference/services/job_service.py` → `item_to_out` |
| Ninja Schema | `backend/apps/batch_normative_reference/schemas.py` → `BatchNormativeRefItemOut` |

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-11 | 初版：`file_compliance_outcome` 四态、引用行精简结构、`citation_matches_latest` 三态、PATCH 行为及前端 Checklist。 |

---

如有联调抓包示例需求，可在 MySQL 环境跑一笔批量任务后把 `GET .../jobs/{id}` 响应 JSON 脱敏附在 Wiki；字段名以本文档与 `/api/v1/docs` 实际 Schema 为准。
