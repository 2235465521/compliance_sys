"""
MySQL：若 compliance_evaluation_task 曾由旧脚本/残缺 DDL 导入，与 Django 模型不一致
（例如缺少 current_step），则按列检测并 ADD COLUMN 补齐。

SQLite 跳过；列已存在则跳过。不删除或改写已有列，避免破坏已有数据。
"""

from __future__ import annotations

from typing import Sequence

from django.db import migrations


_TABLE = "compliance_evaluation_task"

# (列名, ADD COLUMN 之后的类型及约束片段，与 v1.0-sql + 0003 对齐)
_MYSQL_COLUMN_SPECS: Sequence[tuple[str, str]] = (
    ("qb_code", "varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL"),
    ("current_step", "tinyint unsigned NOT NULL DEFAULT 1"),
    ("status", "varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active'"),
    ("uploaded_file_path", "text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL"),
    ("uploaded_file_name", "varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL"),
    ("parse_result_json", "json NULL"),
    ("indicator_bundle_json", "json NULL"),
    ("compare_result_json", "json NULL"),
    ("dify_run_metadata_json", "json NULL"),
    ("parse_status", "varchar(24) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed'"),
    ("parse_error", "longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL"),
    ("step4_indicators_confirmed", "tinyint(1) NOT NULL DEFAULT 0"),
    ("step5_compare_confirmed", "tinyint(1) NOT NULL DEFAULT 0"),
    ("created_at", "datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"),
    (
        "updated_at",
        "datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)",
    ),
    ("created_by", "varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL"),
)


def _ensure_task_columns(apps, schema_editor) -> None:
    connection = schema_editor.connection
    if connection.vendor != "mysql":
        return

    qtbl = connection.ops.quote_name(_TABLE)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
            """,
            [_TABLE],
        )
        if cursor.fetchone()[0] == 0:
            return

        cursor.execute(
            """
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
            """,
            [_TABLE],
        )
        existing = {row[0] for row in cursor.fetchall()}

    for col, ddl in _MYSQL_COLUMN_SPECS:
        if col in existing:
            continue
        col_q = connection.ops.quote_name(col)
        sql = f"ALTER TABLE {qtbl} ADD COLUMN {col_q} {ddl}"
        with connection.cursor() as cursor:
            cursor.execute(sql)
        existing.add(col)


class Migration(migrations.Migration):
    dependencies = [
        ("compliance", "0004_compliance_snapshot_table_comment_mysql"),
    ]

    operations = [
        migrations.RunPython(_ensure_task_columns, migrations.RunPython.noop),
    ]
