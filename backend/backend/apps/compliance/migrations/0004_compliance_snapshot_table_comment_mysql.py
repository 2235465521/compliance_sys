"""MySQL：为 compliance_evaluation_snapshot 补充表级中文 COMMENT。"""

from __future__ import annotations

from django.db import migrations


def _apply_snapshot_table_comment(apps, schema_editor) -> None:
    connection = schema_editor.connection
    if connection.vendor != "mysql":
        return
    table = "compliance_evaluation_snapshot"
    comment = "合规评价步骤快照：各向导步骤提交后的可展示 JSON 快照，便于断点恢复与审计"
    qn = connection.ops.quote_name
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
            """,
            [table],
        )
        if cursor.fetchone()[0] == 0:
            return
    with connection.cursor() as cursor:
        cursor.execute(f"ALTER TABLE {qn(table)} COMMENT = %s", [comment])


class Migration(migrations.Migration):
    dependencies = [
        ("compliance", "0003_parse_status_and_error"),
    ]

    operations = [
        migrations.RunPython(_apply_snapshot_table_comment, migrations.RunPython.noop),
    ]
