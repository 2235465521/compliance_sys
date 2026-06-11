# 合规性评价：后端分阶段实现方案（完整交付）

本文档在 [《合规性评价：流程与接口约定》](./backend-compliance-流程与接口约定.md) 与 [《后端模块开发分工清单》](./backend-模块开发分工清单.md) 基础上，将后端实现**拆阶段推进**，并给出**最终功能完整性清单**，保证最后一期交付时六步五审、三 Dify、证书与汇总均可闭环。

**关联**：[《DDL/ORM 对齐职责》](./backend-DDL-ORM-对齐职责.md) — 凡新增/改表、外键、`evaluation_result` 语义变更，须评审后合入。

---

## 1. 最终必须交付的能力（完整性清单）

以下全部满足，视为「合规模块后端功能完整」：

| # | 能力 | 说明 |
|---|------|------|
| F1 | 评价任务与状态机 | 一条任务 `current_step` 1～6，子闸门（步骤 4/5）合法转移，禁止跳步与非法重复提交 |
| F2 | 五审持久化边界 | 每审 `confirm` 后写库或快照，可断点恢复 |
| F3 | Dify ① / 按需 ② / ③ | ① 必调；**②** 仅当 **n+m** 中某 `std_code` 在 **`national_standard_indicator` 尚无「已通过 Dify 解析并落库」的指标**时调用，且**调用前**该国标在 **`national_standard_basic.std_file_path`** 上已有可用本地文件（否则阻断，见 F8）；③ 在审核 4 通过后做对比；契约与回调同原要求 |
| F4 | 步骤 1 | 上传企标 → 解析草稿 → 审核 1 → 写 `enterprise_standard_basic`；描述性证书接口可占位，**字段预留** |
| F5 | 步骤 2 | 审核 2 → `indicator_set_json` + `enterprise_standard_reference_mapping` 多行（每引用一行） |
| F6 | 步骤 3 | `standards` 解析「引用号 → 最新 std_code」→ 展示对比；审核 3；**n+m** 固化（**补充 m 条用增行**：`referenced_std_code` 为空、`latest_std_code` 填补充号，避免误用单列 `supplement_std_version_code` 表达多值） |
| F7 | 引用合规证书 | 审核 3 通过后生成文件、路径落库（如 `reference_result_report_file_path` / 任务子表） |
| F8 | 步骤 4～5 | 步骤 4：**先查** `national_standard_indicator` 是否已有「Dify 曾解析并已保存」的指标；对仍缺、需 **Dify②** 的 `std_code`，**先查** `national_standard_basic.std_file_path`：空或文件不存在则**不调 Dify②**，返回 **`missing_gb_files`**（见 [流程约定 §5](./backend-compliance-流程与接口约定.md)），用户上传国标并**回填路径**后再补缺；与企标指标合并 → 审核 4；**Dify③** 对比 → 审核 5；指标对比证书路径 |
| F9 | `evaluation_result` | 与**任务**绑定：描述性/引用/指标/总体 enum 与各报告路径、总证书路径按审级更新 |
| F10 | 步骤 6 | 聚合只读 API + 各 artifact 下载（`archive` 或合规受控下载） |
| F11 | 异步（生产级） | Dify/证书生成可走 Celery；接口层 `202` + 轮询契约 |
| F12 | 审计与安全 | 关键步骤快照 Diff 接 `audit`；下载与任务归属走 `identity` RBAC |

前期阶段可对 F3/F7/F10/F11/F12 **Mock 或占位**，但**最后一期前须全部替换为真实实现**，不得长期留「假完成」。

---

## 2. 设计收束（与实现强绑定）

