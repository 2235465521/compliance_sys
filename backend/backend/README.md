# 标准化信息服务平台 — 后端

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
| `apps/compliance/` | 8.4 | 六步向导、五审、Dify×3、多证书与汇总；流程见 [docs/backend-compliance-流程与接口约定.md](../docs/backend-compliance-流程与接口约定.md)，**执行阶段**见 [docs/backend-compliance-开发规划.md](../docs/backend-compliance-开发规划.md)，**HTTP 接口（前端对接）**见 [docs/backend-compliance-API-前端对接手册.md](../docs/backend-compliance-API-前端对接手册.md) |
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
- 合规模块对外前缀为 **`/api/v1/compliance`**；旧前端路径由新前端自行改调，后端不提供旧路径别名。

## 合规模块：鉴权、多租户与异步解析（可选）

`.env` 中（详见 `.env.example`）：

- **`COMPLIANCE_API_AUTH_REQUIRED`**：默认 `false`。为 `true` 时，除 `GET /compliance/module` 外均要求 `Authorization: Bearer <token>`；`BearerAuthPlaceholder` 将 token 截断作为开发期 `created_by` / 租户标识；列表仅返回 `created_by` 与当前 subject 一致的任务。
- **`COMPLIANCE_REQUIRE_MYSQL`**（默认 `false`）：为 `true` 且当前数据库**不是** MySQL 时，依赖 `enterprise_*` / `national_*` / `evaluation_result` 等表的接口返回 **503**，防止误以为已落库。本地 **SQLite + Swagger** 自测请保持默认 `false`；联调/验收配置 MySQL 后可改为 `true`。
- **`COMPLIANCE_DIFY_PARSE_ASYNC`**：默认 `false`。为 `true` 且 Celery 可投递时，`POST .../upload` 仅入队解析并返回 `parse_status=pending`；Worker 执行 `parse_enterprise_standard_async`；投递失败时自动回退为同步解析。
- **`COMPLIANCE_PARSE_ASYNC_PENDING_TIMEOUT_SECONDS`**（默认 `600`）：仅当开启异步解析时生效；`pending` 超过该秒数仍无 Worker 回写则自动将解析标为 `failed` 并写入 `parse_error`，避免任务永久卡住。
- **`DIFY_HTTP_TIMEOUT_SECONDS`**：Dify HTTP 超时（秒），减轻同步模式长时间挂起。

**主链路数据库**：完整落库（企标主表、引用映射、`evaluation_result` 等）须在 **MySQL** 且具备 `v1.0-sql` 表时执行；未配置 MySQL 时（如默认 **SQLite**），`COMPLIANCE_REQUIRE_MYSQL` 保持 **`false`（默认）** 仍可走通向导（业务表 SQL 会跳过，部分汇总字段为空）。若将 **`COMPLIANCE_REQUIRE_MYSQL=true`**，则非 MySQL 下相关接口返回 **503**。详见上文「合规模块：鉴权…」与 `.env.example`。

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

当前阶段主数据库约定为 **MySQL 8.x**。复制 `.env.example` 为 `.env` 后设置 **`MYSQL_DATABASE`**（及用户、密码、主机、端口）；未配置时默认仍使用 **SQLite**（`backend/db.sqlite3`）便于零依赖本地调试。ORM 通过 **PyMySQL**（兼容 MySQLdb）访问 MySQL；使用 MySQL 前请执行 `pip install -r requirements.txt`（若默认镜像 403，可加 `-i https://pypi.org/simple`）。详见 `config/settings/base.py`。**合规模块**在 **`COMPLIANCE_REQUIRE_MYSQL=true`** 且当前库非 MySQL 时，依赖业务表的接口会返回 **503**；默认 **`COMPLIANCE_REQUIRE_MYSQL=false`** 时可用 SQLite 跑通向导（业务表 SQL 跳过），见上文「合规模块」一节。

### 空库 vs 已导入 `v1.0-sql` / `merged_all.sql`

| 场景 | 命令 |
|------|------|
| **空 MySQL 库**（无 `compliance_evaluation_task` 等表） | `python manage.py migrate` |
| **已用脚本导入全库**（`compliance_evaluation_task` 与 **`compliance_evaluation_snapshot` 均已存在**） | `python manage.py migrate --fake-initial` |
| **仅导入 task 表**（有 `compliance_evaluation_task`，尚无 `compliance_evaluation_snapshot`） | `python manage.py migrate --fake-initial`（先 fake 仅含 task 的 `0001_initial`），随后 **`0002_compliance_evaluation_snapshot`** 会**真正建表**补全 snapshot |

`--fake-initial` 对 **`compliance.0001_initial`** 只检查 **任务表**是否已存在；**若 snapshot 表缺失，仍会正常执行 `0002` 创建该表**。若你已从 `merged_all.sql` 导入**两张表都有**，则 `0002` 建表会冲突，请先执行：

