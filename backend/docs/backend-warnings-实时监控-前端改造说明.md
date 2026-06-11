# 实时监控 / 主动巡检 — 前端改造说明

本文档面向**前端开发**，说明相对旧版实时监控 Tab 需要改动的接口、类型、交互与联调方式。  
后端契约以 [backend-warnings-API-后端开发执行方案.md](./backend-warnings-API-后端开发执行方案.md) 与 [backend-warnings-API-前端对接手册.md](./backend-warnings-API-前端对接手册.md) 为准。

**Base URL**：`{VITE_API_BASE_URL}`，默认 `/api`（非 `/api/v1`）。

---

## 1. 改造总览

| 区域 | 旧行为（需废弃或调整） | 新行为 |
|------|------------------------|--------|
| 主动巡检 | POST 后只刷新一次 summary/list，数字不变 | **异步巡检** + **轮询 summary** |
| 汇总卡片 | 总数 + 需更新 + 良好 + pending，四块加不齐总数 | **四类计数** 与 `total_evaluated_qb` 恒等 |
| 尚未巡检 | 与 `pending_count` 混用 | 使用 **`not_scanned_count`**；`pending_count` 仅兼容 |
| 无评价记录 | 无独立展示 / 曾出现 `empty_history` | 独立 **`no_eval_record_count`** + 列表筛选项 |
| 巡检进度 | 无 | **`active_scan`** + 进度条 |
| 暂停 | 无 | **`POST .../pause/`**、**`POST .../resume/`** |
| 旧列表接口 | `GET /warnings/forward-auto-list`、`GET /warnings/list` | **不再使用** |

---

## 2. TypeScript 类型建议

建议在 `warnings-api.ts`（或等价文件）中新增/调整：

```typescript
/** GET /warnings/monitor/summary/ */
export interface WarningsMonitorSummaryApi {
  last_scan_at: string | null;
  total_evaluated_qb: number;
  need_attention_count: number;
  all_ok_count: number;
  no_eval_record_count: number;
  not_scanned_count: number;
  /** @deprecated 与 not_scanned_count 相同，新代码请用 not_scanned_count */
  pending_count: number;
  /** 仅存在 running/paused 巡检时返回 */
  active_scan?: WarningsActiveScanApi | null;
}

export interface WarningsActiveScanApi {
  job_id: string;
  status: "running" | "paused";
  processed_count: number;
  total_count: number;
  current_qb_code: string | null;
  /** not_scanned | all_ok | null */
  phase: string | null;
  pause_requested?: boolean;
  not_scanned_count: number;
  need_attention_count: number;
  all_ok_count: number;
  no_eval_record_count: number;
}

/** POST /warnings/scan/ */
export interface WarningsScanResponseApi {
  success: boolean;
  message?: string;
  job_id?: string;
  processed_count?: number;
  /** 本轮巡检队列长度（尚未巡检 + 状态良好） */
  total_count?: number;
}

/** 列表行 task_conclusion */
export type MonitorEnterpriseConclusion =
  | "need_attention"
  | "all_ok"
  | "partial"
  | "not_scanned"
  | "no_eval_record";
  // 勿再使用 empty_history（后端已不落库）
```

---

## 3. 汇总区（顶部统计卡片）

### 3.1 接口

`GET /api/warnings/monitor/summary/`

### 3.2 展示映射

| UI 文案（建议） | 数据字段 | 说明 |
|-----------------|----------|------|
| 已评价企标总数 | `total_evaluated_qb` | 分母 |
| 需更新 | `need_attention_count` | |
| 状态良好 | `all_ok_count` | 含 `all_ok` + `partial` |
| 无评价记录 | `no_eval_record_count` | 无可用引用清单 |
| 尚未巡检 | `not_scanned_count` | 有引用、未写入快照 |

**校验（可选）**：

```text
total_evaluated_qb
  === need_attention_count + all_ok_count + no_eval_record_count + not_scanned_count
```

### 3.3 最近巡检时间

- 字段：`last_scan_at`（ISO8601）
- 仅当存在 **`status=completed`** 的批次时有值；巡检进行中可能仍为 `null`，属正常。

---