1. **向导 = 状态机**：`compliance` 内 `transition(task, event, payload)`，校验前置步。  
2. **五审 = 五道闸门**：每审通过写快照（`ComplianceEvaluationSnapshot` 或 JSON 列）满足恢复与审计。  
3. **重计算在 `engine`**：Dify HTTP、Webhook、run id、幂等；**不写**业务状态机。  
4. **最新标准号在 `standards`**：`national_standard_basic`、`standard_pedigree` 等只读拼装，避免合规 router 堆 SQL。  
5. **n→n+m 可重建**：映射表多行 + 补充行约定（见 F6）。  
6. **artifact**：生成 → 存储 → 路径写 DB → 下载经 `archive` 或带鉴权的文件服务。

---

## 3. 数据层基线（首期评审一次定稿）

| 决策 | 建议 |
|------|------|
| 任务表 | 新增 `compliance_evaluation_task`：`id`、`qb_code`（可空至审核 1 确认）、`current_step`、子状态、`uploaded_file_path`、`dify_run_id_1/2/3`（或 JSON）、`parse_result_json`、`indicator_bundle_json`、`compare_result_json`、`created_by`、`status`（active/failed/archived）等 |
| 快照表（可选但推荐） | `compliance_evaluation_snapshot`：`task_id`、`step`、`payload_json`、`created_at`，便于 audit 与回放 |
| `evaluation_result` | **增加 `task_id` 唯一外键**（每任务一行结论）；保留 `qb_code` 便于报表；与现有 `merged_all.sql` 兼容需 **migration 评审** |
| 企标主数据 | 继续 `enterprise_standard_basic`；多轮评价**覆盖 vs 版本**策略在评审写明（常见：任务级快照为准，主表存「当前认定」） |

---

## 4. 分阶段路线图

### 阶段 0：数据模型与契约冻结（1 个迭代，阻塞后续）

**目标**：DDL/ORM 评审通过，迁移可执行。

- 产出：`compliance_evaluation_task`（+ 可选 `snapshot`）、`evaluation_result.task_id` 及唯一约束草案、n+m **增行**约定写入本文档或 DDL 注释。  
- 产出：Dify ①②③ 输入输出 **Pydantic 契约**草稿（字段名与前端对齐）。  
- 验收：本地 `migrate` 成功；与已导入 `standards_db_v1.0` 无破坏性冲突说明。

---

### 阶段 1：任务壳 + 状态机 + API 骨架（无 Dify）

**目标**：能创建任务、查任务、非法步骤返回 409/422。

- 实现：`evaluation_task_service`、`state_machine`、router `POST/GET /evaluations`、`GET .../summary` 空壳。  
- 单元测试：合法/非法转移表覆盖。  
- 验收：OpenAPI 可见任务资源；**不涉及** Dify。

---

### 阶段 2：上传 + Dify① Mock + 审核 1～2

**目标**：F1（部分）、F2（审 1～2）、F4、F5 打通「假 AI」路径。

- 实现：`POST .../upload` 存文件；`engine` 层 **Mock** 返回固定解析 JSON；任务挂 `parse_result_json`；`POST .../step/1/confirm` → `enterprise_standard_basic`；`POST .../step/2/confirm` → `indicator_set_json` + `enterprise_standard_reference_mapping` 批量 upsert。  
- 验收：Postman/集成测试走完步骤 1～2；库表有对应行。

---

### 阶段 3：`standards` 解析最新号 + 审核 3 + n+m + 引用证书占位

**目标**：F6、F7（占位文件即可）。

- 实现：`resolve_latest_for_references(codes)`（首期可：`national_standard_basic` 现行 + `ped_id`/`standard_pedigree` 辅助；处理 `latest_std_code` 多值拼接）。`GET .../reference-latest`；`POST .../supplements` 增行；`POST .../step/3/confirm` 写 `latest_std_code`、`manual_review_status`；`certificate_service` 写空 PDF 或模板 PDF → 路径 → `evaluation_result.reference_result*` 或任务字段。  
- 验收：步骤 3 闭环；下载接口返回占位文件流（可先不走 `archive`）。

---

### 阶段 4：Dify②③ Mock + 审核 4～5 + `evaluation_result` 写全

**目标**：F8、F9（除真实 Dify 外）。

