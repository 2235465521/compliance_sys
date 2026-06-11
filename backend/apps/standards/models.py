from django.db import connection, models


class NationalStandardBasic(models.Model):
    """国标基础信息主表（已映射到只读的 std_base 表以支持 47万+ 数据，禁止修改数据库结构）。"""

    std_code = models.CharField("国标号", max_length=128, unique=True, db_index=True, db_column="std_id")
    std_name = models.TextField("标准名称", null=True, blank=True, db_column="std_chinesename")
    std_status = models.CharField("标准状态", max_length=128, null=True, blank=True)
    publish_date = models.DateField("发布日期", null=True, blank=True, db_column="release_date")
    effective_date = models.DateField("实施日期", null=True, blank=True, db_column="implement_date")
    abolition_date = models.DateField("废止日期", null=True, blank=True, db_column="abolish_date")
    std_category = models.CharField("标准类别", max_length=64, null=True, blank=True, db_column="std_type")

    class Meta:
        managed = False
        db_table = "std_base"
        verbose_name = "国标基础信息"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return f"{self.std_code}"

    @property
    def replaces_std_code(self) -> str | None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT replace_std_name FROM std_replace WHERE base_id = %s LIMIT 1", [self.id])
            row = cursor.fetchone()
        return row[0] if row else None

    @property
    def replace_type(self) -> str | None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT replace_type FROM std_replace WHERE base_id = %s LIMIT 1", [self.id])
            row = cursor.fetchone()
        return row[0] if row else None

    @property
    def ccs_code(self) -> str | None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT ccs_code FROM std_gb_detail WHERE base_id = %s LIMIT 1", [self.id])
            row = cursor.fetchone()
        return row[0] if row else None

    @property
    def ics_code(self) -> str | None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT ics_code FROM std_gb_detail WHERE base_id = %s LIMIT 1", [self.id])
            row = cursor.fetchone()
        return row[0] if row else None

    @property
    def ped_id(self) -> str | None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT ped_id FROM std_pedigree WHERE base_id = %s LIMIT 1", [self.id])
            row = cursor.fetchone()
        return row[0] if row else None

    @property
    def detail_url(self) -> str | None:
        return None

    @property
    def std_file_path(self) -> str | None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT MIN(file_path) FROM std_filepath WHERE base_id = %s", [self.id])
            row = cursor.fetchone()
        return row[0] if row else None

    @property
    def extension_row(self):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT responsible_unit, secondary_responsible_unit, issuing_department,
                       executing_unit, technical_committee, governing_department,
                       adoption_status, drafting_unit, drafter
                FROM std_gb_detail
                WHERE base_id = %s
                LIMIT 1
                """,
                [self.id],
            )
            row = cursor.fetchone()
        if not row:
            return None

        class DummyExtension:
            def __init__(self, r):
                self.responsible_unit = r[0]
                self.secondary_responsible_unit = r[1]
                self.issuing_department = r[2]
                self.executing_unit = r[3]
                self.technical_committee = r[4]
                self.governing_department = r[5]
                self.adoption_status = r[6]
                self.drafting_unit = r[7]
                self.drafter = r[8]
        return DummyExtension(row)


class NationalStandardExtension(models.Model):
    """国标扩展信息（对齐 v1.0-sql national_standard_extension，主键国标号）。"""

    national_standard = models.OneToOneField(
        NationalStandardBasic,
        on_delete=models.CASCADE,
        to_field="std_code",
        db_column="std_code",
        primary_key=True,
        parent_link=False,
        related_name="extension_row",
    )
    responsible_unit = models.TextField("归口单位/部门", null=True, blank=True)
    secondary_responsible_unit = models.TextField("副归口单位", null=True, blank=True)
    issuing_department = models.TextField("颁发部门", null=True, blank=True)
    executing_unit = models.TextField("执行单位", null=True, blank=True)
    technical_committee = models.TextField("技术委员会", null=True, blank=True)
    governing_department = models.TextField("主管部门", null=True, blank=True)
    adoption_status = models.TextField("采标情况", null=True, blank=True)
    drafting_unit = models.TextField("起草单位", null=True, blank=True)
    drafter = models.TextField("起草人", null=True, blank=True)

    class Meta:
        db_table = "national_standard_extension"
        verbose_name = "国标扩展信息"
        verbose_name_plural = verbose_name


class IcsIndustryClassification(models.Model):
    """ICS 行业分类（对齐 `ics_industry_classification`）；`ics_code` 与 Excel「分类号 u」一致。"""

    ics_code = models.CharField("国际标准分类号", max_length=64, unique=True, db_index=True)
    ics_level = models.SmallIntegerField("层级", null=True, blank=True)
    ics_name = models.TextField("名称", null=True, blank=True)
    ics_note = models.TextField("注释/扩充说明", null=True, blank=True)

    class Meta:
        db_table = "ics_industry_classification"
        verbose_name = "ICS 行业分类"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return self.ics_code


class CcsIndustryClassification(models.Model):
    """CCS 中国标准分类（对齐 `ccs_industry_classification`）。"""

    ccs_code = models.CharField("中国标准分类号", max_length=64, unique=True, db_index=True)
    ccs_name = models.TextField("名称", null=True, blank=True)
    parent_code = models.CharField("父代码", max_length=64, null=True, blank=True, db_index=True)
    ccs_note = models.TextField("备注", null=True, blank=True)

    class Meta:
        db_table = "ccs_industry_classification"
        verbose_name = "CCS 行业分类"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return self.ccs_code


class StandardPedigreeRelation(models.Model):
    """标准谱系有向边：source → target，语义由 relation_type 约定（如 全部代替、引用 等）。"""

    source_std_code = models.CharField("起点国标号", max_length=128, db_index=True)
    target_std_code = models.CharField("终点国标号", max_length=128, db_index=True)
    relation_type = models.CharField("关系类型", max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "standard_pedigree_relation"
        verbose_name = "标准谱系关系"
        verbose_name_plural = verbose_name
        constraints = [
            models.UniqueConstraint(
                fields=["source_std_code", "target_std_code"],
                name="uq_std_pedigree_source_target",
            )
        ]

    def __str__(self) -> str:
        return f"{self.source_std_code} -{self.relation_type}-> {self.target_std_code}"


class NationalStandardIndicator(models.Model):
    """国标具体指标表（对齐 national_standard_indicator）。"""

    std_code = models.CharField("国标号", max_length=128, db_index=True)
    specific_indicator_value = models.TextField("国标指标集合（indexes JSON 数组）", null=True, blank=True)
    manual_review_status = models.CharField(
        "人工审核状态",
        max_length=32,
        null=True,
        blank=True,
        choices=[("pending", "待审"), ("approved", "通过"), ("rejected", "拒绝")],
    )

    class Meta:
        managed = False
        db_table = "national_standard_indicator"
        verbose_name = "国标具体指标"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return f"{self.std_code}: {self.specific_indicator_value}"


class NationalStandardIndexImportHistory(models.Model):
    """国标指标入库历史记录（对齐 national_standard_index_import_history）。"""

    class ImportStatus(models.TextChoices):
        COMPLETED = "completed", "completed"
        FAILED = "failed", "failed"
        SKIPPED = "skipped", "skipped"

    class ReviewStatus(models.TextChoices):
        PENDING = "pending", "pending"
        APPROVED = "approved", "approved"
        REJECTED = "rejected", "rejected"

    std_code = models.CharField("国标号", max_length=128, db_index=True)
    original_filename = models.CharField("上传文件名", max_length=512)
    import_status = models.CharField(
        "入库状态", max_length=32, choices=ImportStatus.choices, default=ImportStatus.COMPLETED
    )
    indexes_count = models.IntegerField("indexes 条目数", default=0)
    manual_review_status = models.CharField(
        "人工审核状态", max_length=32, choices=ReviewStatus.choices, null=True, blank=True
    )
    error_message = models.TextField("错误信息", null=True, blank=True)
    created_at = models.DateTimeField("入库时间", auto_now_add=True)
    updated_at = models.DateTimeField("最后更新时间", auto_now=True)

    class Meta:
        db_table = "national_standard_index_import_history"
        ordering = ["-created_at"]
        verbose_name = "国标指标入库历史"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return f"{self.std_code} @ {self.created_at:%Y-%m-%d %H:%M}"


class NationalStandardIndexImportJob(models.Model):
    """国标指标入库批次表（对齐 national_standard_index_import_job）。"""

    class Status(models.TextChoices):
        PENDING = "pending", "pending"
        PROCESSING = "processing", "processing"
        COMPLETED = "completed", "completed"
        FAILED = "failed", "failed"

    status = models.CharField(
        "批次状态", max_length=32, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    label = models.CharField("批次标签", max_length=256, null=True, blank=True)
    total_items = models.IntegerField("文件总数", default=0)
    completed_items = models.IntegerField("已完成数", default=0)
    failed_items = models.IntegerField("失败数", default=0)
    error_summary = models.TextField("批次级错误摘要", null=True, blank=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("最后更新时间", auto_now=True)

    class Meta:
        db_table = "national_standard_index_import_job"
        ordering = ["-id"]
        verbose_name = "国标指标入库批次"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return f"Job#{self.pk} {self.status} ({self.completed_items}/{self.total_items})"


class NationalStandardIndexImportItem(models.Model):
    """国标指标入库批次条目（对齐 national_standard_index_import_item）。"""

    class Status(models.TextChoices):
        PENDING = "pending", "pending"
        RUNNING = "running", "running"
        COMPLETED = "completed", "completed"
        FAILED = "failed", "failed"
        SKIPPED = "skipped", "skipped"

    job = models.ForeignKey(
        NationalStandardIndexImportJob,
        on_delete=models.CASCADE,
        related_name="items",
        db_column="job_id",
    )
    sort_order = models.IntegerField("文件顺序", default=0)
    original_filename = models.CharField("原始文件名", max_length=512)
    stored_file_path = models.TextField("临时存储路径")
    status = models.CharField(
        "条目状态", max_length=32, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    std_code = models.CharField("国标号", max_length=128, null=True, blank=True)
    indexes_count = models.IntegerField("indexes 条目数", default=0)
    manual_review_status = models.CharField(
        "审核状态", max_length=32, null=True, blank=True,
        choices=[("pending", "待审"), ("approved", "通过"), ("rejected", "拒绝")],
    )
    error_message = models.TextField("错误信息", null=True, blank=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("最后更新时间", auto_now=True)

    class Meta:
        db_table = "national_standard_index_import_item"
        ordering = ["job_id", "sort_order", "id"]
        indexes = [models.Index(fields=["job", "status"], name="nsiij_item_job_status")]
        verbose_name = "国标指标入库条目"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return f"Item#{self.pk} {self.original_filename} [{self.status}]"


class StandardPedigree(models.Model):
    """库表 `standard_pedigree`（已有表，不由 Django 迁移创建）。谱系图优先读取 `part_chain`。"""

    id = models.BigAutoField(primary_key=True)
    std_code = models.CharField(max_length=128)
    latest_std_code = models.TextField(null=True, blank=True)
    ped_id = models.TextField(null=True, blank=True)
    part_chain = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "standard_pedigree"
        verbose_name = "标准谱系（part_chain）"
        verbose_name_plural = verbose_name

    def __str__(self) -> str:
        return f"{self.std_code}"
