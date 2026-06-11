# 标准化信息服务平台 — 后端

本文档中的内容同./backend中的README.md文档中的内容相同

Python **3.12** + **Django** + **Django Ninja** + **Celery/Redis**（与需求/技栈文档一致）。本目录为**可并行开发**的骨架：按业务域拆为多个 Django App，每域自包含 `api` / `services` / `schemas`，由 `config/api.py` 统一挂载到 **`/api/v1/`**。

## 目录与职责

| 路径 | 对应需求 | 说明 |
|------|-----------|------|
| `config/` | — | 工程配置、`settings`、根路由、`NinjaAPI` 聚合 |
| `apps/core/` | 公共 | 健康检查、后续公共异常/分页/依赖注入 |
| `apps/identity/` | 8.7 部分 | 登录、用户、RBAC |
| `apps/standards/` | 8.1 | 标准库、分类、谱系、正文索引 |
| `apps/novelty/` | 8.2 | 查新任务与报告 |
| `apps/duplicate_check/` | 8.3 | 查重 |
| `apps/compliance/` | 8.4 | 六步向导、五审、Dify×3、多证书与汇总；详见 [docs/backend-compliance-流程与接口约定.md](docs/backend-compliance-流程与接口约定.md) |
| `apps/alerting/` | 8.5 | 一企一库、预警 |
| `apps/archive/` | 8.6 | 模板、历史、下载 |
| `apps/audit/` | 8.7 | 审计日志、Diff 查询（仅超管） |
| `apps/dashboard/` | 8.8 | 仪表盘聚合 |
| `apps/engine/` | 技栈文档 | Dify/LangGraph 等外部编排适配、回调与长任务编排 |

**协作约定**

- 业务接口写在各自 `apps/<domain>/api/router.py`，在 `config/api.py` 里 `add_router`（勿随意改公共前缀，合并冲突时优先改自己模块内文件）。
- 领域规则放 `services/`，请求响应模型放 `schemas/`（Pydantic）。
- 与 PDF/比对等耗时逻辑：视图层只做入参与任务投递，具体实现放 `services/` + `tasks.py` +（必要时）`engine/`。

## 请求路径

- 统一前缀：`/api/v1/`（见 `config/urls.py`）。
- OpenAPI 文档：启动后访问 Django Ninja 文档地址（默认 **`/api/v1/docs`**）。
- 模块自检：各子模块暂提供 `GET .../<模块>/module`，`core` 提供 `GET /api/v1/health`。

## Python 环境（Conda）

后端统一使用 **Conda** 虚拟环境（Python **3.12**），勿再使用仓库内已删除的 `backend/.venv`。

```bash
# 首次创建（已创建可跳过）
conda create -n sip-backend python=3.12 -y
conda activate sip-backend

cd backend
pip install -r requirements.txt
# 若 pip 镜像 403，可：pip install -r requirements.txt -i https://pypi.org/simple
```

- 环境名：**`sip-backend`**（Standardization / Information Platform 后端专用）。
- 不激活也可单次执行：`conda run -n sip-backend python manage.py runserver`

## 数据库（MySQL 8.x）

当前阶段主数据库约定为 **MySQL 8.x**。复制 `backend/.env.example` 为 `backend/.env` 后设置 **`MYSQL_DATABASE`**（及用户、密码、主机、端口）；未配置时默认仍使用 **SQLite**（`backend/db.sqlite3`）便于零依赖本地调试。ORM 通过 **PyMySQL** 访问 MySQL；使用 MySQL 前请在 `backend` 下执行 `pip install -r requirements.txt`（镜像问题可加 `-i https://pypi.org/simple`）。详见 `backend/config/settings/base.py`。

## 本地运行

```bash
conda activate sip-backend
cd backend
copy .env.example .env
python manage.py migrate
python manage.py runserver
```

## 当前阶段：异步与 Redis（暂不启用）

日常开发**只需**上面的 `runserver`，**不必**安装 Docker、**不必**在本机起 Redis、**不必**开 Celery Worker。  
待业务做到「PDF 解析 / 长耗时比对 / 明确要队列投递」时，再在本机或团队统一环境接入 **Redis + Celery**（届时可选用 Docker、WSL、Memurai 等方式，见下方）。

## Celery Worker（需要异步任务时再启用）

前提：**本机已有 Redis**，且 `CELERY_BROKER_URL` 可连（见 `.env.example`）。另开终端执行：

```bash
conda activate sip-backend
cd backend
celery -A config.celery worker -l info
```

说明：显式使用 `config.celery`，避免与仅运行 `manage.py` 时的导入习惯混淆。

## 多成员开发（模块分工）

各模块应实现的**职责、建议路由、依赖关系**见：  
[《后端模块开发分工清单》](../docs/backend-模块开发分工清单.md)。

## 与仓库根目录

根目录下的 `v1.0-sql/` 为标准库相关 DDL，可与 `apps/standards` 模型对齐；需求阅读结论见 `docs/标准化信息服务平台-文档阅读结论.md`。**DDL 与 Django ORM 对齐须专人评审**，见 [《DDL/ORM 对齐职责》](../docs/backend-DDL-ORM-对齐职责.md) 与 [《模块开发分工清单》](../docs/backend-模块开发分工清单.md) 中相关章节。
