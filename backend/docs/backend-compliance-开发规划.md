# 合规性评价模块：整体开发规划

本文档为合规模块**执行层开发规划**（阶段划分、验收项、风险与测试）。流程与接口语义以 [《合规性评价：流程与接口约定》](./backend-compliance-流程与接口约定.md) 为准；F1～F12 简表见 [《合规性评价：分阶段实现方案》](./backend-compliance-分阶段实现方案.md)（**详细阶段以本文件为准**）。

---

## 1. 文档目的与依据

- **目标**：后端实现与《流程与接口约定》一致：**六步向导、五审闸门、Dify ① 必跑 / ② 按需 / ③ 审 4 后跑**、引用侧 **n→n+m**、步骤 4 **国标指标表优先**、**`std_file_path` 缺失则阻断并 `missing_gb_files` + 用户补传国标**、各阶段**证书/报告**与步骤 6 **汇总与制品下载**。
- **关联评审**：[《DDL/ORM 对齐职责》](./backend-DDL-ORM-对齐职责.md)；[《后端模块开发分工清单》](./backend-模块开发分工清单.md)。

---

## 2. 交付完整性清单（验收时逐项打勾）

以下与 F1～F12 对齐并展开为可测子项。

**F1 评价任务与状态机**

- 任务实体：`current_step` ∈ 1～6；禁止跳步、禁止未满足闸门时 `confirm`。
- 非法事件返回 **409/422**；合法转移表有单元测试覆盖。
- 任务状态：`active` / `failed` / `archived`；失败恢复策略在 README 写明。

**F2 五审持久化与断点恢复**

- 每次审核 1～5 的 `confirm` 后写库 + 可选 `compliance_evaluation_snapshot`。
- 刷新后可从 `current_step` + 快照恢复展示。

**F3 Dify ① / 按需 ② / ③**

- ①：步骤 1 上传后必触发（真连前 Mock）。
- ②：仅对 n+m 中无「已有可用指标」的 `std_code`，且 `std_file_path` 可用；否则不调 ②。
- ③：仅在审核 4 通过后触发。

**F4 步骤 1**

- 上传企标 → 路径持久化 → `parse_result_json` 草稿（企标号、名称、企业名、指标、引用号）。
- 审核 1 → `enterprise_standard_basic` 关键字段。
- 描述性证书首期留白 + 字段预留。

**F5 步骤 2**

- 审核 2 → `indicator_set_json` + `enterprise_standard_reference_mapping` 多行 upsert；可追溯 Dify ① 快照。

**F6 步骤 3**

- `standards`：引用号 → 最新 `std_code`；审核 3 写映射；**n+m 增行**约定；后续仅以 n+m 为最新侧。

**F7 引用合规证书**

- 生成 → 存储 → 路径 → 下载（占位 PDF → 生产 `archive`）。

**F8 步骤 4～5**

- 指标表优先；`std_file_path` 门闸与 `missing_gb_files`；国标上传回填；Dify ② 写 `national_standard_indicator`；审核 4/5；Dify ③；指标对比证书。

**F9 `evaluation_result`**

- 与 `compliance_evaluation_task` 一对一（`compliance_task_id`）；各维度 enum 与路径随审级更新。

**F10 步骤 6**

- 聚合只读 API + 制品列表与下载。

**F11 异步（生产级）**

- Celery + `202` + 轮询契约（末期替换同步 Mock）。

**F12 审计与安全**

- `audit` Diff；`identity` RBAC；任务归属校验。

---

## 3. 架构与职责

- **`apps/compliance`**：状态机、编排、GET/confirm、错误体（含 `missing_gb_files`）。
- **`apps/engine`**：Dify HTTP、Webhook、幂等、JSON 校验；不写业务状态转移。
- **`apps/standards`**：`resolve_latest_*`；读国标表；可选封装更新 `std_file_path`。
- **`apps/archive`**：物理存储与下载策略。

**幂等**：`task_id` + `workflow` + `run_id` / `input_hash`；步骤 4 多标准补缺并发策略须定义。

---

## 4. 数据层注意点

- `compliance_evaluation_task.qb_code` 可为 **NULL**（建任务时尚无企标主数据）；外键指向 `enterprise_standard_basic` 时 **NULL 不校验引用**（MySQL InnoDB）。
- `evaluation_result` 已含 `compliance_task_id` 唯一约束，与任务一对一。
- 「已有可用指标」SQL 条件在 DDL/评审中定稿；避免重复插入 `national_standard_indicator`。

---

## 5. 接口能力面（语义）

任务 CRUD；步骤 1～6 的 GET 草稿/聚合 + POST confirm；国标补传；`missing_gb_files`；`summary` / `artifacts`；错误体与全局 `code`/`msg` 统一。

---

## 6. 分阶段路线图

**阶段 0** — 数据模型与契约基线：扩展 CET、快照表、Pydantic 契约草稿、`migrate`/导入说明。

**阶段 1** — 任务壳 + 状态机 + API 骨架 + 非法转移单测。

**阶段 2** — Mock Dify ① + 步骤 1～2 闭环。

**阶段 3** — `resolve_latest` + supplements + 审 3 + 引用证书占位。

**阶段 4** — 指标编排 + `std_file_path` + `missing_gb_files` + 国标上传 + Mock ②③ + 审 4/5。

**阶段 5** — `summary` + `artifacts`。

**阶段 6** — [《Dify 工作流对接冻结清单》](./backend-compliance-dify-workflow-freeze.md)：签字版契约后再真连（本阶段以文档与检查表为主）。

**阶段 7** — `engine` 真连 Dify + Webhook + 联调。

**阶段 8** — `archive` 统一、Celery、描述性证书（若有）、审计与 RBAC；F1～F12 全绿。

**依赖**：0→1→2→3→4→5 串行；**6 可与 2～5 并行**至签字前；7 依赖 6；8 依赖 7。

---

## 7. 测试与质量

- 单元：状态机、`resolve_latest` 边界、指标命中、`std_file_path` 门闸、幂等。
- 集成：multipart、错误体断言。
- 契约：阶段 6 golden JSON，阶段 7 回归。

---

## 8. 风险与待决项

- CET 与企标主表外键顺序（NULL `qb_code` 建任务）。
- 是否允许人工强制重跑 Dify ②。
- 国标上传写库权限范围。
- 步骤 4 部分成功 + `missing_gb_files` 并存策略。
- 不合规分析报告是否单列 artifact。

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05 | 首版：自 Cursor 规划落地为仓库文档；与《流程与接口约定》互链 |
