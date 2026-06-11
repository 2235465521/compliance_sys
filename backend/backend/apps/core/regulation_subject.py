"""STSC L3 regulation 表集中访问（锚表、映射、评价结论、指标、文件覆盖）。"""

from __future__ import annotations

from typing import Any

from django.db import connection

# L3 表名
ANCHOR_TABLE = "regulation_evaluated_standard_basic"
MAPPING_TABLE = "regulation_normative_reference_mapping"
EVAL_RESULT_TABLE = "regulation_evaluation_result"
INDICATOR_TABLE = "regulation_standard_indicator"
FILE_OVERRIDE_TABLE = "regulation_standard_file_override"

# 企标 catalog_std_type_no 为 NULL；国标指标行常用 00
GB_CATALOG_TYPE_NO = "00"


def subject_where_sql(
    catalog_std_type_no: str | None,
    subject_code: str,
) -> tuple[str, list[Any]]:
    """STSC 主体键匹配：``catalog_std_type_no <=> %s AND subject_code = %s``（企标 type 为 NULL）。"""
    return "catalog_std_type_no <=> %s AND subject_code = %s", [
        catalog_std_type_no,
        (subject_code or "").strip(),
    ]


def subject_keys_from_anchor_id(cursor: Any, anchor_id: int) -> tuple[str | None, str]:
    cursor.execute(
        f"""
        SELECT catalog_std_type_no, subject_code
        FROM {ANCHOR_TABLE}
        WHERE id = %s
        LIMIT 1
        """,
        [int(anchor_id)],
    )
    row = cursor.fetchone()
    if not row:
        raise ValueError(f"锚表行不存在: id={anchor_id}")
    subj = (row[1] or "").strip()
    if not subj:
        raise ValueError(f"锚表 subject_code 为空: id={anchor_id}")
    return row[0], subj


def table_exists(table_name: str) -> bool:
    if connection.vendor != "mysql":
        return False
    with connection.cursor() as c:
        c.execute(
            """
            SELECT 1 FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
            LIMIT 1
            """,
            [table_name],
        )
        return c.fetchone() is not None


def upsert_enterprise_anchor(
    cursor: Any,
    *,
    subject_code: str,
    company_name: str = "",
    subject_name: str = "",
) -> int:
    """插入或更新企标锚行，返回 anchor id。"""
    code = (subject_code or "").strip()
    if not code:
        raise ValueError("subject_code 必填")
    cursor.execute(
        f"""
        INSERT INTO {ANCHOR_TABLE}
            (catalog_std_type_no, subject_code, company_name, subject_name)
        VALUES (NULL, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            company_name = VALUES(company_name),
            subject_name = VALUES(subject_name)
        """,
        [code, company_name or "", subject_name or ""],
    )
    anchor_id = get_enterprise_anchor_id(cursor, code)
    if anchor_id is None:
        raise RuntimeError(f"锚表写入后未找到 subject_code={code!r}")
    return anchor_id


def get_enterprise_anchor_id(cursor: Any, subject_code: str) -> int | None:
    code = (subject_code or "").strip()
    if not code:
        return None
    cursor.execute(
        f"""
        SELECT id FROM {ANCHOR_TABLE}
        WHERE subject_code = %s AND catalog_std_type_no IS NULL
        LIMIT 1
        """,
        [code],
    )
    row = cursor.fetchone()
    return int(row[0]) if row else None


def update_anchor_indicator_set_json(cursor: Any, subject_code: str, indicator_json: str) -> None:
    cursor.execute(
        f"""
        UPDATE {ANCHOR_TABLE} SET indicator_set_json = %s
        WHERE subject_code = %s AND catalog_std_type_no IS NULL
        """,
        [indicator_json, subject_code],
    )


def delete_reference_mappings_for_anchor(cursor: Any, anchor_id: int) -> None:
    cat, subj = subject_keys_from_anchor_id(cursor, anchor_id)
    where_sql, params = subject_where_sql(cat, subj)
    cursor.execute(f"DELETE FROM {MAPPING_TABLE} WHERE {where_sql}", params)


def insert_reference_mapping_row(
    cursor: Any,
    *,
    anchor_id: int,
    compliance_task_id: int | None,
    referenced_std_code: str | None,
    latest_std_code: str | None,
) -> None:
    cat, subj = subject_keys_from_anchor_id(cursor, anchor_id)
    cursor.execute(
        f"""
        INSERT INTO {MAPPING_TABLE}
        (catalog_std_type_no, subject_code, compliance_task_id, referenced_std_code,
         latest_std_code, supplement_std_version_code, manual_review_status)
        VALUES (%s, %s, %s, %s, %s, NULL, NULL)
        """,
        [
            cat,
            subj,
            compliance_task_id,
            (referenced_std_code or "").strip() or None,
            (latest_std_code or "").strip() or None,
        ],
    )