`python manage.py migrate compliance 0002_compliance_evaluation_snapshot --fake`

再继续 `python manage.py migrate`。

第二种场景若仍执行**不带** `--fake-initial` 的 `migrate`，且库里已有 `compliance_evaluation_task`，Django 会在 **`0001_initial`** 上报 **`(1050, "Table 'compliance_evaluation_task' already exists")`**。

**`--fake-initial`** 会对「初始迁移里要创建的表已存在」的情况**跳过建表**并仍记录迁移；随后 **`0003_parse_status_and_error`** 会为任务表补 **`parse_status` / `parse_error`** 列。请用整条命令，例如：

```bash
conda activate sip-backend
cd backend
python manage.py migrate --fake-initial
```

若曾误跑失败、状态已乱，可在**确认表结构**后：`python manage.py migrate compliance 0001_initial --fake`，再 `python manage.py migrate`。

### 曾使用旧迁移名 `0002_parse_status_and_error` 的库（升级本仓库后）

若 `django_migrations` 里已有 **`compliance` / `0002_parse_status_and_error`** 且无 **`0002_compliance_evaluation_snapshot`**，请在本库执行（**先备份**）：

```sql
UPDATE django_migrations
SET name = '0003_parse_status_and_error'
WHERE app = 'compliance' AND name = '0002_parse_status_and_error';

INSERT INTO django_migrations (app, name, applied)
VALUES ('compliance', '0002_compliance_evaluation_snapshot', NOW(6));
```

（若 `0002_compliance_evaluation_snapshot` 已存在记录则不要重复 INSERT。）之后执行 `python manage.py migrate`。

## 本地运行

```bash
conda activate sip-backend
cd backend
copy .env.example .env
python manage.py migrate
python manage.py runserver
```

**若 `.env` 已配置 `MYSQL_*` 且库来自 `v1.0-sql`/`merged_all.sql`**：将上一行 `migrate` 改为 **`python manage.py migrate --fake-initial`**（见上表）。合规模块表 DDL 以仓库 **`v1.0-sql`** 为评审源时，迁移与之对齐；索引等差异由后续迁移补齐。

## Dify 工作流 ①（企标解析）

配置 `backend/.env` 中 `DIFY_API_BASE`、`DIFY_API_KEY`、`DIFY_WORKFLOW1_FILES_INPUT_KEY`（及可选 `DIFY_WORKFLOW_1_ID`）后，`POST /api/v1/compliance/evaluations/{id}/upload` 会先保存本地文件，再调用 Dify `files/upload` + `workflows/run`（或 `workflows/{id}/run`），解析结果写入 `parse_result_json`；未配置时仍为 Mock。文件入参形态由 **`DIFY_WORKFLOW1_FILE_PAYLOAD_MODE`** 控制（默认 **`inputs_single`**：`inputs` 内为单文件对象，适配「XX is required in input form」类校验）；若报 `must be a file` 可试 **`files`** 或 **`both`**，旧式数组用 **`inputs`**。工作流默认输出为 **`outputs.QB_init_info`（JSON 字符串）** 内嵌 `qb_id` / `indexes` 等，由后端映射为统一契约 `DifyWorkflow1Output`；若外层键名不同可设 `DIFY_WORKFLOW1_OUTPUT_WRAPPER_KEY`。自检：`GET /api/v1/engine/dify/config-probe`（不返回密钥）。

## Dify 工作流 ② / ③（国标指标提取、指标对比）

- **②**：在 `GET .../evaluations/{id}/step/4/indicators` 编排中，对缺指标且本地国标文件存在的 `std_code`，若配置了 **`DIFY_WORKFLOW2_API_KEY`**（及可选 `DIFY_WORKFLOW_2_ID`、`DIFY_WORKFLOW2_FILES_INPUT_KEY` 默认 `file`），则用该 Key 上传国标文件并执行工作流，解析结果写入 **`national_standard_indicator`**；未配置时仍为单条 Mock 插入。若 Dify 输出变量名与自动探测不一致，设置 **`DIFY_WORKFLOW2_OUTPUT_WRAPPER_KEY`**。
- **③**：在 **`GET .../evaluations/{id}/step/5/compare`** 中，若配置了 **`DIFY_WORKFLOW3_API_KEY`**，将步骤 4 的 `indicator_bundle_json` 中企标侧与国标侧 JSON 作为 **`enterprise_data` / `reference_data`** 传入工作流，返回写入 **`compare_result_json`**（含 **`markdown`** 等）；未配置时返回简短 Mock。

## 测试

```bash
conda activate sip-backend
cd backend
python manage.py test apps.compliance
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
