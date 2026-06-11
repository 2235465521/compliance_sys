# 预警模块 API — 前端对接速查

Base URL：`http://{host}:{port}/api`（**非** `/api/v1`）

鉴权：与合规一致，`COMPLIANCE_API_AUTH_REQUIRED=true` 时需 `Authorization: Bearer <token>`

成功包络：

```json
{ "code": 200, "msg": "success", "data": { } }
```

---

## 正向预警

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/warnings/forward-by-qb/?subject_code=` | 企标号五列比对（主入口） |
| POST | `/warnings/forward-by-file/` | multipart：`file`，可选 `subject_code` |
| POST | `/analyze_qb_references_auto/` | 仅解析文件，返回 `subject_code` 后请再调 forward-by-qb |

`data` 关键字段：`task_conclusion`、`task_summary`、`compare_rows[]`（五列：`referenced_std_code`、`full_std_at_publication`、`baseline_latest_std`、`current_latest_std`、`row_conclusion`）

`task_conclusion`：`need_attention` | `all_ok` | `empty_history` | `partial` | `pending`

---

## 反向预警

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/standards/warning-trace/?bz_id=` | 国标查新 + 关联企标列表 |

展示顺序：任务总结论 → `gb_novelty` → `affected_enterprises[]`

---

## 实时监控

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/warnings/monitor/summary/` | 汇总卡片 |
| GET | `/warnings/monitor/enterprises/?page=&page_size=&status=&keyword=` | 企标列表 |
| GET | `/warnings/monitor/enterprises/detail/?subject_code=` | 下钻五列明细（**含 `/` 企标号必用 Query**） |
| POST | `/warnings/scan/` | 主动巡检（异步，立即返回 `job_id`） |
| POST | `/warnings/scan/{job_id}/pause/` | 暂停巡检 |
| POST | `/warnings/scan/{job_id}/resume/` | 继续已暂停巡检 |

`status` 筛选：`need_attention` | `all_ok` | `no_eval_record` | `not_scanned` | `all`

**scan 启动** `POST /warnings/scan/` 返回：`success`、`message`、`job_id`、`processed_count`（0）、`total_count`（本轮队列长度）。409 = 已有 running/paused 任务。

**巡检中轮询** `GET /warnings/monitor/summary/`：当存在进行中任务时，额外返回 `active_scan`：

```json
"active_scan": {
  "job_id": "28",
  "status": "running",
  "processed_count": 120,
  "total_count": 700,
  "current_subject_code": "Q/XXX 001-2020",
  "phase": "not_scanned",
  "not_scanned_count": 621,
  "need_attention_count": 2,
  "all_ok_count": 660,
  "no_eval_record_count": 47
}
```

前端建议：点击巡检后每 3～5 秒轮询 summary，用 `active_scan.not_scanned_count` 与 `processed_count/total_count` 展示进度；展示暂停按钮并调 `POST .../pause/`。

**队列顺序**：先全部「尚未巡检」，再全部「状态良好」（`all_ok`/`partial`）；无评价记录、需更新不在本轮队列。

**部署**：须运行 `celery -A config.celery worker -l info`（任务 `alerting.process_warning_monitor_run`）。

**summary 四类构成**（`total_evaluated` = 四者之和）：`need_attention_count`、`all_ok_count`、`no_eval_record_count`、`not_scanned_count`；`pending_count` 同 `not_scanned_count`（兼容）。

---

## 联调示例

```bash
curl -G "http://127.0.0.1:8000/api/warnings/forward-by-qb/" \
  --data-urlencode "subject_code=Q/XXX 001-2020"

curl -G "http://127.0.0.1:8000/api/standards/warning-trace/" \
  --data-urlencode "bz_id=GB/T 1.1-2009"

curl "http://127.0.0.1:8000/api/warnings/monitor/summary/"
```

详细契约见 [backend-warnings-API-后端开发执行方案.md](./backend-warnings-API-后端开发执行方案.md)。

**实时监控 Tab 改造清单（给前端）** → [backend-warnings-实时监控-前端改造说明.md](./backend-warnings-实时监控-前端改造说明.md)
