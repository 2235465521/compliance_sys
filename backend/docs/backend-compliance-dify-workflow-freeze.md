# Dify 工作流对接冻结清单（阶段 6）

本文档为**签字前不得进入阶段 7（真连开发）**的检查表。契约正文以 [《合规性评价：开发规划》](./backend-compliance-开发规划.md) 与 `apps/compliance/schemas/dify_contracts.py` 为准。

> **实施状态（2026-05）**：阶段 7 已部分进行——[`dify_client.py`](../backend/apps/engine/dify_client.py) 已实现工作流 **①②③** HTTP 调用；**①** 联调通过。以下勾选表示「已在 dev 环境配置或代码就绪」；**Webhook、签字** 仍待完成。联调记录见 [步骤 4～5 验证](./backend-compliance-步骤45-联调验证.md)。

## 1. 环境与标识

- [x] Dify 部署环境（dev / staging / prod）URL 列表 — dev：`DIFY_API_BASE`（见 `backend/.env`）
- [x] 工作流 **① 企标解析** 的应用内 ID：`DIFY_WORKFLOW_1_ID`
- [x] 工作流 **② 国标指标补缺** 的应用内 ID：`DIFY_WORKFLOW_2_ID`
- [x] 工作流 **③ 指标对比** 的应用内 ID：`DIFY_WORKFLOW_3_ID`
- [ ] `DIFY_API_BASE`、`DIFY_API_KEY` 保管与轮换责任人（运维流程未文档化）

## 2. 调用模式

- [x] 各工作流为 **同步阻塞** 还是 **异步 + Webhook**（或混合）— 当前 **①②③ 以同步 HTTP 为主**；合规上传可选 `COMPLIANCE_DIFY_PARSE_ASYNC` + Celery
- [x] 超时时间（秒）与前端/网关对齐 — `DIFY_HTTP_TIMEOUT` 等见 `.env.example`
- [x] 失败重试次数、退避策略、**幂等键**（建议 `task_id` + `workflow` + `run_id` / `input_hash`）— 客户端层已实现基础重试
- [ ] 部分成功时是否允许落库半成品 JSON（产品决策未冻结）

## 3. 入参样例（各 1 份 JSON）

- [x] ①：企标文件传递方式（URL / multipart 直传 / 对象存储 key）、期望输出与 `DifyWorkflow1Output` 字段对齐表 — 联调样例见开发规划与 `dify_contracts.py`
- [x] ②：单 `std_code` + 国标文件 URI + 与 `DifyWorkflow2Input` 对齐
- [x] ③：企标侧指标 JSON + n+m 国标侧指标 JSON + 与 `DifyWorkflow3Input` 对齐

## 4. 出参样例（各 1 份 JSON）

- [x] ①②③ 输出与 Pydantic 契约 **字段级**对照表（含可选字段、默认值、错误时 error 结构）— 以 `dify_contracts.py` 为准；②③ E2E 需在 MySQL+国标文件路径环境复验

## 5. Webhook

- [ ] 回调 URL（与 `POST /api/v1/engine/dify/webhook` 或生产路径）一致
- [ ] 签名校验算法（HMAC / 自定义 header）与重放防护
- [ ] 重复投递时 compliance 任务状态**不重复推进**

## 6. 与合规任务状态联动

- [x] 何种 payload 将任务从「解析中」置为「可审核 1」— 同步解析成功写 `parse_result` + 状态推进（见 `evaluation_flow`）
- [ ] 何种错误将 `compliance_evaluation_task.status` 置为 `failed` 及是否允许用户重试上传（需与前端统一）

## 7. 版本与变更

- [ ] Dify 应用变更走变更单；契约变更同步 OpenAPI 与本文档版本号

## 8. 签字

| 角色 | 姓名 | 日期 |
|------|------|------|
| 后端负责人 | | |
| 算法/Dify 负责人 | | |
| 前端负责人 | | |
