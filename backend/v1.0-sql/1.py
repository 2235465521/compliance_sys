import os

# 与 import_all.ps1 中 $OrderedSqlFiles 顺序一致（外键依赖顺序）
ORDERED_SQL_FILES = [
    "standards_db_v1.0_ccs_industry_classification.sql",
    "standards_db_v1.0_ics_industry_classification.sql",
    "standards_db_v1.0_national_standard_basic.sql",
    "standards_db_v1.0_enterprise_standard_basic.sql",
    "standards_db_v1.0_compliance_evaluation_task.sql",
    "standards_db_v1.0_compliance_evaluation_snapshot.sql",
    "standards_db_v1.0_standard_pedigree.sql",
    "standards_db_v1.0_national_standard_extension.sql",
    "standards_db_v1.0_national_standard_indicator.sql",
    "standards_db_v1.0_standard_document_catalog.sql",
    "standards_db_v1.0_standard_reference_statistics.sql",
    "standards_db_v1.0_national_standard_enterprise_mapping.sql",
    "standards_db_v1.0_enterprise_standard_reference_mapping.sql",
    "standards_db_v1.0_evaluation_result.sql",
]

output_file = "merged_all.sql"

with open(output_file, "w", encoding="utf-8") as out:
    for name in ORDERED_SQL_FILES:
        if not os.path.exists(name):
            print(f"跳过（不存在）: {name}")
            continue
        out.write(f"-- ========== 开始文件: {name} ==========\n")
        with open(name, "r", encoding="utf-8") as f:
            out.write(f.read())
        out.write("\n\n")

print(f"合并完成，共 {len(ORDERED_SQL_FILES)} 个文件（按依赖顺序）→ {output_file}")
