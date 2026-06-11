import os

# 本目录（new_import）增量导出 SQL，按外键依赖顺序合并。
# national_standard_enterprise_mapping 依赖 enterprise_standard_basic（不在本目录），
# 导入前需确保目标库中该表已存在；各 dump 已设 FOREIGN_KEY_CHECKS=0。
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

ORDERED_SQL_FILES = [
    "standards_db_v1.0_national_standard_basic.sql",
    "standards_db_v1.0_national_standard_extension.sql",
    "standards_db_v1.0_national_standard_indicator.sql",
    "standards_db_v1.0_national_standard_index_import_history.sql",
    "standards_db_v1.0_national_standard_enterprise_mapping.sql",
    "standards_db_v1.0_routines.sql",
]

output_file = os.path.join(SCRIPT_DIR, "merged_new_import.sql")

merged = 0
with open(output_file, "w", encoding="utf-8") as out:
    for name in ORDERED_SQL_FILES:
        path = os.path.join(SCRIPT_DIR, name)
        if not os.path.exists(path):
            print(f"跳过（不存在）: {name}")
            continue
        out.write(f"-- ========== 开始文件: {name} ==========\n")
        with open(path, "r", encoding="utf-8") as f:
            out.write(f.read())
        out.write("\n\n")
        merged += 1

print(f"合并完成，已合并 {merged}/{len(ORDERED_SQL_FILES)} 个文件 → {output_file}")
