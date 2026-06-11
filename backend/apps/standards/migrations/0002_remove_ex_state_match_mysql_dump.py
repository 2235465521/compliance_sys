# v1.0-sql 导入的 national_standard_basic 无 ex_state 列；仅更新 Django 状态，避免对 MySQL 执行 DROP COLUMN 失败。

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("standards", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(
                    model_name="nationalstandardbasic",
                    name="ex_state",
                ),
            ],
            database_operations=[],
        ),
    ]
