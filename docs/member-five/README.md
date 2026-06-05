# 成员五：四模块界面规划文档

本目录为成员五负责模块的**界面与信息架构**设计说明，与仓库根目录 [成员五-标准库查新企业档案与系统.md](../../成员五-标准库查新企业档案与系统.md) 中的工程约定配合使用。

各文档以**产品与交互**为主；**HTTP 路径、请求体等以后端新提供的接口说明为准**（仓库内旧版后端接口说明文档已移除）。

| 文档 | 路由前缀 |
|------|----------|
| [01-standard-library.md](./01-standard-library.md) | `/standard-library` |
| [02-novelty-search.md](./02-novelty-search.md) | `/novelty-search` |
| [03-enterprise-archive.md](./03-enterprise-archive.md) | `/enterprise-archive` |
| [04-system-security-audit.md](./04-system-security-audit.md) | `/system` |

**预警系统**（路由 `/alert`）后端接口说明见：[backend-warnings-API-后端开发执行方案.md](../backend-warnings-API-后端开发执行方案.md)（后端实现）；[backend-warnings-API-前端对接手册.md](../backend-warnings-API-前端对接手册.md)（前端联调）。