## 4. 主动巡检按钮（核心改造）

### 4.1 启动巡检

```http
POST /api/warnings/scan/
Content-Type: application/json   （可无 body，或 body: {}）
```

**成功** `data` 示例：

```json
{
  "success": true,
  "message": "全库巡检已启动",
  "job_id": "28",
  "processed_count": 0,
  "total_count": 694
}
```

**失败**：

| code | 场景 | 前端处理 |
|------|------|----------|
| 409 | 已有 running/paused 任务 | 提示「巡检进行中」，可引导查看进度或先暂停 |
| 503 | DB/服务不可用 | 通用错误提示 |

### 4.2 禁止「只请求一次」

旧逻辑（错误）：

```text
POST scan → GET summary 一次 → GET list 一次 → 结束
```

新逻辑（必须）：

```text
POST scan
  → 保存 job_id
  → 启动轮询（3～5s）GET summary
  → 每次轮询：更新卡片数字 + active_scan 进度
  → 若 active_scan 消失且上次为 running：再 GET list，停止轮询
```

### 4.3 轮询伪代码

```typescript
let pollTimer: ReturnType<typeof setInterval> | null = null;
let activeJobId: string | null = null;

async function runScan() {
  const res = await post("/warnings/scan/", {});
  if (res.code !== 200) {
    toast.error(res.msg || "巡检失败");
    return;
  }
  activeJobId = res.data.job_id ?? null;
  toast.success(res.data.message || "巡检已触发");
  startSummaryPolling();
  await refreshSummaryAndList();
}

function startSummaryPolling() {
  stopSummaryPolling();
  pollTimer = setInterval(async () => {
    await refreshSummaryAndList();
    const scan = summary.active_scan;
    if (!scan && activeJobId) {
      // 本轮巡检已结束
      stopSummaryPolling();
      activeJobId = null;
      toast.success("全库巡检已完成");
    }
  }, 4000);
}

function stopSummaryPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// 页面卸载时
onUnmounted(() => stopSummaryPolling());
```

### 4.4 进度展示（建议）

当 `summary.active_scan` 存在时：

| 元素 | 数据来源 |
|------|----------|
| 进度条 | `processed_count / total_count` |
| 文案 | `正在巡检：{current_qb_code}`（可为空） |
| 阶段 | `phase === "not_scanned"` →「阶段：尚未巡检」；`all_ok` →「阶段：状态良好复扫」 |
| 尚未巡检（实时） | 优先用 `active_scan.not_scanned_count`，会随轮询下降 |

按钮状态：

| `active_scan.status` | 主动巡检 | 暂停 |
|----------------------|----------|------|
| 无 | 可点 | 隐藏 |
| `running` | 禁用或 loading | 显示 |
| `paused` | 禁用 | 显示「继续」调 resume |

---

## 5. 暂停 / 继续

### 5.1 暂停

```http
POST /api/warnings/scan/{job_id}/pause/
```

- `job_id`：来自启动响应或 `active_scan.job_id`
- 成功：`message` 如「暂停请求已提交，将在当前企标处理完成后暂停」
- 下一轮轮询可见 `active_scan.status === "paused"`

### 5.2 继续

```http
POST /api/warnings/scan/{job_id}/resume/
```

- 仅 `paused` 可继续
- 成功后恢复 `running`，应继续轮询 summary

### 5.3 伪代码

```typescript
async function pauseScan(jobId: string) {
  const res = await post(`/warnings/scan/${jobId}/pause/`, {});
  if (res.code === 200) toast.success(res.data?.message ?? "已请求暂停");
}

async function resumeScan(jobId: string) {
  const res = await post(`/warnings/scan/${jobId}/resume/`, {});
  if (res.code === 200) {
    toast.success(res.data?.message ?? "巡检已继续");
    activeJobId = res.data.job_id ?? jobId;
    startSummaryPolling();
  }
}
```

---

## 6. 企标列表

### 6.1 接口

`GET /api/warnings/monitor/enterprises/?page=1&page_size=10&status=all&keyword=`

### 6.2 `status` 查询参数

