from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("batch_normative_reference", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterModelTable(
                    name="batchnormativereferencejob",
                    table="regulation_batch_normative_reference_job",
                ),
                migrations.AlterModelTable(
                    name="batchnormativereferenceitem",
                    table="regulation_batch_normative_reference_item",
                ),
            ],
        ),
    ]