def insert_supplement_mapping_row(
    cursor: Any,
    *,
    anchor_id: int,
    compliance_task_id: int | None,
    latest_std_code: str,
) -> None:
    cat, subj = subject_keys_from_anchor_id(cursor, anchor_id)
    cursor.execute(
        f"""
        INSERT INTO {MAPPING_TABLE}
        (catalog_std_type_no, subject_code, compliance_task_id, referenced_std_code,
         latest_std_code, supplement_std_version_code, manual_review_status)
        VALUES (%s, %s, %s, NULL, %s, NULL, NULL)
        """,
        [cat, subj, compliance_task_id, latest_std_code.strip()],
    )


def list_reference_std_codes_for_anchor(cursor: Any, anchor_id: int) -> list[str]:
    cat, subj = subject_keys_from_anchor_id(cursor, anchor_id)
    where_sql, params = subject_where_sql(cat, subj)
    cursor.execute(
        f"""
        SELECT referenced_std_code, MIN(id) AS sort_id
        FROM {MAPPING_TABLE}
        WHERE {where_sql}
          AND referenced_std_code IS NOT NULL AND TRIM(referenced_std_code) <> ''
        GROUP BY referenced_std_code
        ORDER BY sort_id
        """,
        params,
    )
    return [r[0].strip() for r in cursor.fetchall()]


def list_latest_std_codes_for_anchor(cursor: Any, anchor_id: int) -> list[str]:
    cat, subj = subject_keys_from_anchor_id(cursor, anchor_id)
    where_sql, params = subject_where_sql(cat, subj)
    cursor.execute(
        f"""
        SELECT DISTINCT latest_std_code
        FROM {MAPPING_TABLE}
        WHERE {where_sql}
          AND latest_std_code IS NOT NULL AND TRIM(latest_std_code) <> ''
        """,
        params,
    )
    codes = [r[0].strip() for r in cursor.fetchall()]
    return list(dict.fromkeys(codes))


def update_mapping_manual_review_status(cursor: Any, row_id: int, status: Any) -> None:
    cursor.execute(
        f"UPDATE {MAPPING_TABLE} SET manual_review_status = %s WHERE id = %s",
        [status, int(row_id)],
    )


def fetch_mapping_rows_for_anchor(cursor: Any, anchor_id: int) -> list[dict[str, Any]]:
    cat, subj = subject_keys_from_anchor_id(cursor, anchor_id)
    where_sql, params = subject_where_sql(cat, subj)
    cursor.execute(
        f"""
        SELECT id, referenced_std_code, latest_std_code, manual_review_status
        FROM {MAPPING_TABLE}
        WHERE {where_sql}
        ORDER BY id
        """,
        params,
    )
    cols = ["id", "referenced_std_code", "latest_std_code", "manual_review_status"]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def evaluation_result_where(task_id: int) -> tuple[str, list[Any]]:
    return "compliance_task_id = %s", [task_id]


def ensure_evaluation_result_row(cursor: Any, *, task_id: int, anchor_id: int) -> None:
    where_sql, params = evaluation_result_where(task_id)
    cursor.execute(
        f"SELECT id FROM {EVAL_RESULT_TABLE} WHERE {where_sql} LIMIT 1",
        params,
    )
    if cursor.fetchone():
        return
    cat, subj = subject_keys_from_anchor_id(cursor, anchor_id)
    cursor.execute(
        f"""
        INSERT INTO {EVAL_RESULT_TABLE} (compliance_task_id, catalog_std_type_no, subject_code)
        VALUES (%s, %s, %s)
        """,
        [task_id, cat, subj],
    )


def delete_evaluation_result_for_task(cursor: Any, task_id: int) -> None:
    where_sql, params = evaluation_result_where(task_id)
    cursor.execute(f"DELETE FROM {EVAL_RESULT_TABLE} WHERE {where_sql}", params)


def upsert_gb_indicator_json(cursor: Any, subject_code: str, indexes_json: str) -> None:
    code = (subject_code or "").strip()
    cursor.execute(
        f"""
        DELETE FROM {INDICATOR_TABLE}
        WHERE subject_code = %s AND catalog_std_type_no = %s
        """,
        [code, GB_CATALOG_TYPE_NO],
    )
    cursor.execute(
        f"""
        INSERT INTO {INDICATOR_TABLE}
        (catalog_std_type_no, subject_code, specific_indicator_value, manual_review_status)
        VALUES (%s, %s, %s, 'pending')
        """,
        [GB_CATALOG_TYPE_NO, code, indexes_json],
    )


def fetch_gb_indicator_rows(cursor: Any, subject_code: str) -> list[dict[str, Any]]:
    cursor.execute(
        f"""
        SELECT id, subject_code, specific_indicator_value, manual_review_status
        FROM {INDICATOR_TABLE}
        WHERE subject_code = %s AND catalog_std_type_no = %s
        """,
        [subject_code.strip(), GB_CATALOG_TYPE_NO],
    )
    return [
        {
            "id": r[0],
            "std_code": r[1],
            "specific_indicator_value": r[2],
            "manual_review_status": r[3],
        }
        for r in cursor.fetchall()
    ]


