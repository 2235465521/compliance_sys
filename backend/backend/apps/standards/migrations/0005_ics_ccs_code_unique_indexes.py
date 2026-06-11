# Align DB with models: legacy tables used non-unique BTREE indexes on code columns.
# Idempotent: safe on fresh test DB (0004 already has unique) and on legacy MySQL dumps.

from django.db import migrations


def _index_exists(cursor, table: str, index_name: str) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*) FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = %s
          AND index_name = %s
        """,
        [table, index_name],
    )
    return int(cursor.fetchone()[0]) > 0


def _unique_indexes_on_column(cursor, table: str, column: str) -> list[str]:
    cursor.execute(
        """
        SELECT index_name
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = %s
          AND column_name = %s
          AND non_unique = 0
        GROUP BY index_name
        HAVING COUNT(*) = 1
        """,
        [table, column],
    )
    return [row[0] for row in cursor.fetchall()]


def _ensure_unique_code_index(
    cursor,
    *,
    table: str,
    column: str,
    legacy_index: str,
    target_unique: str,
) -> None:
    has_target = _index_exists(cursor, table, target_unique)
    has_legacy = _index_exists(cursor, table, legacy_index)
    existing_uniques = _unique_indexes_on_column(cursor, table, column)

    if has_target:
        if has_legacy:
            cursor.execute(f"ALTER TABLE `{table}` DROP INDEX `{legacy_index}`")
        return

    if existing_uniques and not has_legacy:
        # e.g. Django 0004 already created a unique index on `ics_code` / `ccs_code`
        return

    if has_legacy:
        cursor.execute(
            f"ALTER TABLE `{table}` "
            f"DROP INDEX `{legacy_index}`, "
            f"ADD UNIQUE KEY `{target_unique}` (`{column}`)"
        )
        return

    if not existing_uniques:
        cursor.execute(
            f"ALTER TABLE `{table}` ADD UNIQUE KEY `{target_unique}` (`{column}`)"
        )


def _drop_unique_if_exists(cursor, table: str, index_name: str) -> None:
    if _index_exists(cursor, table, index_name):
        cursor.execute(f"ALTER TABLE `{table}` DROP INDEX `{index_name}`")


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor != "mysql":
        return
    with schema_editor.connection.cursor() as cursor:
        _ensure_unique_code_index(
            cursor,
            table="ics_industry_classification",
            column="ics_code",
            legacy_index="idx_ics_industry_classification_ics_code",
            target_unique="ics_industry_classification_ics_code_uniq",
        )
        _ensure_unique_code_index(
            cursor,
            table="ccs_industry_classification",
            column="ccs_code",
            legacy_index="idx_ccs_industry_classification_ccs_code",
            target_unique="ccs_industry_classification_ccs_code_uniq",
        )


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor != "mysql":
        return
    with schema_editor.connection.cursor() as cursor:
        for table, column, legacy_index, target_unique in (
            (
                "ics_industry_classification",
                "ics_code",
                "idx_ics_industry_classification_ics_code",
                "ics_industry_classification_ics_code_uniq",
            ),
            (
                "ccs_industry_classification",
                "ccs_code",
                "idx_ccs_industry_classification_ccs_code",
                "ccs_industry_classification_ccs_code_uniq",
            ),
        ):
            _drop_unique_if_exists(cursor, table, target_unique)
            if not _index_exists(cursor, table, legacy_index):
                cursor.execute(
                    f"ALTER TABLE `{table}` ADD INDEX `{legacy_index}` (`{column}`)"
                )


class Migration(migrations.Migration):

    dependencies = [
        ("standards", "0004_ics_ccs_industry_classification"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
