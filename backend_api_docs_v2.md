# 标准管理系统 - 后端接口详细文档 (v2.0)

本文档详尽描述了标准管理系统后端的 API 接口，涵盖标准管理、AI 辅助分析、查重预警及数据可视化等核心模块。

## 1. 基础信息

- **Base URL**: `/api/`
- **数据格式**: `Content-Type: application/json`
- **常用状态码**:
  - `200`: 请求成功
  - `201`: 创建成功
  - `400`: 请求参数错误
  - `404`: 资源不存在
  - `500`: 服务器内部错误

---

## 2. 标准核心管理模块 (StdBaseViewSet)

本模块前缀为 `/api/standards/`。

### 2.1 列表/过滤/搜索标准
- **URL**: `GET /api/standards/`
- **Query 参数**:
  - `ex_state` (可选): 执行状态 (如：现行, 废止, 即将实施)
  - `search` (可选): 全局搜索 (匹配 `bz_id` 或 `bz_name`)
- **响应报文**:
  ```json
  {
      "count": 100,
      "next": "...",
      "previous": null,
      "results": [
          {
              "id": 1,
              "bz_id": "GB/T 1.1-2020",
              "bz_name": "标准化工作导则 第1部分",
              "bz_release_date": "2020-03-31",
              "implement_time": "2020-10-01",
              "ex_state": "现行",
              "replace_bz_id": "GB/T 1.1-2009",
              "tree_id": "T001"
          }
      ]
  }
  ```

### 2.2 查询标准最新状态 (溯源链)
- **URL**: `GET /api/standards/check-latest/`
- **Query 参数**: `bz_id=GB/T 1.1-2009`
- **响应报文**:
  ```json
  {
      "query_bz_id": "GB/T 1.1-2009",
      "is_latest": false,
      "current_latest_id": "GB/T 1.1-2020",
      "pedigree_chain": "{GB/T 1.1-2020}、{GB/T 1.1-2009}"
  }
  ```

### 2.3 导出合规性报表 (Excel)
- **URL**: `POST /api/standards/export-report/` (也支持 GET 单条)
- **请求报文**:
  ```json
  {
      "bz_ids": ["GB/T 1.1-2020", "GB/T 20000.1-2014"]
  }
  ```
- **响应**: 返回 `.xlsx` 文件流。

### 2.3.1 导出单条合规性报表 (兼容模式)
- **URL**: `GET /api/standards/export-report/`
- **Query 参数**: `bz_id=Q/ABC 001-2026`
- **响应**: 返回 `.xlsx` 文件流。

### 2.3.2 导出批量合规性报表 (推荐)
- **URL**: `POST /api/standards/export-report/`
- **请求报文**:
  ```json
  {
      "bz_ids": ["Q/ABC 001-2026", "Q/XYZ 003-2025"]
  }
  ```
- **响应**: 返回 `.xlsx` 文件流。

### 2.4 工作台基础搜索
- **URL**: `GET /api/standards/basic-search/`
- **Query 参数**: `q=关键字`
- **响应报文**:
  ```json
  {
      "code": 200,
      "msg": "success",
      "data": [
          {
              "id": 1,
              "bz_id": "GB/T 1.1-2020",
              "bz_name": "...",
              "ex_state": "现行",
              "release_date": "2020-03-31",
              "implement_time": "2020-10-01"
          }
      ]
  }
  ```

### 2.5 级联依赖反向预警追踪
- **URL**: `GET /api/standards/warning-trace/`
- **Query 参数**: `bz_id=GB/T 1.1-2009`
- **说明**: 分析某国标废止后，受影响的企标列表。
- **响应报文**:
  ```json
  {
      "code": 200,
      "msg": "success",
      "data": {
          "is_safe": false,
          "input_bz": "GB/T 1.1-2009",
          "latest_bz": "GB/T 1.1-2020",
          "affected_enterprises": ["Q/ABC 001", "Q/XYZ 002"]
      }
  }
  ```

### 2.6 标准下载 (PDF)
- **URL**: `GET /api/standards/download-doc/`
- **Query 参数**: `bz_id=GB/T 1.1-2020`
- **响应**: 返回 PDF 文件流。若文件不存在返回 404 及错误信息。

