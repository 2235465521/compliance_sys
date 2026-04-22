# 合规性评价模块缺失/受阻接口清单

## 对账范围

- 协作文档：`docs/frontend-parallel-dev/成员二-合规性评价.md`、`README.md`
- 后端接口文档：`backend_api_docs_v2.md`
- 前端实现：`frontend/src/services/compliance.ts`、`frontend/src/pages/compliance/*`

## 一、命名或契约不一致（需联调确认）

| 现状 | 涉及接口 | 问题说明 | 建议 |
|---|---|---|---|
| 前端主流程使用“新批量接口” | `/api/standards/batch-references/`、`/api/standards/batch-indexes/` | `backend_api_docs_v2.md` 未登记这两个接口，但前端主流程依赖它们 | 后端文档补齐接口定义（字段、返回结构、错误码） |
| 前端读取指标库 | `/api/indexes_table/` | v2 文档未登记该接口契约 | 文档补齐列表结构、筛选参数、分页规范 |
| 前端映射入库 | `/api/save_mapping/`、`/api/mapping/save/` | v2 文档未登记，且存在双路径兼容 | 统一保留一个正式路径并在文档声明 |
| 导出报告 | `/api/standards/export-report/` | 文档主推 POST 批量，前端历史有 GET 单条；当前两者并存 | 建议后端明确“GET 单条/POST 批量”长期策略 |

## 二、当前无法在前端独立实现（需后端支持）

| 能力 | 受阻点 | 影响 |
|---|---|---|
| Dify 实时进度与通知 | `backend_api_docs_v2.md` 未给出 `ws://.../ws/dify_notifications/` 契约与示例 | 前端只能轮询，无法稳定做实时进度流 |
| 批量映射入库明细回执 | 当前映射接口仅成功/失败，缺少逐条结果结构 | UI 无法展示“哪些标准映射失败”的明细表 |
| 规范性引用提取质量诊断 | 缺少标准化诊断字段（如提取置信度、来源段落定位） | 只能做人工复核，无法做可解释性提示 |

## 三、可暂缓（非阻断）

| 接口 | 状态 | 说明 |
|---|---|---|
| `/api/analyze_qb_references_auto/` | 已封装，未作为主流程调用 | 现阶段以批量新接口为主，旧接口可作为回退方案保留 |
| `/api/check_references/` | 已封装，页面未启用 | 可在后续增加“规范性引用AI合规评价”子面板时启用 |

## 四、建议优先级

1. 先补齐 v2 文档中缺失的主流程接口（`batch-references`、`batch-indexes`、`indexes_table`、`save_mapping`）。
2. 明确导出报告 GET/POST 双模式的正式契约。
3. 若要增强体验，再补 WebSocket 契约与批量映射明细回执。

---

## 速览：未连上后端接口/后端未明确接口

### A. 页面已实现但后端文档未完整登记

- `/api/standards/batch-references/`
- `/api/standards/batch-indexes/`
- `/api/indexes_table/`
- `/api/save_mapping/`（含兼容 `/api/mapping/save/`）

### B. 前端已封装但页面未启用（非阻断）

- `/api/check_references/`
- `/api/analyze_qb_references_auto/`
- `/api/dify/preface-diff/`
- `/api/get_tree_data/`

### C. 需后端补能力后才能完整体验

- WebSocket 实时通知契约（Dify 解析进度/结果）
- 映射批量入库逐条回执（成功/失败明细）
- 引用提取诊断字段（置信度、来源定位等）
