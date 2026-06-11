# v1.0-sql — 标准库与合规模块 DDL

## 推荐导入方式

| 方式 | 说明 |
|------|------|
| **全量一体** | [`merged_all.sql`](merged_all.sql) — **14** 张业务表（含 `compliance_evaluation_snapshot`），适合 Workbench 或一次性导入 |
| **分片顺序** | [`import_all.ps1`](import_all.ps1) / [`1.py`](1.py) — 按外键依赖顺序导入 **14** 个 `standards_db_v1.0_*.sql` 分片 |

运维与开发环境请优先使用 **`merged_all.sql`** 或 **`import_all.ps1`**，避免漏表。

## 分片清单（与 `import_all.ps1` 一致）

1. `standards_db_v1.0_ccs_industry_classification.sql`
2. `standards_db_v1.0_ics_industry_classification.sql`
3. `standards_db_v1.0_national_standard_basic.sql`
4. `standards_db_v1.0_enterprise_standard_basic.sql`
5. `standards_db_v1.0_compliance_evaluation_task.sql`
6. `standards_db_v1.0_compliance_evaluation_snapshot.sql`
7. `standards_db_v1.0_standard_pedigree.sql`
8. `standards_db_v1.0_national_standard_extension.sql`
9. `standards_db_v1.0_national_standard_indicator.sql`
10. `standards_db_v1.0_standard_document_catalog.sql`
11. `standards_db_v1.0_standard_reference_statistics.sql`
12. `standards_db_v1.0_national_standard_enterprise_mapping.sql`
13. `standards_db_v1.0_enterprise_standard_reference_mapping.sql`
14. `standards_db_v1.0_evaluation_result.sql`

上述分片均已纳入仓库；若某文件缺失，脚本会 **Skip** 并告警，此时应改用 `merged_all.sql`。

## 与 Django 的关系

- 标准库业务表：**无** `apps/standards` ORM；合规/批量/查新通过 **raw SQL** 读写。
- 合规模块扩展字段、批量引用表：见 `backend/apps/compliance/migrations`、`backend/apps/batch_normative_reference/migrations`。
- 已有 SQL 库再 `migrate` 时，见 [`backend/README.md`](../backend/README.md) 中的 `--fake-initial` 说明。

## 其它脚本

- 根目录 [`standardization_platform_schema_mysql80.sql`](../standardization_platform_schema_mysql80.sql)：13 表一体脚本（**无** snapshot），略旧，仅供对照。
- 根目录 `standards_db_v1.0_standard_pedigree0.sql`：未纳入 `import_all` 序列，勿与主库混用。
