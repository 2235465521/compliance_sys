# 标准库模块：真实后端数据与 Mock 说明

本文描述当前前端实现中 **标准库管理**（`/standard-library` 及其子路由）各区块的数据来源：哪些请求 **真实后端 API**，哪些为 **前端预留路径、占位或未对接**。便于联调、验收与后续迭代对照。

**相关代码**：服务封装 [frontend/src/services/standard-library.ts](../../frontend/src/services/standard-library.ts)；各页 [frontend/src/pages/standard-library/](../../frontend/src/pages/standard-library/)。接口契约以仓库根目录《[后端接口说明文档.md](../../后端接口说明文档.md)》为准。

---

## 1. 总览

| 子页面路径 | 主要真实接口 | 预留 / 占位 |
|------------|----------------|-------------|
| `/standard-library`（index） | 无（重定向） | 重定向至 `/standard-library/registry` |
| `/standard-library/registry`（标准入库与查询） | `GET /api/standards/`、`detail-info`、`basic-search`、`statistics/` | `POST /api/standards/metadata-batch-import/`（批量元数据入库，待后端）；工具栏「新建/单文件导入」未对接 |
| `/standard-library/lineage` | `check-latest`、`get_tree_data` | 谱系写库：`relation-mutation`、`relations/batch`（待后端）；失败时提示联调 |
| `/standard-library/body`（国标正文入库） | `basic-search`、`preface-diff`、`preface-upload`、`download-doc`、`indexes_table` | `POST /api/workflow/standard-body-ingest/`（正文工作流，待后端）；Tab「目录与条款（暂未实现）」 |
| `/standard-library/taxonomy`（行业分类体系） | `GET .../industry-taxonomy/query/`（可选） | 左侧 ICS/CCS 切换、演示树与统计为前端；`import`/`query` 预留；失败时提示待联调 |

**说明**：本地开发默认通过 Vite 将 `/api` 代理到后端（见 [frontend/vite.config.ts](../../frontend/vite.config.ts)）；若后端未启动或返回错误，界面会表现为空表、告警或失败提示，**不属于 Mock 数据**。

---

## 2. 真实后端数据（按 HTTP 路径）

下列均由 [standard-library.ts](../../frontend/src/services/standard-library.ts) 发起请求，成功时展示内容为 **后端返回数据**（字段以后端序列化为准）。

| HTTP 路径 | 方法 | 使用位置 | 用途简述 |
|-----------|------|----------|----------|
| `/api/standards/statistics/` | GET | 标准入库与查询页（进入时自动加载；可点「刷新统计」） | 标准类型、执行状态等计数；页内以 ECharts 饼图展示 |
| `/api/standards/` | GET | 标准入库与查询 · 分页目录 ProTable | DRF 分页；Query：`page`、`search`、`ex_state` |
| `/api/standards/detail-info/` | GET | 同上 · 行内「详情」抽屉 | Query：`bz_id` |
| `/api/standards/basic-search/` | GET | 标准入库与查询 · 关键字速查；国标正文入库 · 检索候选 | Query：`q` |
| `/api/standards/check-latest/` | GET | 标准谱系页 | Query：`bz_id` |
| `/api/get_tree_data/` | GET | 标准谱系页 | Query：`bz_id`；`nodes` / `links` |
| `/api/dify/preface-diff/` | GET | 国标正文入库 · 折叠区「前言解析」 | Query：`bz_id` |
| `/api/dify/preface-upload/` | POST | 同上 | `multipart`：`bz_id`、`file` |
| `/api/standards/download-doc/` | GET | 同上 · 下载全文 PDF | Query：`bz_id`；PDF 二进制 |
| `/api/indexes_table/` | GET | 国标正文入库 Tab「技术指标（示例）」 | 分页只读演示 |

**前端预留、文档未最终锁定的路径**（需后端对齐后再改 `standard-library.ts` 中的 URL 或契约）：

