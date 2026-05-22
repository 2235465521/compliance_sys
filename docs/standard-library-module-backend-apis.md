# 标准库管理模块与后端接口对照

本文档依据 **`frontend/src/services/standard-library.ts`** 及 **`frontend/src/pages/standard-library/**`** 逐页核对：每条接口给出方法、路径（相对 `request` 的 `baseURL`，默认 `VITE_API_BASE_URL` 或 `'/api'`）、封装函数与**实际调用位置**。

以下 **标准入库与查询（registry）** 相关已与后端 **`/api/v1/standards/`** 对齐（即相对 baseURL 为 `v1/standards/`）；谱系、行业分类等仍可为未带 `v1` 前缀的路径，以实现为准。

子模块与路由对应关系见 `frontend/src/pages/standard-library/Layout.tsx`（`/standard-library/registry`、`lineage`、`body`、`index-ingest`、`taxonomy`）。

---

## 1. 标准入库与查询（`/standard-library/registry`）

**文件：** `frontend/src/pages/standard-library/standards/index.tsx`

| 用途 | 方法 | 路径（相对 `/api`） | Query / Body | 封装函数 |
|------|------|----------------------|--------------|----------|
| 标准列表（DRF 分页） | GET | `v1/standards/` | `page`、`page_size`（当 `pageSize>0` 时）、`search`、`ex_state` | `listStandards` |
| 标准详情（抽屉） | GET | `v1/standards/detail-info/` | `bz_id` | `fetchDetailInfo` |
| 库内统计（状态分布等） | GET | `v1/standards/statistics/` | — | `fetchStatistics`；响应需 `code === 200` 包在 `ApiEnvelope` |
| 元数据批量入库 | POST | `v1/standards/metadata-batch-import/` | `multipart/form-data`，字段 **`files`**（多文件） | `importStandardMetadataBatch` |
| 导出 | GET | `v1/standards/export/` | — | `exportStandardsMetadata`（Blob；JSON 占位则提示文案） |
| 模块说明 | GET | `v1/standards/module` | — | `fetchStandardsModule` |

**工作台/合规等复用：** `dashboard.fetchStandardList` / `fetchStatistics`，`novelty-search.queryStandardsByEnterpriseBzId`，`compliance` 合规任务列表与统计已同步使用 **`v1/standards/`** 列表与 **`v1/standards/statistics/`**。

---

## 2. 标准谱系（`/standard-library/lineage`）

**统一说明：** 谱系相关接口均在 **`/api/`** 下（**不是** `/api/v1/`）。Query **`bz_id`** 可与标准列表/详情一致：库内数字 **`id`** 或标准号 **`std_code`（国标号）**。

**文件：** `frontend/src/pages/standard-library/lineage/index.tsx`

| 用途 | 方法 | 路径 | Query / Body | 封装函数 |
|------|------|------|----------------|----------|
| 谱系图数据（节点+边） | GET | `get_tree_data/` | `bz_id` | **`fetchTreeData`**（成功 **`{ code:200, data:{ nodes, links } }`**，失败 **`{ code, msg }`**）。坐标优先 **`layout_pos`** 或节点顶层 **`x`/`y`**（`fixed` 预设）；否则 **`rank`/`col`→像素。图包 bbox **水平居中、垂直锚点≈上部 36%**。节点显示 **`label` 优先否则 `name`**。边 **`relation_type`** 仅在 **mouseover tooltip** |
| 是否最新 + 谱系链摘要 | GET | `standards/check-latest/` | `bz_id` | `checkLatest`；**成功**：顶层 **`query_bz_id`、`is_latest`、`current_latest_id`、`pedigree_chain`（字符串数组）**；失败 **`{ code, msg }`** |
| 单条关系增删改 | POST | `standards/pedigree/relation-mutation/` | JSON：`op`（`create` \| `update` \| `delete`）、`source`、`target`；**create/update 必须** `relation_type`；delete 可按 source+target 删边不传 `relation_type` | `mutatePedigreeRelation`；成功 **`{ code: 200 }`** |
| 批量新增关系 | POST | `standards/pedigree/relations/batch/` | JSON：`{ items: [{ source, target, relation_type }] }` | `submitPedigreeRelationsBatch`；成功至少 **`code: 200`**，及 **`created` / `skipped`**；可有 **`errors`** |

**查询按钮行为：** 对同一 `bz_id` 并发调用 `fetchTreeData` 与 `checkLatest`（`Promise.allSettled`），再更新图谱与「最新标准」信息。

**写操作后：** `refreshAfterWrite` 会再次拉取谱系数据（仍依赖上述 GET）。

---

## 3. 国标正文入库（`/standard-library/body`）

**文件：** `frontend/src/pages/standard-library/body/index.tsx`

| 状态 | 说明 |
|------|------|
| **当前无 HTTP 调用** | 页面仅为队列 UI + 文案提示 |

