# 合规性评价：步骤 4～5 与 Dify ②③ 联调验证

本文档落实 [项目进度统筹](./backend-compliance-开发规划.md) 中「阶段 4～5 / F3·F8」的验收记录，便于联调与回归。

**关联代码**：[`evaluation_flow.py`](../backend/apps/compliance/services/evaluation_flow.py)（`build_step4_indicators`、`run_step5_compare`、`confirm_step4/5`）、[`dify_client.py`](../backend/apps/engine/dify_client.py)。

---

## 1. 自动化验证（已通过）

在 `backend/` 目录、Conda 环境 `sip-backend` 下执行：

```bash
python manage.py test apps.compliance --verbosity=1
```

| 项 | 结果 |
|----|------|
| 用例数 | 28（含 `DifyWorkflowConfigTests`、`Step45StateMachineTests`） |
| 状态机步骤 4/5 闸门 | 通过 |
| Dify ①②③ `is_workflow*_configured()` | 在已配置 `backend/.env` 时为 **True** |
| 数据库引擎 | `mysql`（需 `MYSQL_DATABASE` 等） |

---

## 2. 环境自检

```bash
python manage.py shell -c "from apps.engine.dify_client import DifyClient; c=DifyClient(); print(c.is_workflow1_configured(), c.is_workflow2_configured(), c.is_workflow3_configured())"
```

或 OpenAPI：

- `GET /api/v1/engine/dify/config-probe` → `workflow1_ready`、`workflow2_ready`、`workflow3_ready` 均为 `true`

**工作流 ②**：`DIFY_WORKFLOW2_API_KEY`、`DIFY_WORKFLOW2_FILES_INPUT_KEY=file`（国标文件变量）  
**工作流 ③**：`DIFY_WORKFLOW3_API_KEY`；入参键 `enterprise_data` / `reference_data`（见 `.env.example`）

---

## 3. 手工 E2E 路径（MySQL + 已导入标准库）

前提：任务已完成 **审核 3**（`current_step >= 4`），`enterprise_standard_reference_mapping` 中 **n+m** 侧 `latest_std_code` 已写入。

| 顺序 | 方法 | 路径 | 预期 |
|------|------|------|------|
| 1 | GET | `/api/v1/compliance/evaluations/{id}/step/4/indicators` | 200；`enterprise_indicators` + `national_by_std_code`；缺文件时 `missing_gb_files` 非空 |
| 2 | POST | `/api/v1/compliance/national-standards/upload` | 补传国标后重试步骤 4 |
| 3 | POST | `/api/v1/compliance/evaluations/{id}/step/4/confirm` | 200；`current_step`→5；`step4_indicators_confirmed=true` |
| 4 | GET | `/api/v1/compliance/evaluations/{id}/step/5/compare` | 200；`compare_result` 含 `markdown` 等（真连 ③）或 Mock 文案 |
| 5 | POST | `/api/v1/compliance/evaluations/{id}/step/5/confirm` | 200；`current_step`→6；指标对比证书路径写入 `evaluation_result`（MySQL） |

**步骤 4 逻辑要点**：

- 对每个 n+m 的 `std_code`：若 `national_standard_indicator` 已有行 → 直接用库内指标，不调 Dify ②。
- 若无指标且 `national_standard_basic.std_file_path` 有效 → 调 Dify ② 写入指标表。
- 若路径空或文件不存在 → 列入 `missing_gb_files`，**须先补传**再 `confirm` 步骤 4。

**步骤 5 逻辑要点**：

- 须 `step4_indicators_confirmed=true` 且 `current_step=5`。
- 已配置 `DIFY_WORKFLOW3_API_KEY` 时调用 `run_workflow_3_index_compare`；否则返回 Mock 对比 JSON。

---

## 4. 已知限制（非步骤 4/5 代码缺陷）

| 项 | 说明 |
|----|------|
| Webhook | `POST /api/v1/engine/dify/webhook` 仍为占位，同步阻塞调用 Dify |
| 证书 | 引用/指标证书为最小 PDF 占位，非正式版式 |
| Celery | 上传解析可选异步；步骤 4/5 默认在 HTTP 请求内同步执行 Dify |
| SQLite | 步骤 4 在 SQLite 下返回空编排，**联调须 MySQL** |

---

## 5. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05 | 首版：自动化 + 环境探针 + E2E 检查表 |
