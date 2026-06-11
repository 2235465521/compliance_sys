"""
MySQL：为 Django 自带系统表设置 TABLE COMMENT，便于在客户端中文化展示。

SQLite 下本迁移不执行 DDL（无 COMMENT 语义）；非 MySQL 直接跳过。
"""

from __future__ import annotations

from typing import Sequence

from django.db import migrations


# (物理表名, 中文表注释) — 仅覆盖默认 contrib 安装常见表；若表不存在则跳过。
_MYSQL_TABLE_COMMENTS: Sequence[tuple[str, str]] = (
    ("django_migrations", "Django 迁移历史：记录已应用的 app 与迁移文件名及执行时间"),
    ("django_content_type", "内容类型：将各 app 内模型注册为可赋权限的类型"),
    ("auth_permission", "权限定义：动作 codename 与内容类型组合"),
    ("auth_group", "用户组：用于批量授权与角色划分"),
    ("auth_group_permissions", "组与权限关联：多对多中间表"),
    ("auth_user", "用户账号：登录名、密码哈希及个人信息等"),
    ("auth_user_groups", "用户与组关联：多对多中间表"),
    ("auth_user_user_permissions", "用户直接授权：绕过组的额外权限"),
    ("django_admin_log", "管理后台操作日志：谁在何时对哪条对象做了何种变更"),
    ("django_session", "会话数据：session_key 与序列化后的会话载荷及过期时间"),
)


def _apply_mysql_table_comments(apps, schema_editor) -> None:
    connection = schema_editor.connection
    if connection.vendor != "mysql":
        return

    qn = connection.ops.quote_name
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_TYPE = 'BASE TABLE'
            """
        )
        existing = {row[0] for row in cursor.fetchall()}

    with connection.cursor() as cursor:
        for table, comment in _MYSQL_TABLE_COMMENTS:
            if table not in existing:
                continue
            cursor.execute(f"ALTER TABLE {qn(table)} COMMENT = %s", [comment])


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("admin", "0003_logentry_add_action_flag_choices"),
        ("sessions", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(_apply_mysql_table_comments, migrations.RunPython.noop),
    ]
