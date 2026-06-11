# 标准化平台数据库字段说明（v1.0）

> 数据库：`standards_db_v1.0`，MySQL 8.0.40  
> 导出时间：2026-05-22  
> 共 12 张业务核心表

---

## 目录

1. [national_standard_basic — 国标基础信息主表](#1-national_standard_basic--国标基础信息主表)
2. [national_standard_extension — 国标扩展信息表](#2-national_standard_extension--国标扩展信息表)
3. [national_standard_indicator — 国标具体指标表](#3-national_standard_indicator--国标具体指标表)
4. [national_standard_enterprise_mapping — 国标映射企标表](#4-national_standard_enterprise_mapping--国标映射企标表)
5. [enterprise_standard_basic — 企标基础信息表](#5-enterprise_standard_basic--企标基础信息表)
6. [enterprise_standard_reference_mapping — 企标映射表](#6-enterprise_standard_reference_mapping--企标映射表)
7. [evaluation_result — 评价结果表](#7-evaluation_result--评价结果表)
8. [standard_document_catalog — 正文目录表](#8-standard_document_catalog--正文目录表)
9. [standard_pedigree — 谱系表](#9-standard_pedigree--谱系表)
10. [standard_reference_statistics — 引用统计表](#10-standard_reference_statistics--引用统计表)
11. [ics_industry_classification — ICS 行业分类表](#11-ics_industry_classification--ics-行业分类表)
12. [ccs_industry_classification — CCS 行业分类表](#12-ccs_industry_classification--ccs-行业分类表)

---

## 1. national_standard_basic — 国标基础信息主表

存储所有国家标准的基础信息，`std_code` 为全局唯一键，被多张表外键引用。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `std_code` | varchar(128) | NOT NULL | UNI | 国标号，全局唯一 |
| `std_name` | text | YES | | 标准名称 |
| `std_status` | varchar(128) | YES | | 标准状态（如：现行、废止） |
| `publish_date` | date | YES | | 发布日期 |
| `effective_date` | date | YES | | 实施日期 |
| `abolition_date` | date | YES | | 废止日期 |
| `std_category` | varchar(64) | YES | | 标准类别 |
| `replaces_std_code` | mediumtext | YES | | 代替标准号（可多条） |
| `replace_type` | varchar(64) | YES | | 代替类型：-1无；1全部代替；2部分代替；3部分代完；4未知 |
| `food_standard_mark` | int | YES | | 食品标准标记 |
| `ccs_code` | varchar(64) | YES | | 中国标准分类号 |
| `ics_code` | varchar(64) | YES | | 国际标准分类号 |
| `ped_id` | mediumtext | YES | | 谱系号（可多条，英文逗号拼接） |
| `detail_url` | text | YES | | 详情链接 |
| `std_file_path` | text | YES | | 国标文件保存路径 |

**约束：**
- `uq_national_standard_basic_std_code`：`std_code` 唯一索引

---

## 2. national_standard_extension — 国标扩展信息表

存储国标的组织和责任信息，以 `std_code` 为主键与主表一对一关联。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `std_code` | varchar(128) | NOT NULL | PRI | 国标号（同时是外键） |
| `responsible_unit` | text | YES | | 归口单位/部门 |
| `secondary_responsible_unit` | text | YES | | 副归口单位 |
| `issuing_department` | text | YES | | 颁发部门 |
| `executing_unit` | text | YES | | 执行单位 |
| `technical_committee` | text | YES | | 技术委员会 |
| `governing_department` | text | YES | | 主管部门 |
| `adoption_status` | text | YES | | 采标情况 |
| `drafting_unit` | text | YES | | 起草单位 |
| `drafter` | text | YES | | 起草人 |

**约束：**
- `fk_nse_std_code`：`std_code` → `national_standard_basic.std_code`（CASCADE 更新/删除）

---

## 3. national_standard_indicator — 国标具体指标表

存储由 Dify 工作流从国标文件中提取的具体指标值，每条记录对应一个指标项。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `std_code` | varchar(128) | NOT NULL | MUL | 国标号（外键） |
| `specific_indicator_value` | longtext | YES | | 国标指标集合，存储 Dify 返回的完整 `indexes` JSON 数组（每个 std_code 一行） |
| `manual_review_status` | enum('pending','approved','rejected') | YES | | 人工审核状态（占位） |

**约束：**
- `idx_national_standard_indicator_std_code`：`std_code` 索引
- `fk_nsi_std_code`：`std_code` → `national_standard_basic.std_code`（CASCADE 更新/删除）

---

## 4. national_standard_enterprise_mapping — 国标映射企标表

记录国标与企标的多对多关联关系。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `std_code` | varchar(128) | NOT NULL | MUL | 国标号（外键） |
| `qb_code` | varchar(128) | NOT NULL | MUL | 企标号（外键） |

**约束：**
- `uq_ns_em_std_qb`：`(std_code, qb_code)` 联合唯一索引
- `fk_nsem_std_code`：`std_code` → `national_standard_basic.std_code`（CASCADE）
- `fk_nsem_qb_code`：`qb_code` → `enterprise_standard_basic.qb_code`（CASCADE）

---

## 5. enterprise_standard_basic — 企标基础信息表

存储企业标准的基础信息，`qb_code` 为全局唯一键。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `qb_code` | varchar(128) | NOT NULL | UNI | 企标号，全局唯一 |
| `company_name` | text | YES | | 企业名称 |
| `qb_name` | text | YES | | 企标名称 |
| `publish_date` | date | YES | | 发布日期 |
| `unified_social_credit_code` | varchar(32) | YES | | 统一社会信用代码 |
| `indicator_set_json` | json | YES | | 指标集合（JSON 格式） |

**约束：**
- `uq_enterprise_standard_basic_qb_code`：`qb_code` 唯一索引

---

## 6. enterprise_standard_reference_mapping — 企标映射表

存储企标引用国标的映射关系，支持人工审核状态标记。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `qb_code` | varchar(128) | NOT NULL | MUL | 企标号（外键） |
| `referenced_std_code` | varchar(50) | YES | | 引用的国标号 |
| `latest_std_code` | varchar(50) | YES | | 该国标最新版本号 |
| `supplement_std_version_code` | varchar(50) | YES | | 补充国标版本号 |
| `manual_review_status` | tinyint(1) | YES | | 人工审核状态（0/1） |

**约束：**
- `idx_esrm_qb_code`：`qb_code` 索引
- `fk_esrm_qb_code`：`qb_code` → `enterprise_standard_basic.qb_code`（RESTRICT 删除，CASCADE 更新）

---

## 7. evaluation_result — 评价结果表

存储企标合规评价的最终结论，含描述性、引用、指标、总结论四个维度及对应报告路径。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `qb_code` | varchar(128) | NOT NULL | MUL | 企标号（外键） |
| `descriptive_result` | enum('compliant','non_compliant','partial','unknown','not_applicable') | YES | | 描述性结论 |
| `descriptive_result_report_file_path` | text | YES | | 描述性结论报告路径 |
| `reference_result` | enum('compliant','non_compliant','partial','unknown','not_applicable') | YES | | 引用结论 |
| `reference_result_report_file_path` | text | YES | | 引用结论报告路径 |
| `indicator_result` | enum('compliant','non_compliant','partial','unknown','not_applicable') | YES | | 指标结论 |
| `indicator_result_report_file_path` | text | YES | | 指标结论报告路径 |
| `overall_result` | enum('compliant','non_compliant','partial','unknown','not_applicable') | YES | | 总结论 |
| `certificate_file_path` | text | YES | | 证书文件路径 |

**枚举说明：**`compliant`=合规 / `non_compliant`=不合规 / `partial`=部分合规 / `unknown`=未知 / `not_applicable`=不适用

**约束：**
- `idx_evaluation_result_qb_code`：`qb_code` 索引
- `fk_er_qb_code`：`qb_code` → `enterprise_standard_basic.qb_code`（CASCADE）

---

## 8. standard_document_catalog — 正文目录表

存储国标文档的目录正文及语义向量，供全文检索和语义匹配使用。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `std_name` | text | YES | | 标准名称 |
| `std_code` | varchar(128) | YES | MUL | 国标号（外键，允许为空） |
| `core_keywords` | text | YES | | 核心关键词 |
| `content_text` | text | YES | | 正文内容 |
| `scope_vector` | json | YES | | 语义向量（JSON 格式） |
| `embedding_model` | varchar(128) | YES | | 生成向量使用的模型名 |

**约束：**
- `idx_standard_document_catalog_std_code`：`std_code` 索引
- `fk_sdc_std_code`：`std_code` → `national_standard_basic.std_code`（SET NULL 删除，CASCADE 更新）

---

## 9. standard_pedigree — 谱系表

存储标准版本谱系信息，`part_chain` 为完整谱系链表达式，供谱系图渲染使用。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `std_code` | varchar(128) | NOT NULL | MUL | 国标号（本标准） |
| `latest_std_code` | mediumtext | YES | | 最新版本号（可多条，顿号「、」拼接） |
| `ped_id` | mediumtext | YES | MUL | 谱系号（可多条，英文逗号拼接） |
| `part_chain` | mediumtext | YES | | 谱系链完整表达式 |

**索引：**
- `idx_standard_pedigree_std_code`：`std_code`
- `idx_standard_pedigree_ped_id`：`ped_id`（前缀 127 字符）

> 该表由外部导入维护，Django 中设置 `managed = False`，不参与 migrate。

---

## 10. standard_reference_statistics — 引用统计表

统计每条国标被企标引用的次数，`std_code` 唯一。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `std_code` | varchar(128) | NOT NULL | UNI | 国标号（外键，唯一） |
| `reference_count` | int | NOT NULL | | 被引用次数，默认 0 |

**约束：**
- `uq_standard_reference_statistics_std_code`：`std_code` 唯一索引
- `fk_srs_std_code`：`std_code` → `national_standard_basic.std_code`（CASCADE）

---

## 11. ics_industry_classification — ICS 行业分类表

国际标准分类（ICS）三级分类体系，共约 1402 条记录。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `ics_code` | varchar(64) | NOT NULL | UNI | 国际标准分类号（如 `01.040.11`） |
| `ics_level` | smallint | YES | | 层级（1=一级，2=二级，3=三级） |
| `ics_name` | text | YES | | 分类名称（中文） |
| `ics_note` | text | YES | | 注释说明 |

**约束：**
- `ics_industry_classification_ics_code_uniq`：`ics_code` 唯一索引

---

## 12. ccs_industry_classification — CCS 行业分类表

中国标准分类（CCS）体系，支持树形层级结构（`parent_code` 指向上级）。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `ccs_code` | varchar(64) | NOT NULL | UNI | 中国标准分类号（如 `A00`） |
| `ccs_name` | text | YES | | 分类名称（中文） |
| `parent_code` | varchar(64) | YES | MUL | 父级分类号（顶级为空） |
| `ccs_note` | text | YES | | 备注说明 |

**约束：**
- `uq_ccs_code`：`ccs_code` 唯一索引
- `idx_ccs_industry_classification_parent`：`parent_code` 索引

---

---

## 13. national_standard_index_import_history — 国标指标入库历史记录表

记录每次国标指标入库操作，供历史记录页展示；审核状态变更时同步更新。

| 字段名 | 类型 | 可空 | 键 | 说明 |
|--------|------|------|----|------|
| `id` | bigint | NOT NULL | PRI, AUTO_INCREMENT | 主键 |
| `std_code` | varchar(128) | NOT NULL | MUL | 国标号 |
| `original_filename` | varchar(512) | NOT NULL | | 上传文件名 |
| `import_status` | varchar(32) | NOT NULL | | 入库状态：`completed` / `failed` |
| `indexes_count` | int | NOT NULL | | 本次解析的 indexes 数组条目数 |
| `manual_review_status` | varchar(32) | YES | | 人工审核状态：`pending` / `approved` / `rejected` |
| `error_message` | text | YES | | 入库失败时的错误信息 |
| `created_at` | datetime(6) | NOT NULL | MUL | 入库时间 |
| `updated_at` | datetime(6) | NOT NULL | | 最后更新时间（审核状态变更时刷新） |

---

## 表关系总览

```
national_standard_basic (std_code)
    ├── national_standard_extension        (1:1, std_code FK)
    ├── national_standard_indicator        (1:N, std_code FK)
    ├── national_standard_enterprise_mapping (N:M 中间表)
    │       └── enterprise_standard_basic (qb_code)
    │               ├── enterprise_standard_reference_mapping (1:N, qb_code FK)
    │               └── evaluation_result                     (1:N, qb_code FK)
    ├── standard_document_catalog          (1:N, std_code FK, 允许 NULL)
    ├── standard_reference_statistics      (1:1, std_code FK)
    └── standard_pedigree                  (独立，std_code 无 FK 约束)

ics_industry_classification  (独立，无外键)
ccs_industry_classification  (独立，parent_code 自引用逻辑层级)
```
