# 合规模块第五步 · 国标指标接口 — 后端补充说明

> **文档用途**：交给后端同事实现/核对。前端第五步「有指标·查看」弹窗已对接下列契约。  
> **文档版本**：2026-05-23  
> **前端参考**：`frontend/src/services/compliance-api.ts`、`frontend/src/types/compliance-api.ts`

---

## 1. 总览：接口清单与实现状态

| 优先级 | 方法 | 路径 | 用途 | 后端状态（供核对） |
|--------|------|------|------|-------------------|
| **P0** | `PUT` | `/api/v1/compliance/evaluations/{task_id}/step/4/national-indicators` | 保存用户编辑后的指标 JSON | **已实现** |
| P1 | `GET` | 同上路径 + `?std_code=` | 弹窗加载指标明细 | **已实现** |
| P1 | `POST` | `.../national-indicators/review` | 人工「审核通过」 | **已实现** |
| P2 | — | `POST .../step/4/indicators/ensure` 响应增强 | `national_by_std_code` 带出 `manual_review_status` | **已实现** |

**说明**：前端弹窗已移除「驳回」，审核仅会提交 `manual_review_status: "approved"`。`rejected` 仍可在 schema 中保留以兼容历史数据，非必须路径。

---

## 2. 数据模型约定

### 2.1 表 `national_standard_indicator`

| 字段 | 说明 |
|------|------|
| `std_code` | 标准号；业务上每个标准号通常 **一行** 指标记录 |
| `specific_indicator_value` | **字符串**，内容为 Dify② 工作流解析出的 **indexes 数组** 的 JSON |
| `manual_review_status` | `pending` \| `approved` \| `rejected`；Dify② 入库一般为 `pending` |

### 2.2 `specific_indicator_value` 格式（与 Dify② 一致）

必须为 **JSON 数组**，数组元素为对象，推荐字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `index_name` | string | 是 | 指标名称 |
| `index_type` | string | 是 | 如「定性」「定量」「其他」 |
| `index_content` | string \| object \| array | 是 | 指标内容；可为纯文本，或嵌套 JSON 对象（多键值对） |

**示例（单条指标，内容为对象）**：

```json
[
  {
    "index_name": "外观",
    "index_type": "定性",
    "index_content": "无色透明液体"
  },
  {
    "index_name": "放射性核素",
    "index_type": "定量",
    "index_content": {
      "工作台、设备表面、墙壁等": "4×10 Bq/cm²",
      "工作服、工作鞋": "4×10 Bq/cm²"
    }
  }
]
```

入库/出库时：整段数组 **序列化为字符串** 存入 `specific_indicator_value` 字段（与现有 Dify② `_upsert_national_indicator_json` 一致）。

---

## 3. 【必做】PUT — 保存编辑后的指标

### 3.1 基本信息

```
PUT /api/v1/compliance/evaluations/{task_id}/step/4/national-indicators
Content-Type: application/json
```

- `{task_id}`：合规评价任务 ID（与其它 step/4 接口一致）
- 需校验任务存在（`get_compliance_task_or_404`）
- MySQL 环境要求与现有 GET/review 一致

### 3.2 请求体 `NationalIndicatorSaveIn`

