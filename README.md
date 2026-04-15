# 前端并行开发协作说明

本目录存放**五人分工**下的前端开发约定，与仓库内 [`frontend/`](../../frontend) 工程配套使用。开发前请先阅读本文，再打开本人负责的文档。

## 分工总览

| 成员 | 负责模块（路由 path） | 详细文档 |
|------|------------------------|----------|
| 成员一 | 仪表盘 `/dashboard` | [成员一-仪表盘.md](./成员一-仪表盘.md) |
| 成员二 | 合规性评价 `/compliance` | [成员二-合规性评价.md](./成员二-合规性评价.md) |
| 成员三 | 查重服务 `/duplicate-check`、模板与存档 `/template-archive` | [成员三-查重与模板存档.md](./成员三-查重与模板存档.md) |
| 成员四 | 预警系统 `/alert` | [成员四-预警系统.md](./成员四-预警系统.md) |
| 成员五 | 标准库管理 `/standard-library`、查新服务 `/novelty-search`、企业档案 `/enterprise-archive`、系统安全与审计 `/system` | [成员五-标准库查新企业档案与系统.md](./成员五-标准库查新企业档案与系统.md) |

## 全组统一约定（摘要）

- **页面根目录**：`frontend/src/pages/<模块名>/`，入口文件为 `index.tsx`（默认导出页面组件）。模块内可建 `components/`、`hooks/`、`utils/`。
- **静态资源**：本模块专用放在 `frontend/src/pages/<模块名>/assets/`；多模块共用需放到 `frontend/src/assets/shared/` 并在 PR 中说明，避免随意迁入。
- **接口**：`frontend/src/services/<模块名>.ts`（或同名的 `services/<模块名>/` 目录，接口变多时再拆）。
- **状态**：`frontend/src/stores/<模块名>.ts`。
- **类型**：`frontend/src/types/<模块名>.ts`。
- **跨模块复用 UI**：放在 `frontend/src/components/`，并在 PR 中说明用途；勿擅自大改他人在其模块 `components/` 下的文件。

## 高风险合并冲突文件

以下文件由多人可能同时修改，合并前务必拉取最新主分支，PR 中写明改动原因：

- `frontend/src/routes/index.tsx`
- `frontend/src/routes/menu.tsx`

若仅新增本模块路由/菜单项，优先采用「只增加自己相关的 `import` 与 `children` 项、不改动他人路由行」的方式。

## 慎改的全局文件

以下文件影响全应用，非必要不修改；必须修改时请在 PR 描述中 **@ 评审人或全组** 并说明理由：

- `frontend/src/layouts/BasicLayout.tsx`
- `frontend/src/services/request.ts`
- `frontend/src/main.tsx`

## GitHub 分支与合并流程

全组统一采用「**每人独立功能分支开发 → Pull Request 合入主分支**」，避免多人直接在主分支上提交导致冲突与历史混乱。

1. **主分支**：以团队仓库约定为准（一般为 `main` 或 `master`，下文统称「主分支」）。主分支应始终保持可构建、可合并的基线。
2. **拉取自己的分支**：从 GitHub 克隆仓库后，先拉取并切换到主分支且更新到最新，再**新建仅属于自己的功能分支**（命名见下节）。之后**所有与本成员负责模块相关的修改**（含 `frontend/` 内代码、必要时 `docs/` 或依赖变更）均应在此分支上提交。
3. **日常开发**：在本地功能分支上开发与 `git commit`；需要备份或协作时，将分支 `git push` 到 **GitHub 上与自己同名的远程分支**（例如 `git push -u origin feature/dashboard-xxx`）。**禁止**在未经评审的情况下将本地主分支强行推送到远程主分支。
4. **合并回主分支**：功能自测通过后，在 **GitHub 上从个人功能分支向主分支发起 Pull Request（PR）**；填写说明、关联任务（如有）。经至少一名同伴 **Code Review** 通过后，由具备合并权限的维护者（或团队约定的人选）执行 **Merge**。合并前若主分支已有他人合并的新提交，应在本地先执行 `git fetch` 后 **merge 或 rebase 主分支到个人分支**，解决冲突并再次 `npm run build` 通过后再更新 PR。
5. **长期协作**：若开发周期较长，应**经常同步主分支**到个人分支，减少最终合并时的大规模冲突。

**与「高风险文件」的关系**：修改 `routes/index.tsx`、`menu.tsx` 等仍须遵守上文「共享文件」约定；在 PR 中说明改动范围，合并时优先沟通顺序。

## 依赖与分支命名

- **npm 依赖**：新增依赖须在 PR 中写明用途与必要性，避免重复引入功能相近的库。
- **功能分支命名**：`feature/<模块简写>-<简述>`，例如 `feature/dashboard-charts`。建议与本人负责模块对应，便于识别。
- **PR 粒度**：优先单模块 + 必要的共享文件改动，避免一个 PR 混杂多个无关模块。

## 自测底线

合并前在 `frontend` 目录执行：`npm run build`，确保 TypeScript 与构建通过。

各成员文档中有更完整的自测清单与模块专属说明。
