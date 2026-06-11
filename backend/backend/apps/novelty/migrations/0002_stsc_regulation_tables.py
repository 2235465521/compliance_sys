from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("novelty", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RenameField(
                    model_name="noveltyreferencebaselinesnapshot",
                    old_name="qb_code_norm",
                    new_name="subject_code_norm",
                ),
                migrations.RenameField(
                    model_name="noveltyreferencebaselinesnapshot",
                    old_name="qb_code",
                    new_name="subject_code",
                ),
                migrations.AlterModelTable(
                    name="noveltyreferencebaselinesnapshot",
                    table="regulation_novelty_reference_baseline_snapshot",
                ),
                migrations.RemoveConstraint(
                    model_name="noveltyreferencebaselinesnapshot",
                    name="uq_novelty_baseline_qb_ref",
                ),
                migrations.AddConstraint(
                    model_name="noveltyreferencebaselinesnapshot",
                    constraint=models.UniqueConstraint(
                        fields=("subject_code_norm", "referenced_std_code_norm"),
                        name="uq_novelty_baseline_subject_ref",
                    ),
                ),
                migrations.RenameField(
                    model_name="noveltysearchtask",
                    old_name="qb_code",
                    new_name="subject_code",
                ),
                migrations.AlterModelTable(
                    name="noveltysearchtask",
                    table="regulation_novelty_search_task",
                ),
            ],
        ),
    ]