```json
{
  "std_code": "GB/T 1628-2020",
  "specific_indicator_value": "[{\"index_name\":\"外观\",\"index_type\":\"定性\",\"index_content\":\"无色透明液体\"}]"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `std_code` | string | 是 | 标准号，trim 后非空 |
| `specific_indicator_value` | string | 是 | **完整** indexes JSON 字符串（非对象，是已序列化的字符串） |

**服务端校验建议**：

1. `std_code` 非空，否则 `422`
2. `specific_indicator_value` 可 `json.loads`，且结果为 **list**
3. 列表每项为 dict，且含 `index_name`、`index_type`、`index_content`（类型校验可宽松）
4. 无对应 `std_code` 记录时 `404`

**业务规则**：

- **只更新** `specific_indicator_value`
- **不要** 在保存时自动将 `manual_review_status` 改为 `approved`（保持原值，通常为 `pending`）
- 用户编辑后若需参与对比编排，仍须单独调用 `POST .../review` 审核通过

### 3.3 响应 200 `NationalIndicatorSaveOut`

```json
{
  "id": 12345,
  "std_code": "GB/T 1628-2020",
  "specific_indicator_value": "[{\"index_name\":\"外观\",...}]",
  "manual_review_status": "pending"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 更新后的记录主键 |
| `std_code` | string | 标准号 |
| `specific_indicator_value` | string | 入库后的值（可与请求一致） |
| `manual_review_status` | string \| null | 当前审核状态（未改则仍为 `pending`） |

### 3.4 错误码

| HTTP | 场景 |
|------|------|
| 422 | `std_code` 为空；`specific_indicator_value` 非合法 JSON 或非数组 |
| 404 | 任务不存在；或该 `std_code` 无指标记录 |
| 503 | 非 MySQL 等与现有 compliance 接口一致 |

### 3.5 实现参考（SQL）

```sql
UPDATE national_standard_indicator
SET specific_indicator_value = %s
WHERE std_code = %s
```

`rowcount = 0` → 404。

### 3.6 建议 Pydantic Schema（后端）

```python
class NationalIndicatorSaveIn(BaseModel):
    std_code: str = Field(..., min_length=1)
    specific_indicator_value: str = Field(..., min_length=1)

class NationalIndicatorSaveOut(BaseModel):
    id: int
    std_code: str
    specific_indicator_value: str
    manual_review_status: ManualReviewStatus | None = None
```

路由注册示例：与 GET 同路径，方法为 `PUT`；handler 名如 `put_national_indicator_save`。

---

## 4. 【核对】GET — 查询国标指标明细

```
GET /api/v1/compliance/evaluations/{task_id}/step/4/national-indicators?std_code=GB/T%201628-2020
```

### 4.1 响应 200 `NationalIndicatorListOut`

```json
{
  "std_code": "GB/T 1628-2020",
  "std_name": "工业用冰乙酸",
  "rows": [
    {
      "id": 12345,
      "std_code": "GB/T 1628-2020",
      "specific_indicator_value": "[{...}]",
      "manual_review_status": "pending"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `std_name` | 来自 `national_standard_basic`（或现有 `_national_std_row`） |
| `rows` | 该 `std_code` 下所有 `national_standard_indicator` 行，通常 1 条 |
| `rows[].manual_review_status` | **必须返回**，供弹窗展示「待审核 / 已审核通过」 |

### 4.2 错误码

| HTTP | 场景 |
|------|------|
| 422 | `std_code`  query 为空 |
| 404 | 无该标准指标记录 |

---

## 5. 【核对】POST — 人工审核

```
POST /api/v1/compliance/evaluations/{task_id}/step/4/national-indicators/review
Content-Type: application/json
```

### 5.1 请求体 `NationalIndicatorReviewIn`

```json
{
  "std_code": "GB/T 1628-2020",
  "manual_review_status": "approved"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `std_code` | 是 | 标准号 |
| `manual_review_status` | 是 | 前端当前仅发 **`approved`**；可保留 `rejected` / `pending` 枚举 |

### 5.2 响应 200 `NationalIndicatorReviewOut`

```json
{
  "id": 12345,
  "std_code": "GB/T 1628-2020",
  "manual_review_status": "approved"
}
```

### 5.3 实现参考（SQL）

```sql
UPDATE national_standard_indicator
SET manual_review_status = %s
WHERE std_code = %s
```

---

## 6. 【可选】ensure 响应与 `all_ready` 语义

### 6.1 `POST .../step/4/indicators/ensure`

响应中 `national_by_std_code[std_code]` 每项需包含：

```json
{
  "id": 12345,
  "std_code": "GB/T 1628-2020",
  "specific_indicator_value": "[...]",
  "manual_review_status": "pending"
}
```

前端在 GET 失败时会用 ensure 缓存兜底展示弹窗；**缺少 `manual_review_status` 会导致审核状态展示不准**。

### 6.2 `all_ready`（产品可选，非阻塞联调）

- **现状**：前端以 `missing_gb_files` 为空等条件判断能否「构建对比预览」
- **可选增强**：若要求「须审核通过才能对比」，可将 `all_ready` 定义为：③ 涉及标准均有指标且 `manual_review_status = 'approved'`

未改前，审核与对比编排可解耦。

---

## 7. 前端调用时序（联调参考）

```
用户点击「有指标·查看」
  → GET  national-indicators?std_code=     （失败则用 ensure 缓存）

用户点击「编辑」→ 改表格 →「保存」
  → PUT  national-indicators  { std_code, specific_indicator_value }
  → 再次 GET 刷新弹窗
  → 父组件 POST ensure 刷新③列表状态

用户点击「审核通过」
  → POST national-indicators/review  { std_code, manual_review_status: "approved" }
  → GET + POST ensure
```

---

## 8. 联调 curl 示例

将 `{host}`、`{task_id}`、`{token}` 替换为实际值。

**查询明细**：

```bash
curl -s "{host}/api/v1/compliance/evaluations/{task_id}/step/4/national-indicators?std_code=GB/T%201628-2020" \
  -H "Authorization: Bearer {token}"
```

**保存编辑**（本次需新增）：

```bash
curl -s -X PUT "{host}/api/v1/compliance/evaluations/{task_id}/step/4/national-indicators" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d "{\"std_code\":\"GB/T 1628-2020\",\"specific_indicator_value\":\"[{\\\"index_name\\\":\\\"外观\\\",\\\"index_type\\\":\\\"定性\\\",\\\"index_content\\\":\\\"测试\\\"}]\"}"
```

**审核通过**：

```bash
curl -s -X POST "{host}/api/v1/compliance/evaluations/{task_id}/step/4/national-indicators/review" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d "{\"std_code\":\"GB/T 1628-2020\",\"manual_review_status\":\"approved\"}"
```

---

## 9. 后端实现 Checklist

- [x] **P0** 新增 `PUT .../step/4/national-indicators`（`NationalIndicatorSaveIn` / `NationalIndicatorSaveOut`）
- [x] **P0** PUT：校验 JSON 数组格式；404/422 与上文一致
- [x] **P1** 确认 `GET .../national-indicators` 返回 `manual_review_status`
- [x] **P1** 确认 `POST .../national-indicators/review` 可用
- [x] **P2** 确认 `POST .../indicators/ensure` 的 `national_by_std_code` 含 `manual_review_status`
- [x] 单测：pending → PUT 改内容（仍为 pending）→ review approved → GET 内容一致

---

## 10. 相关文档

| 文档 | 说明 |
|------|------|
| `docs/backend-compliance-step5-national-indicator-review-API.md` | 同主题详细版（含 mermaid 时序） |
| `docs/backend-compliance-step5-indicator-ensure-API变更说明.md` | ensure 编排接口 |

---

## 11. 版本记录

| 日期 | 说明 |
|------|------|
| 2026-05-23 | 初版：面向后端交接；突出 PUT 保存接口与 indexes JSON 契约 |
| 2026-05-24 | 后端实现 PUT 保存；GET/review/ensure 已联调通过 |