**约定但尚未接入前端的接口（见页面说明与 `standard-library.ts`）：**

| 方法 | 路径 | Body | 封装函数 |
|------|------|------|----------|
| POST | `workflow/standard-body-ingest/` | `multipart`：`files`（必填，可多文件）、可选 `bz_id` | `submitStandardBodyIngestWorkflow` |

---

## 4. 国标指标入库（`/standard-library/index-ingest`）

**文件：** `frontend/src/pages/standard-library/index-ingest/index.tsx`

| 状态 | 说明 |
|------|------|
| **当前无 HTTP 调用** | 表格为演示/模拟数据（`buildMockRowsForFiles` 等）；代码注释写明「联调后端后替换为真实接口」 |

合规模块中企标指标入库使用 **`POST standards/batch-indexes/`**（`frontend/src/services/compliance.ts` 的 `postInsertIndexes`），**不属于本标准库子页当前实现**；若国标指标入库与之一致，需在本页单独对接或复用该服务。

---

## 5. 行业分类体系（`/standard-library/taxonomy`）

**文件：** `frontend/src/pages/standard-library/taxonomy/index.tsx`

| 用途 | 方法 | 路径 | Query / Body | 封装函数 |
|------|------|------|----------------|----------|
| 导入分类对照表 | POST | `standards/industry-taxonomy/import/` | `multipart`：`file`、`scheme`（`ICS` \| `CCS`） | `importIndustryTaxonomySheet` |
| 按关键词查 ICS/CCS | GET | `standards/industry-taxonomy/query/` | `q`、`scheme`（可选） | `queryIndustryClassification` |

**说明：** 页面内 ICS/CCS 树大量为 **`MOCK_ICS_TREE` / `MOCK_CCS_TREE` 前端静态数据**；与后端查询/导入并存，联调时需分清哪些区块走接口。

---

## 6. `standard-library.ts` 全量接口清单与页面使用情况

以下路径均以 **`frontend/src/services/standard-library.ts`** 为准。

| 封装函数 | 方法 | 路径 | 标准库子页是否使用 |
|----------|------|------|---------------------|
| `listStandards` | GET | `v1/standards/` | 是（registry） |
| `fetchDetailInfo` | GET | `v1/standards/detail-info/` | 是（registry） |
| `basicSearch` | GET | `standards/basic-search/` | **否**（仓库内无其它文件 import） |
| `fetchStatistics` | GET | `v1/standards/statistics/` | 是（registry） |
| `exportStandardsMetadata` | GET | `v1/standards/export/` | 是（registry） |
| `fetchStandardsModule` | GET | `v1/standards/module` | 是（registry · 文案链） |
| `checkLatest` | GET | `standards/check-latest/` | 是（lineage） |
| `fetchTreeData` | GET | `get_tree_data/` | 是（lineage） |
| `fetchPrefaceDiff` | GET | `dify/preface-diff/` | **否** |
| `uploadPrefacePdf` | POST | `dify/preface-upload/` | **否** |
| `downloadStandardPdfBlobUrl` | GET | `standards/download-doc/` | **否** |
| `listIndexesPage` | GET | `indexes_table/` | **否** |
| `importStandardMetadataBatch` | POST | `v1/standards/metadata-batch-import/` | 是（registry） |
| `submitStandardBodyIngestWorkflow` | POST | `workflow/standard-body-ingest/` | **否**（仅 service 与 body 页文案约定） |
| `importIndustryTaxonomySheet` | POST | `standards/industry-taxonomy/import/` | 是（taxonomy） |
| `queryIndustryClassification` | GET | `standards/industry-taxonomy/query/` | 是（taxonomy） |
| `mutatePedigreeRelation` | POST | `standards/pedigree/relation-mutation/` | 是（lineage） |
| `submitPedigreeRelationsBatch` | POST | `standards/pedigree/relations/batch/` | 是（lineage） |

---

## 7. 与其它模块的路径重叠（便于联调）

- **`standards/basic-search/`**：标准库 service 提供 `basicSearch`，但标准库页面未用；**仪表盘**等若使用搜索，可能在 `compliance.ts` 的 `getStandardsBasicSearch`（路径相同）——请以实际 import 为准。
- **`standards/check-latest/`**、**`standards/statistics/`**、**`standards/download-doc/`**、**`get_tree_data/`**、**`dify/preface-diff/`**：合规模块 `compliance.ts` 中存在同名或等价路径的封装，与标准库 service **重复定义**；两处需与后端保持契约一致。

---

## 8. 文档生成说明

- 核对范围：`standard-library.ts`、`pages/standard-library/*`（含 `Layout.tsx`、`standards`、`lineage`、`body`、`index-ingest`、`taxonomy`）；`components/PedigreeGraph.tsx` 仅类型引用，无请求。
- 若后端实际前缀非 `/api` 或路径有变更，以部署环境 OpenAPI 为准，并同步修改 `standard-library.ts` 中的路径字符串。