| HTTP 路径 | 方法 | 用途简述 |
|-----------|------|----------|
| `/api/standards/metadata-batch-import/` | POST | 标准元数据批量入库（multipart `files`） |
| `/api/workflow/standard-body-ingest/` | POST | 国标正文拆解工作流（multipart `files`，可选 `bz_id`） |
| `/api/standards/industry-taxonomy/import/` | POST | 行业分类表导入（`file`、`scheme`=ICS\|CCS） |
| `/api/standards/industry-taxonomy/query/` | GET | 按行业关键词查 ICS/CCS |
| `/api/standards/pedigree/relation-mutation/` | POST | 标准谱系页：单条关系 create/update/delete（JSON） |
| `/api/standards/pedigree/relations/batch/` | POST | 标准谱系页：批量提交关系列表（JSON `items`） |

**未在本模块调用的后端能力**（若产品需要可再接入，当前代码未请求）：

- `GET /api/statistics/`（与 `standards/statistics/` 不同）
- `GET /api/relations/`、`GET /api/replaces_table/` 等
- `POST/PUT/PATCH/DELETE /api/standards/` 等写操作（除上述预留 POST）

---

## 3. Mock、占位与纯前端数据

### 3.1 标准谱系（`/standard-library/lineage`）

- **读能力**：一次「查询谱系」并行请求 `get_tree_data` 与 `check-latest`；节点表、关系表、谱系图均来自族谱接口。
- **写能力（预留）**：单条 `relation-mutation`、批量 `relations/batch`；后端未实现时常见 **404**，错误文案提示联调。成功写库后页面会再次执行查询以刷新图与表。

### 3.2 标准入库与查询（`/standard-library/registry`）

- **「导出（暂未实现）」**：无导出文件、无后端任务，仅提示。
- **「逐条录入 / 新建 / 单文件导入（暂未实现）」**：未绑定表单或上传。
- **批量元数据入库**：调用预留 `metadata-batch-import/`；后端未实现时常见 **404**，页面提示联调。

### 3.3 国标正文入库（`/standard-library/body`）

- **正文工作流提交**：调用预留 `workflow/standard-body-ingest/`；未实现时 **404** 等由页面提示。
- **Tab「目录与条款（暂未实现）」**：固定说明，不请求后端。
- **Tab「技术指标（示例）」**：数据来自真实 `indexes_table`，演示子集。

### 3.4 行业分类体系（`/standard-library/taxonomy`）

- **界面**：左栏 ICS/CCS 切换、精确检索、筛选（一级类目 / 含子类目 / 仅看现行）、数据量卡片；右栏树形表格（演示数据）；顶栏下载模板与上传弹窗。
- **上传 / 查询**：仍走预留 `import` / `query`；右侧树在联调前为本地示例结构；检索若返回数据则额外展示接口结果表便于对照。

---

## 4. 谱系图（ECharts）数据来源

组件 [PedigreeGraph.tsx](../../frontend/src/pages/standard-library/components/PedigreeGraph.tsx) 仅消费父组件传入的 `nodes` 与 `links`，二者来自 **`GET /api/get_tree_data/`** 的解析结果，**无前端伪造边或节点**。布局为 **树状分层**（当前标准在**最下**；`layout: 'none'` 固定坐标）。

若后端仅返回单节点且无 `links`，图上表现为孤立点，属数据形态而非 Mock。

---

## 5. 维护建议

- 新增真实接口时：优先在 `services/standard-library.ts` 扩展，并在本文 **§2** 增补一行。
- 将预留接口改为稳定契约时：同步更新本文 **§1 / §2**，并删除页面上「待联调」类提示文案（若不再需要）。

---

## 6. 查新模块（后端契约）

查新服务与标准库消费同一批标准库 HTTP 能力，但另有**独立任务生命周期**与专用表、比对编排、报告 PDF 等契约；**哪些接口现成可用、哪些需补充**的逐项说明（含缺失接口用途与建议契约）见同目录：

- [查新模块-后端可用接口与待补充说明.md](./查新模块-后端可用接口与待补充说明.md)

---

## 参考文档

- [01-standard-library.md](./01-standard-library.md)（界面与路由规划，部分路径可能仍待同步）
- [查新模块-后端可用接口与待补充说明.md](./查新模块-后端可用接口与待补充说明.md)
- [后端未实现的接口信息汇总.md](./后端未实现的接口信息汇总.md)
- [后端接口说明文档.md](../../后端接口说明文档.md)