- 实现：`indicator_workflow_service`：**先**按 **n+m** 查 `national_standard_indicator` 是否已有「Dify 解析并已落库」的指标行；**仅对仍缺的标准**，在 Mock/调用 Dify② **之前**校验 `national_standard_basic.std_file_path`（Mock 可固定一条「缺文件」用例返回 `409`/`422` + `missing_gb_files`）；提供占位 **`POST .../national-standards/upload`**（或等价路径）更新路径后再走 Dify②；合并后供审核 4；审核 4 通过后 Dify③ Mock 对比；`POST .../step/4/confirm`、`.../step/5/confirm`；更新 `indicator_result`、`overall_result` 等占位 enum 与路径；指标对比证书占位文件。  
- 验收：步骤 4～5 端到端（Mock）；步骤 6 `GET .../summary` 能聚合任务 + 三张企标相关表 + `evaluation_result`。

---

### 阶段 5：`engine` 真实 Dify + Webhook

**目标**：F3 真实化。

- 实现：`DifyClient`、环境变量工作流 ID、回调路由、`dify_run_id_*` 更新、失败重试与幂等键。  
- 验收：至少一条真实 PDF 跑通 ①；② 覆盖「库全命中不调」与「部分缺失调用」两种路径；③ 最小用例跑通；超时走轮询契约。

---

### 阶段 6：`archive` 与步骤 6 下载生产化

**目标**：F10、F7/F8 证书走统一存储与 URL 策略。

- 实现：文件根目录、权限、按 `task_id` 列目录；`GET .../artifacts` 列表 + 单文件下载；可选总结 PDF。  
- 验收：与前端下载联调清单一致。

---

### 阶段 7：异步、描述性证书、审计、RBAC

**目标**：F11、F4 描述性证书实作、F12。

- 实现：Celery 任务封装 Dify 与证书；`POST .../upload` 返回 `202`；`audit` hooks 写 Diff；`identity` 守卫下载与改任务。  
- 验收：对照第 1 节完整性清单 **F1～F12 全绿**。

---

## 5. 阶段与完整性清单映射

| 阶段 | 覆盖的 F# |
|------|-----------|
| 0 | 全部的数据前提 |
| 1 | F1 骨架 |
| 2 | F1、F2（1～2）、F4、F5 |
| 3 | F6、F7（占位） |
| 4 | F8、F9、F10（聚合） |
| 5 | F3 |
| 6 | F10（生产）、F7/F8 存储统一 |
| 7 | F11、F4 证书、F12 |

---

## 6. 服务与路由（全期不变更职责，仅充实实现）

| 层 | 内容 |
|----|------|
| `apps/compliance/services/` | `evaluation_task_service`、`parse_service`、`extract_confirm_service`、`reference_resolution_service`（调 standards）、`indicator_workflow_service`、`certificate_service`、`summary_service`、`state_machine` |
| `apps/compliance/api/` | router + schemas 与 [流程约定 §5](./backend-compliance-流程与接口约定.md) 对齐 |
| `apps/engine/` | Dify 客户端、回调、`compliance_parse|indicators|compare` 配置键 |
| `apps/standards/services/` | `resolve_latest_*`；**步骤 4**：按 **n+m** 查 `national_standard_indicator` 是否已有「Dify 已解析落库」的指标；有则复用；无则读 **`national_standard_basic.std_file_path`** 判定是否可发起 Dify②，并配合合规侧「国标补充上传」更新路径 |

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05 | 首版：分阶段路线 + F1～F12 完整性清单 + 数据层与 n+m 增行约定 |
| 2026-05 | 明确「已有可用指标」= 曾由 Dify 解析并已写入 `national_standard_indicator` |
| 2026-05 | F8/F3：`std_file_path` 缺失时阻断 Dify②；阶段 4 含占位上传接口与 `missing_gb_files` 响应 |
| 2026-05 | 详细执行阶段以 [《合规性评价：开发规划》](./backend-compliance-开发规划.md) 为准；本表保留 F1～F12 简表 |
