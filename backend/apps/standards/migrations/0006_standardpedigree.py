# 将 unmanaged 的 StandardPedigree 纳入迁移图；表已存在，不在数据库侧执行 DDL。

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("standards", "0005_ics_ccs_code_unique_indexes"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="StandardPedigree",
                    fields=[
                        (
                            "id",
                            models.BigAutoField(primary_key=True, serialize=False),
                        ),
                        ("std_code", models.CharField(max_length=128)),
                        (
                            "latest_std_code",
                            models.TextField(blank=True, null=True),
                        ),
                        ("ped_id", models.TextField(blank=True, null=True)),
                        ("part_chain", models.TextField(blank=True, null=True)),
                    ],
                    options={
                        "verbose_name": "标准谱系（part_chain）",
                        "verbose_name_plural": "标准谱系（part_chain）",
                        "db_table": "standard_pedigree",
                        "managed": False,
                    },
                ),
            ],
            database_operations=[],
        ),
    ]
