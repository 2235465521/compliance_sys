from django.contrib import admin

from apps.standards.models import (
    CcsIndustryClassification,
    IcsIndustryClassification,
    NationalStandardBasic,
    NationalStandardExtension,
    StandardPedigree,
    StandardPedigreeRelation,
)


@admin.register(IcsIndustryClassification)
class IcsIndustryClassificationAdmin(admin.ModelAdmin):
    list_display = ("id", "ics_code", "ics_level", "ics_name")
    search_fields = ("ics_code", "ics_name")


@admin.register(CcsIndustryClassification)
class CcsIndustryClassificationAdmin(admin.ModelAdmin):
    list_display = ("id", "ccs_code", "parent_code", "ccs_name")
    search_fields = ("ccs_code", "ccs_name")


@admin.register(NationalStandardBasic)
class NationalStandardBasicAdmin(admin.ModelAdmin):
    list_display = ("id", "std_code", "std_name", "std_status", "publish_date")
    search_fields = ("std_code", "std_name")


@admin.register(NationalStandardExtension)
class NationalStandardExtensionAdmin(admin.ModelAdmin):
    list_display = ("national_standard", "responsible_unit", "issuing_department")
    search_fields = ("national_standard__std_code",)


@admin.register(StandardPedigreeRelation)
class StandardPedigreeRelationAdmin(admin.ModelAdmin):
    list_display = ("source_std_code", "target_std_code", "relation_type", "created_at")
    search_fields = ("source_std_code", "target_std_code")


@admin.register(StandardPedigree)
class StandardPedigreeAdmin(admin.ModelAdmin):
    list_display = ("id", "std_code", "ped_id")
    search_fields = ("std_code", "ped_id", "part_chain")
    readonly_fields = ("id", "std_code", "latest_std_code", "ped_id", "part_chain")
