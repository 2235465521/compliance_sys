SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ===========================================================================
-- 清表顺序：先删子表再删主表
-- ===========================================================================
DROP TABLE IF EXISTS national_standard_index_import_history;
DROP TABLE IF EXISTS batch_normative_reference_item;
DROP TABLE IF EXISTS batch_normative_reference_job;
DROP TABLE IF EXISTS compliance_evaluation_snapshot;
DROP TABLE IF EXISTS ccs_industry_classification;
DROP TABLE IF EXISTS ics_industry_classification;
DROP TABLE IF EXISTS standard_reference_statistics;
DROP TABLE IF EXISTS standard_document_catalog;
DROP TABLE IF EXISTS standard_pedigree_relation;
DROP TABLE IF EXISTS evaluation_result;
DROP TABLE IF EXISTS compliance_evaluation_task;
DROP TABLE IF EXISTS national_standard_indicator;
DROP TABLE IF EXISTS national_standard_enterprise_mapping;
DROP TABLE IF EXISTS enterprise_standard_reference_mapping;
DROP TABLE IF EXISTS standard_pedigree;
DROP TABLE IF EXISTS enterprise_standard_basic;
DROP TABLE IF EXISTS national_standard_extension;
DROP TABLE IF EXISTS national_standard_basic;

-- ===========================================================================
-- 1. 国标基础信息主表
-- ===========================================================================
CREATE TABLE national_standard_basic (
    id                 BIGINT NOT NULL AUTO_INCREMENT,
    std_code           VARCHAR(128) NOT NULL COMMENT '国标号',
    std_name           TEXT COMMENT '标准名称',
    std_status         VARCHAR(128) DEFAULT NULL COMMENT '标准状态（Excel 原文，如废止、现行）',
    publish_date       DATE DEFAULT NULL COMMENT '发布日期',
    effective_date     DATE DEFAULT NULL COMMENT '实施日期',
    abolition_date     DATE DEFAULT NULL COMMENT '废止日期',
    std_category       VARCHAR(64) DEFAULT NULL COMMENT '标准类别',
    replaces_std_code  MEDIUMTEXT DEFAULT NULL COMMENT '代替标准',
    replace_type       VARCHAR(64) DEFAULT NULL COMMENT '代替类型：-1无；1全部代替；2部分代替；3部分代完；4未知',
    food_standard_mark INT DEFAULT NULL COMMENT '食品标准标记',
    ccs_code           VARCHAR(64) DEFAULT NULL COMMENT '中国标准分类号',
    ics_code           VARCHAR(64) DEFAULT NULL COMMENT '国际标准分类号',
    ped_id             MEDIUMTEXT DEFAULT NULL COMMENT '谱系号（可能多条，英文逗号拼接）',
    detail_url         TEXT COMMENT '详情链接',
    std_file_path      TEXT COMMENT '国标文件保存路径',
    PRIMARY KEY (id),
    UNIQUE KEY uq_national_standard_basic_std_code (std_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='国标基础信息主表';

-- ===========================================================================
-- 2. 国标基础信息扩展表
-- ===========================================================================
CREATE TABLE national_standard_extension (
    std_code                    VARCHAR(128) NOT NULL COMMENT '国标号',
    responsible_unit             TEXT COMMENT '归口单位/部门',
    secondary_responsible_unit   TEXT COMMENT '副归口单位',
    issuing_department           TEXT COMMENT '颁发部门',
    executing_unit               TEXT COMMENT '执行单位',
    technical_committee          TEXT COMMENT '技术委员会',
    governing_department         TEXT COMMENT '主管部门',
    adoption_status              TEXT COMMENT '采标情况',
    drafting_unit                TEXT COMMENT '起草单位',
    drafter                      TEXT COMMENT '起草人',
    PRIMARY KEY (std_code),
    CONSTRAINT fk_nse_std_code FOREIGN KEY (std_code) REFERENCES national_standard_basic (std_code)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='国标基础信息扩展表';

-- ===========================================================================
-- 3. 企标基础信息表
-- ===========================================================================
CREATE TABLE enterprise_standard_basic (
    id                          BIGINT NOT NULL AUTO_INCREMENT,
    qb_code                     VARCHAR(128) NOT NULL COMMENT '企标号（与映射表外键类型一致）',
    company_name                TEXT COMMENT '企业名称',
    qb_name                     TEXT COMMENT '企标名称',
    publish_date                DATE DEFAULT NULL COMMENT '发布日期',
    unified_social_credit_code  VARCHAR(32) DEFAULT NULL COMMENT '统一社会信用代码',
    indicator_set_json          JSON DEFAULT NULL COMMENT '指标集合',
    PRIMARY KEY (id),
    UNIQUE KEY uq_enterprise_standard_basic_qb_code (qb_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='企标基础信息表';

-- ===========================================================================
-- 4. 谱系表（standard_pedigree，managed=False，Django 不创建）
-- ===========================================================================
CREATE TABLE standard_pedigree (
    id               BIGINT NOT NULL AUTO_INCREMENT,
    std_code         VARCHAR(128) NOT NULL COMMENT '国标号（本标准标准号）',
    latest_std_code  MEDIUMTEXT NULL COMMENT '国标最新版本号（可能多条，顿号「、」拼接）',
    ped_id           MEDIUMTEXT NULL COMMENT '谱系号（可能多条，英文逗号拼接）',
    part_chain       MEDIUMTEXT NULL COMMENT '谱系链（完整表达式）',
    PRIMARY KEY (id),
    KEY idx_standard_pedigree_std_code (std_code),
    KEY idx_standard_pedigree_ped_id (ped_id(127))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='谱系表';

-- ===========================================================================
-- 5. 企标映射表（qb_code 用 VARCHAR(128) 与主表一致，避免外键类型不兼容）
-- ===========================================================================
CREATE TABLE enterprise_standard_reference_mapping (
    id                           BIGINT NOT NULL AUTO_INCREMENT,
    qb_code                      VARCHAR(128) NOT NULL COMMENT '企标号',
    referenced_std_code          VARCHAR(50) DEFAULT NULL COMMENT '引用国标号',
    latest_std_code              VARCHAR(50) DEFAULT NULL COMMENT '国标最新版本号',
    supplement_std_version_code  VARCHAR(50) DEFAULT NULL COMMENT '补充国标版本号',
    manual_review_status         TINYINT(1) DEFAULT NULL COMMENT '人工审核状态',
    PRIMARY KEY (id),
    KEY idx_esrm_qb_code (qb_code),
    CONSTRAINT fk_esrm_qb_code FOREIGN KEY (qb_code) REFERENCES enterprise_standard_basic (qb_code)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='企标映射表';

-- ===========================================================================
-- 6. 国标映射企标表
-- ===========================================================================
CREATE TABLE national_standard_enterprise_mapping (
    id       BIGINT NOT NULL AUTO_INCREMENT,
    std_code VARCHAR(128) NOT NULL COMMENT '国标号',
    qb_code  VARCHAR(128) NOT NULL COMMENT '企标号',
    PRIMARY KEY (id),
    UNIQUE KEY uq_ns_em_std_qb (std_code, qb_code),
    KEY idx_ns_em_qb_code (qb_code),
    CONSTRAINT fk_nsem_std_code FOREIGN KEY (std_code) REFERENCES national_standard_basic (std_code)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_nsem_qb_code FOREIGN KEY (qb_code) REFERENCES enterprise_standard_basic (qb_code)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='国标映射企标表';

-- ===========================================================================
-- 7. 国标具体指标表（managed=False，Django 不创建）
-- ===========================================================================
CREATE TABLE national_standard_indicator (
    id                       BIGINT NOT NULL AUTO_INCREMENT,
    std_code                 VARCHAR(128) NOT NULL COMMENT '国标号',
    specific_indicator_value LONGTEXT DEFAULT NULL COMMENT '国标指标集合（indexes JSON 数组，整体存储）',
    manual_review_status     ENUM('pending','approved','rejected') DEFAULT NULL COMMENT '人工审核状态(占位)',
    PRIMARY KEY (id),
    KEY idx_national_standard_indicator_std_code (std_code),
    CONSTRAINT fk_nsi_std_code FOREIGN KEY (std_code) REFERENCES national_standard_basic (std_code)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='国标具体指标表';

-- ===========================================================================
-- 8. 评价结果表
-- ===========================================================================
CREATE TABLE evaluation_result (
    id                                    BIGINT NOT NULL AUTO_INCREMENT,
    qb_code                               VARCHAR(128) NOT NULL COMMENT '企标号',
    descriptive_result                    ENUM('compliant','non_compliant','partial','unknown','not_applicable') DEFAULT NULL COMMENT '描述性结论(占位)',
    descriptive_result_report_file_path   TEXT COMMENT '描述性结论报告路径',
    reference_result                      ENUM('compliant','non_compliant','partial','unknown','not_applicable') DEFAULT NULL COMMENT '引用结论(占位)',
    reference_result_report_file_path     TEXT COMMENT '引用结论报告路径',
    indicator_result                      ENUM('compliant','non_compliant','partial','unknown','not_applicable') DEFAULT NULL COMMENT '指标结论(占位)',
    indicator_result_report_file_path     TEXT COMMENT '指标结论报告路径',
    overall_result                        ENUM('compliant','non_compliant','partial','unknown','not_applicable') DEFAULT NULL COMMENT '总结论(占位)',
    certificate_file_path                 TEXT COMMENT '证书路径',
    PRIMARY KEY (id),
    KEY idx_evaluation_result_qb_code (qb_code),
    CONSTRAINT fk_er_qb_code FOREIGN KEY (qb_code) REFERENCES enterprise_standard_basic (qb_code)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='评价结果表';

-- ===========================================================================
-- 9. 正文目录表
-- ===========================================================================
CREATE TABLE standard_document_catalog (
    id               BIGINT NOT NULL AUTO_INCREMENT,
    std_name         TEXT COMMENT '标准名称',
    std_code         VARCHAR(128) DEFAULT NULL COMMENT '国标号',
    core_keywords    TEXT COMMENT '关键词',
    content_text     TEXT COMMENT '正文',
    scope_vector     JSON DEFAULT NULL COMMENT '语义向量',
    embedding_model  VARCHAR(128) DEFAULT NULL COMMENT '向量模型名',
    PRIMARY KEY (id),
    KEY idx_standard_document_catalog_std_code (std_code),
    CONSTRAINT fk_sdc_std_code FOREIGN KEY (std_code) REFERENCES national_standard_basic (std_code)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='正文目录表';

-- ===========================================================================
-- 10. 统计表
-- ===========================================================================
CREATE TABLE standard_reference_statistics (
    id               BIGINT NOT NULL AUTO_INCREMENT,
    std_code         VARCHAR(128) NOT NULL COMMENT '国标号',
    reference_count  INT NOT NULL DEFAULT 0 COMMENT '引用次数',
    PRIMARY KEY (id),
    UNIQUE KEY uq_standard_reference_statistics_std_code (std_code),
    CONSTRAINT fk_srs_std_code FOREIGN KEY (std_code) REFERENCES national_standard_basic (std_code)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='统计表';

-- ===========================================================================
-- 11. ICS行业分类表
-- ===========================================================================
CREATE TABLE ics_industry_classification (
    id         BIGINT NOT NULL AUTO_INCREMENT,
    ics_code   VARCHAR(64) NOT NULL COMMENT '国际标准分类号',
    ics_level  SMALLINT DEFAULT NULL COMMENT '层级',
    ics_name   TEXT COMMENT '名称',
    ics_note   TEXT COMMENT '注释',
    PRIMARY KEY (id),
    UNIQUE KEY uq_ics_code (ics_code),
    KEY idx_ics_industry_classification_ics_code (ics_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='ICS行业分类表';

-- ===========================================================================
-- 12. CCS行业分类表
-- ===========================================================================
CREATE TABLE ccs_industry_classification (
    id          BIGINT NOT NULL AUTO_INCREMENT,
    ccs_code    VARCHAR(64) NOT NULL COMMENT '中国标准分类号',
    ccs_name    TEXT COMMENT '名称',
    parent_code VARCHAR(64) DEFAULT NULL COMMENT '父代码',
    ccs_note    TEXT COMMENT '备注',
    PRIMARY KEY (id),
    UNIQUE KEY uq_ccs_code (ccs_code),
    KEY idx_ccs_industry_classification_ccs_code (ccs_code),
    KEY idx_ccs_industry_classification_parent (parent_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='CCS行业分类表';