### 2.7 工作台大扫除/生命周期提醒
- **URL**: `GET /api/standards/dashboard-alerts/`
- **说明**: 自动将到期的“即将实施”标准转为“现行”，并返回近期的生效与废止通知。
- **响应报文**:
  ```json
  {
      "code": 200,
      "data": {
          "upcoming": [{"bz_id": "...", "days_left": 5}],
          "abolished": [{"new_bz_id": "...", "old_bz_id": "...", "message": "..."}]
      }
  }
  ```

---

## 3. AI & Dify 深度解析模块 (views_dify.py)

### 3.1 规范性引用合规性评价 (AI 驱动)
- **URL**: `POST /api/check_references/`
- **请求报文**:
  ```json
  {
      "qibiao_release_date": "2023-01-01",
      "references": [
          { "standard_id": "GB/T 1.1", "has_year": false, "full_text": "GB/T 1.1 标准化工作导则" }
      ]
  }
  ```
- **响应报文**:
  ```json
  {
      "success": true,
      "evaluation_results": [
          {
              "original_text": "...",
              "status": "有效",
              "message": "该 GB/T 1.1-2020 能够继续使用。"
          }
      ]
  }
  ```

### 3.2 提取并插入标准指标
- **URL**: `POST /api/insert_indexes/`
- **请求报文**:
  ```json
  {
      "bz_id": "GB/T 12345-2023",
      "indexes": [
          { "index_name": "抗拉强度", "index_type": "具体值", "index_context": ">= 300MPa" }
      ]
  }
  ```
- **响应报文**: `{"success": true, "message": "..."}`

### 3.2.1 批量解析并入库规范性引用 (当前前端主流程)
- **URL**: `POST /api/standards/batch-references/`
- **请求格式**: `multipart/form-data`
- **请求字段**:
  - `file`（单文件，兼容字段）
  - `files` / `files[]`（多文件）
  - `bz_id`（可选）
- **说明**: 当前合规向导第1步默认调用该接口处理规范性引用解析与入库链路。
- **响应示例**:
  ```json
  {
      "success": true,
      "data": {
          "references": [
              { "standard_id": "GB/T601-2016", "reference_name": "..." }
          ]
      }
  }
  ```

### 3.2.2 批量解析并入库企标指标 (当前前端主流程)
- **URL**: `POST /api/standards/batch-indexes/`
- **请求格式**: `multipart/form-data`
- **请求字段**:
  - `file`（单文件，兼容字段）
  - `files` / `files[]`（多文件）
  - `bz_id`（可选）
- **说明**: 当前合规向导第1步并行调用该接口处理企标指标提取与入库。
- **响应示例**:
  ```json
  {
      "success": true,
      "data": {
          "indexes": [
              { "index_name": "技术要求", "index_context": "..." }
          ]
      }
  }
  ```

### 3.3 审核员裁决提交
- **URL**: `POST /api/audit/submit/`
- **请求报文**:
  ```json
  {
      "id": 1,
      "action": "approve",
      "modified_content": {"提取内容": "修改后的值"},
      "modified_bz_id": "GB/T 123",
      "modified_index_name": "指标名"
  }
  ```

### 3.3.1 获取待审核指标列表
- **URL**: `GET /api/audit/pending_indexes/`
- **说明**: 返回状态为 `status=0` 的待审核数据，供第3步人工审核使用。
- **响应示例**:
  ```json
  {
      "success": true,
      "data": [
          {
              "id": 1,
              "bz_id": "Q/ABC 001-2026",
              "index_name": "技术要求",
              "index_context": "...",
              "status": 0
          }
      ]
  }
  ```

### 3.3.2 批量审核裁决提交
- **URL**: `POST /api/audit/bulk_submit/`
- **请求报文**:
  ```json
  {
      "ids": [1, 2, 3],
      "action": "approve"
  }
  ```
- **说明**: 第3步“一键通过/一键驳回”使用该接口。

### 3.4 异步企标附件解析 (Celery)
- **URL**: `POST /api/analyze_qb_references_auto/`
- **说明**: 上传文件（Multipart），后端存入共享目录并触发 AI 解析任务。
- **响应报文**: `{"code": 200, "msg": "✅ 文件已成功移交后台 AI 引擎！..."}`