| 值 | 含义 |
|----|------|
| `all` | 全部（默认） |
| `need_attention` | 需更新 |
| `all_ok` | 状态良好（含 partial） |
| `not_scanned` | 尚未巡检 |
| `no_eval_record` | 无评价记录 |

Tab 与 `status` 建议一一对应，便于用户筛选。

### 6.3 行字段 `task_conclusion`

| 值 | 列表展示建议 |
|----|--------------|
| `not_scanned` | 尚未巡检 |
| `no_eval_record` | 无评价记录 |
| `need_attention` | 需更新 |
| `all_ok` / `partial` | 状态良好 |

**不要再处理 `empty_history`**（后端已删除该类快照）。

### 6.4 明细下钻

企标号含 `/` 时：

```http
GET /api/warnings/monitor/enterprises/detail/?qb_code={encodeURIComponent(qb)}
```

勿用路径参数 `.../enterprises/{qb_code}/`。

---

## 7. 需删除或停用的前端逻辑

| 项目 | 处理 |
|------|------|
| `GET /warnings/forward-auto-list` | 删除调用 |
| `GET /warnings/list` | 删除调用 |
| 依赖 `empty_history` 的样式/筛选 | 改为 `no_eval_record` |
| 仅用 `pending_count` 表示未巡检 | 改为 `not_scanned_count` |
| 期望 POST scan 同步完成 | 改为异步 + 轮询 |
| scan 返回后只刷新一次 | 必须轮询至 `active_scan` 消失 |

---

## 8. 联调检查清单

- [ ] 本地已启动 **Celery worker**：`celery -A config.celery worker -l info`
- [ ] 已执行 `python manage.py migrate alerting`
- [ ] 点击巡检后 5～10 秒内，`not_scanned_count` 是否下降
- [ ] `GET summary` 是否出现 `active_scan`，且 `processed_count` 递增
- [ ] 暂停后 `status` 变为 `paused`，继续后恢复 `running`
- [ ] 四类数字相加是否等于总数
- [ ] 列表 Tab `not_scanned` / `no_eval_record` 筛选是否有数据
- [ ] 409 时是否有明确提示

---

## 9. 环境说明（给测试/产品）

| 现象 | 原因 |
|------|------|
| 点了巡检数字完全不变 | 未开 Celery worker |
| `processed_count` 一直为 0 | 多为僵尸 `RUNNING`（worker 未跑）；约 **10 分钟**后后端自动标 `failed`，`active_scan` 消失 |
| `pause_requested=true` 且 `status=running` | 旧版：已点暂停但 worker 未执行；新版：`processed_count=0` 时会直接变为 `paused` |
| `current_qb_code` 为 `（准备中）` 后仍长期为 0 | worker 已启动但卡在首条 `build_forward_warning`（单条很慢） |
| `current_qb_code` 一直为 null | worker **未执行** `execute_monitor_run` |
| `last_scan_at` 一直为空 | 巡检未完成或 worker 未跑完 |
| POST 409 | 上次任务仍为 running/paused（未过僵尸清理窗口） |
| 进度很慢 | 单企标需国标查新，队列约数百条，属正常 |

### 9.1 判断 Celery 是否在跑

轮询 summary 时：

- 正常：`active_scan.current_qb_code` 先变为 `（准备中）`，随后为真实企标号；`processed_count` 递增。
- 异常：超过 **10 秒** 仍为 `processed_count=0` 且 `current_qb_code` 为 null → 检查 worker 进程与 Redis。

### 9.2 `active_scan` 突然消失

后端将「超过 10 分钟无进度」的 `RUNNING` 标为 `failed` 后不再返回 `active_scan`。前端应停止轮询并提示：「上次巡检未真正执行，请确认 Celery 后重新发起」。

---

## 10. 相关文档

| 文档 | 用途 |
|------|------|
| [backend-warnings-API-前端对接手册.md](./backend-warnings-API-前端对接手册.md) | 路径与字段速查 |
| [backend-warnings-API-后端开发执行方案.md](./backend-warnings-API-后端开发执行方案.md) | 完整接口契约与枚举 |

---

**文档版本**：与后端异步巡检（`active_scan`、pause/resume、四类 summary）同步，2026-06。
