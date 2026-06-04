# 预警模块 API — 前端对接手册

> **后端实现请以** [backend-warnings-API-后端开发执行方案.md](./backend-warnings-API-后端开发执行方案.md) **为准（含业务逻辑、分期、curl）。**  
> 本文档供前端联调速查；类型定义见 [`frontend/src/types/warnings-api.ts`](../frontend/src/types/warnings-api.ts)，HTTP 封装见 [`frontend/src/services/warnings-api.ts`](../frontend/src/services/warnings-api.ts)。

## 1. 模块与 Tab

| 顺序 | Tab | 说明 |
|------|-----|------|
| 1 | 正向预警 | 单企标：企标号查询 + 可选文件上传 |
| 2 | 反向预警 | 单国标：追溯引用企标并判断企标是否要改 |
| 3 | 实时监控 | 全库巡检汇总 + 下钻需更新企标 |

## 2. 边界行为（已拍板）

| 场景 | 行为 |
|------|------|
| 企标号无合规/批量评价记录 | 后端返回 `task_conclusion: empty_history`；前端仅展示说明，不展示比对表 |
| 文件上传通道 | 保留 `POST /analyze_qb_references_auto/` + WebSocket；解析完成后优先 `POST /warnings/forward-by-file/` 或 `GET /warnings/forward-by-qb/`；展示统一五列表格 |
| 实时监控下钻 | **Drawer** 内嵌与正向相同的五列表格 |
| 反向「企标需修改」 | 由后端 `enterprise_need_modify` 判定；前端不自行拼规则 |

## 3. 正向预警

### 3.1 `GET /warnings/forward-by-qb/`

**Query**

| 参数 | 必填 | 说明 |
|------|------|------|
| `qb_code` | 是 | 企标号 |

**响应 `data`**

```json
{
  "qb_code": "Q/XXX 001-2020",
  "enterprise_name": "某企业",
  "task_conclusion": "need_attention",
  "task_summary": "存在 2 条引用标准与上次查新结果不一致",
  "compare_rows": [
    {
      "id": "1",
      "referenced_std_code": "GB/T 1.1",
      "full_std_at_publication": "GB/T 1.1-2020",
      "baseline_latest_std": "GB/T 1.1-2020",
      "current_latest_std": "GB/T 1.1-2024",
      "row_conclusion": "updated",
      "row_conclusion_label": "需更新",
      "explanation": "可选说明"
    }
  ],
  "source_evaluations": [
    { "source_type": "compliance", "evaluated_at": "2025-01-01T00:00:00Z", "job_id": 42 }
  ]
}
```

**`task_conclusion` 枚举（预警任务级）**

| 值 | 含义 |
|----|------|
| `need_attention` | 至少一行需更新 |
| `all_ok` | 全部一致，状态良好 |
| `empty_history` | 无评价记录 |
| `pending` | 处理中 |
| `partial` | 部分需人工核对 |

**`row_conclusion` 枚举（行级，与查新一致）**

| 值 | 含义 |
|----|------|
| `unchanged` | 无变化 |
| `updated` | 需更新 |
| `first_record` | 首次建立基线 |
| `unresolved` | 无法解析现行号 |
| `not_assessable` | 不可自动比对 |

### 3.2 `POST /warnings/forward-by-file/`

**Body** `multipart/form-data`：`file`（必填），`qb_code`（可选）

响应体与 `forward-by-qb` 相同。

### 3.3 任务级结论规则（后端计算）

- 任意可比对行 `baseline_latest_std` ≠ `current_latest_std` → `need_attention`
- 全部相等且无 `updated` → `all_ok`

## 4. 反向预警

### 4.1 `GET /standards/warning-trace/`

**Query**：`bz_id`（国标号）

**响应 `data`**

```json
{
  "task_conclusion": "need_attention",
  "task_summary": "国标已更新，3 个关联企标需修改",
  "gb_novelty": {
    "input_bz": "GB/T 1.1-2009",
    "latest_bz": "GB/T 1.1-2020",
    "gb_updated": true,
    "status_label": "已更新"
  },
  "affected_enterprises": [
    {
      "qb_code": "Q/ABC 001",
      "enterprise_name": "甲公司",
      "enterprise_need_modify": true,
      "enterprise_conclusion_label": "需修改企标",
      "summary": "引用查新结果与本次国标不一致"
    }
  ]
}
```

**展示顺序**：总结论 → 国标查新块 → 企标列表。

兼容：若仅返回旧版 `input_bz` / `latest_bz` / `affected_enterprises: string[]`，前端做最小映射。

## 5. 实时监控

### 5.1 `GET /warnings/monitor/summary/`

```json
{
  "last_scan_at": "2026-05-23T10:00:00Z",
  "total_evaluated_qb": 120,
  "need_attention_count": 8,
  "all_ok_count": 112,
  "pending_count": 0
}
```

### 5.2 `GET /warnings/monitor/enterprises/`

**Query**：`page`, `page_size`, `keyword`, `status`（`need_attention` | `all_ok` | `all`）

```json
{
  "items": [
    {
      "qb_code": "Q/XXX 001",
      "enterprise_name": "某企业",
      "task_conclusion": "need_attention",
      "task_summary": "2 条引用需更新",
      "last_checked_at": "2026-05-23T10:00:00Z"
    }
  ],
  "total": 8
}
```

### 5.3 `GET /warnings/monitor/enterprises/detail/`（下钻明细，推荐）

**Query**：`qb_code`（必填）。企标号含 `/` 时必须用本接口，勿用路径参数写法。

```http
GET /api/warnings/monitor/enterprises/detail/?qb_code=Q%2F15763.2-2005
```

响应同 **3.1** `forward-by-qb`（五列明细）。

> 路径写法 `GET /warnings/monitor/enterprises/{qb_code}/` 仅适用于企标号不含 `/` 的场景；前端监控 Drawer 已统一使用 query 接口。

### 5.4 `POST /warnings/scan/`

触发全库巡检；`data` 示例：`{ "success": true, "message": "...", "job_id": "..." }`。

## 6. 前端列顺序（五列）

1. 企标文件中引用的标准号 — `referenced_std_code`
2. 补全之后的引用标准 — `full_std_at_publication`
3. 上一次规范性引用查出的最新标准号 — `baseline_latest_std`
4. 本次预警查出的最新标准号 — `current_latest_std`
5. 预警结论 — `row_conclusion` / `row_conclusion_label`

## 7. 鉴权

与合规模块一致：`Authorization: Bearer ${VITE_COMPLIANCE_API_TOKEN}`（若配置）。

## 8. 错误码

| HTTP | 说明 |
|------|------|
| 404 | 企标或国标不存在 |
| 422 | 参数无效或无历史 |
| 503 | 查新/谱系服务不可用 |

前端遇 4xx/5xx **不回退** 旧 `/warnings/list`；仅展示错误与重试。