def has_gb_indicator_rows(cursor: Any, subject_code: str) -> bool:
    cursor.execute(
        f"""
        SELECT specific_indicator_value FROM {INDICATOR_TABLE}
        WHERE subject_code = %s AND catalog_std_type_no = %s
        LIMIT 1
        """,
        [subject_code.strip(), GB_CATALOG_TYPE_NO],
    )
    row = cursor.fetchone()
    if not row or row[0] is None:
        return False
    val = str(row[0]).strip()
    return bool(val) and val != "[]"


def update_gb_indicator_review(cursor: Any, subject_code: str, status: str) -> int:
    cursor.execute(
        f"""
        UPDATE {INDICATOR_TABLE}
        SET manual_review_status = %s
        WHERE subject_code = %s AND catalog_std_type_no = %s
        """,
        [status, subject_code.strip(), GB_CATALOG_TYPE_NO],
    )
    return cursor.rowcount


def update_gb_indicator_value(cursor: Any, subject_code: str, indexes_json: str) -> int:
    cursor.execute(
        f"""
        UPDATE {INDICATOR_TABLE}
        SET specific_indicator_value = %s
        WHERE subject_code = %s AND catalog_std_type_no = %s
        """,
        [indexes_json, subject_code.strip(), GB_CATALOG_TYPE_NO],
    )
    return cursor.rowcount


def get_file_override_path(cursor: Any, subject_code: str) -> str | None:
    cursor.execute(
        f"""
        SELECT file_path FROM {FILE_OVERRIDE_TABLE}
        WHERE subject_code = %s AND catalog_std_type_no = %s
        LIMIT 1
        """,
        [subject_code.strip(), GB_CATALOG_TYPE_NO],
    )
    row = cursor.fetchone()
    return (row[0] or None) if row else None


def upsert_file_override(cursor: Any, subject_code: str, file_path: str) -> None:
    code = subject_code.strip()
    cursor.execute(
        f"""
        SELECT id FROM {FILE_OVERRIDE_TABLE}
        WHERE subject_code = %s AND catalog_std_type_no = %s
        LIMIT 1
        """,
        [code, GB_CATALOG_TYPE_NO],
    )
    row = cursor.fetchone()
    if row:
        cursor.execute(
            f"UPDATE {FILE_OVERRIDE_TABLE} SET file_path = %s WHERE id = %s",
            [file_path, row[0]],
        )
    else:
        cursor.execute(
            f"""
            INSERT INTO {FILE_OVERRIDE_TABLE} (catalog_std_type_no, subject_code, file_path)
            VALUES (%s, %s, %s)
            """,
            [GB_CATALOG_TYPE_NO, code, file_path],
        )


def clear_file_override(cursor: Any, subject_code: str) -> None:
    cursor.execute(
        f"""
        DELETE FROM {INDICATOR_TABLE}
        WHERE subject_code = %s AND catalog_std_type_no = %s
        """,
        [subject_code.strip(), GB_CATALOG_TYPE_NO],
    )
    cursor.execute(
        f"""
        UPDATE {FILE_OVERRIDE_TABLE} SET file_path = NULL
        WHERE subject_code = %s AND catalog_std_type_no = %s
        """,
        [subject_code.strip(), GB_CATALOG_TYPE_NO],
    )


def list_enterprise_subject_codes_with_refs(cursor: Any) -> list[str]:
    cursor.execute(
        f"""
        SELECT DISTINCT subject_code
        FROM {MAPPING_TABLE}
        WHERE catalog_std_type_no IS NULL
          AND subject_code IS NOT NULL AND TRIM(subject_code) <> ''
          AND referenced_std_code IS NOT NULL AND TRIM(referenced_std_code) <> ''
        """
    )
    return [r[0].strip() for r in cursor.fetchall() if r[0]]


def list_referenced_std_codes_for_subject(cursor: Any, subject_code: str) -> list[str]:
    where_sql, params = subject_where_sql(None, subject_code)
    cursor.execute(
        f"""
        SELECT referenced_std_code, MIN(id) AS sort_id
        FROM {MAPPING_TABLE}
        WHERE {where_sql}
          AND referenced_std_code IS NOT NULL AND TRIM(referenced_std_code) <> ''
        GROUP BY referenced_std_code
        ORDER BY sort_id
        """,
        params,
    )
    return [r[0].strip() for r in cursor.fetchall()]


def l1_national_std_row(cursor: Any, std_code: str) -> tuple[bool, str | None, str | None]:
    """只读：STSC std_base/std_filepath，或 v1 视图 national_standard_basic。"""
    from apps.core import stsc_catalog_read

    if stsc_catalog_read.use_stsc_l1_catalog():
        return stsc_catalog_read.l1_std_file_and_name(cursor, std_code)
    if not table_exists("national_standard_basic"):
        return False, None, None
    cursor.execute(
        "SELECT std_file_path, std_name FROM national_standard_basic WHERE std_code = %s LIMIT 1",
        [std_code.strip()],
    )
    row = cursor.fetchone()
    if not row:
        return False, None, None
    return True, (row[0] or None), (row[1] or None)
