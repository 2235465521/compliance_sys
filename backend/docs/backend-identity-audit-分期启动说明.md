# identity + audit 分期启动说明（第一期）

本文档对应 [《模块开发分工清单》](./backend-模块开发分工清单.md) 第一期；**standards 只读 HTTP** 已先行落地（见 [《standards 只读 API》](./backend-standards-只读API说明.md)）。

## 当前状态（2026-05）

| 模块 | 实现 |
|------|------|
| `identity` | 仅 `/module`、`/auth/probe`（`BearerAuthPlaceholder`） |
| `audit` | 同上；无 `AuditService`、无 Diff 钩子 |
| `compliance` | 业务主链 substantial；F12（审计+RBAC）未接 |

## 建议启动顺序

1. **identity**：`POST /auth/login`（JWT 或 Session）、用户/角色模型、`COMPLIANCE_API_AUTH_REQUIRED` 与合规路由统一鉴权。
2. **audit**：`AuditService.append()`、合规模块 confirm/upload 挂 Diff 钩子；`GET /logs` **仅超管**。
3. **联调**：合规任务列表租户隔离、操作员不可见 `/audit` 路由（前端 + 后端双重校验）。

## 依赖

- Django `auth` 表已由 `core` migration 注释；业务用户表需与 RBAC 设计对齐需求 8.7。
- 不改变现有合规/批量 API 路径；鉴权以 router 级 `auth=` 增量接入。
