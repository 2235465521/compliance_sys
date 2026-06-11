# standards 只读 API（8.1 首期）

前缀：`/api/v1/standards`。实现复用 [`reference_resolution.py`](../backend/apps/standards/services/reference_resolution.py)，与合规步骤 3 `reference-latest`、批量引用查新逻辑一致。

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/module` | 模块元信息 |
| GET | `/resolve-latest?std_code=` | 单条标准号查新（无企标时点，兼容旧签名） |
| POST | `/resolve-latest/batch` | 最多 100 条；body `items[].referenced_std`、可选 `qb_code`、`enterprise_as_of_year` |
| GET | `/national-standard-names?codes=` | 逗号分隔标准号 → 名称（展示用） |

## 环境

- **MySQL** + 已导入 `v1.0-sql` 时返回真实谱系结果；SQLite/未导入时为 stub 或 miss（与合规模块一致）。
- 鉴权：当前与全局一致（占位 Bearer）；生产接入 `identity` 后可在 router 挂载 `BearerAuthPlaceholder` 或 JWT。

## 测试

```bash
cd backend
python manage.py test apps.standards
```