### 3.5 前言修订差异提取
- **URL**: `GET /api/dify/preface-diff/`
- **Query 参数**: `bz_id=GB/T 1.1-2020`
- **说明**: 优先返回缓存。若无，则扫盘并触发 AI 深度提取。
- **响应报文**:
  ```json
  {
      "code": 200,
      "status": "ready",
      "data": { "a": ["修订项1"], "b": ["修订项2"], "c": ["修订项3"] }
  }
  ```

### 3.6 引用映射保存 (旧引用编号 -> 最新标准编号)
- **URL**: `POST /api/save_mapping/`
- **兼容 URL**: `POST /api/mapping/save/`
- **请求报文**:
  ```json
  {
      "enterprise_bz_id": "GB/T601-2016",
      "national_bz_id": "GB/T601-2020"
  }
  ```
- **说明**: 第4步“人工审核数据完整并存入映射”会按行批量调用该接口。

### 3.7 指标库查询 (比对数据源)
- **URL**: `GET /api/indexes_table/`
- **Query 参数**:
  - `bz_id`（可选，按标准编号过滤）
- **说明**: 第5步技术指标对比的数据源接口。
- **响应示例**:
  ```json
  {
      "data": [
          {
              "id": 101,
              "bz_id": "GB/T601-2020",
              "index_name": "技术要求",
              "index_context": "..."
          }
      ]
  }
  ```

---

## 4. 查重与语义分析模块 (views_duplicate.py)

### 4.1 字面名称查重 (一审)
- **URL**: `POST /api/duplicate/name-check/`
- **请求报文**: `{"keyword": "电池回收"}`
- **说明**: 关键词可以是编号或名称。相似度 > 40% 的结果将被返回。
- **响应报文**:
  ```json
  {
      "success": true,
      "data": [
          { "bz_id": "...", "bz_name": "...", "status": "现行", "similarity": 85.0 }
      ]
  }
  ```

### 4.2 AI 语义碰撞分析 (二审)
- **URL**: `POST /api/duplicate/semantic-check/`
- **请求报文**:
  ```json
  {
      "intent_text": "详细的立项意图描述...",
      "candidate_ids": ["GB/T 123", "GB/T 456"]
  }
  ```
- **响应报文**: `{"success": true, "task_id": "sem_...", "message": "..."}`

---

## 5. 实时预警巡检模块 (views.py)

### 5.1 主动巡检触发
- **URL**: `POST /api/warnings/scan`
- **说明**: 后端扫描是否存在“新老王同台”（父子双现行）冲突，并自动修复老标准状态为“废止”，生成预警记录。
- **响应报文**: `{"success": True, "message": "巡检完成！发现并处理了 X 条冲突！"}`

### 5.2 获取未读预警列表
- **URL**: `GET /api/warnings/list`
- **响应报文**:
  ```json
  {
      "success": true,
      "unread_count": 5,
      "data": [
          {
              "id": 1,
              "old_bz_id": "...",
              "new_bz_id": "...",
              "quote_bz": "受到影响的企标列表",
              "is_read": false,
              "create_time": "..."
          }
      ]
  }
  ```

---

## 6. 数据可视化 (ECharts)

### 6.1 获取演变家族树数据
- **URL**: `GET /api/get_tree_data/`
- **Query 参数**: `bz_id=GB/T 1.1`
- **响应报文**:
  ```json
  {
      "code": 200,
      "data": {
          "nodes": [{"id": "...", "name": "...", "ex_state": "现行"}],
          "links": [{"source": "...", "target": "...", "relation_type": "全部代替"}]
      }
  }
  ```

---

## 7. 其他关键接口

- **大屏统计**: `GET /api/standards/statistics/`
  返回按标准前缀 (GB, QB等) 和执行状态分类的数量统计。
- **批量审核**: `POST /api/audit/bulk_submit/`
  接收 `ids` (ID列表), `action` (approve/reject), 和 `edited_records` (修改后的结构化数据)。

---

**附录: 字段说明**
- `status` (IndexTable): 0-待审核, 1-审核通过, 2-审核驳回
- `relation_type` (Relation): 0-部分代替, 1-全部代替, 2-部分代完
- `ex_state`: 现行 / 废止 / 即将实施 / 历史 (其他)
