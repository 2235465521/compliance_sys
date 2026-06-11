"""Generate draw.io ER diagram for first 12 tables in standardization_platform_schema_mysql80.sql"""
from __future__ import annotations

import html
from pathlib import Path

TABLES = {
    "national_standard_basic": {
        "pk": ["id"],
        "uk": ["std_code"],
        "cols": [
            ("id", "bigint"),
            ("std_code", "varchar(128)"),
            ("std_name", "text"),
            ("std_status", "varchar(128)"),
            ("publish_date", "date"),
            ("effective_date", "date"),
            ("abolition_date", "date"),
            ("std_category", "varchar(64)"),
            ("replaces_std_code", "mediumtext"),
            ("replace_type", "varchar(64)"),
            ("food_standard_mark", "int"),
            ("ccs_code", "varchar(64)"),
            ("ics_code", "varchar(64)"),
            ("ped_id", "mediumtext"),
            ("detail_url", "text"),
            ("std_file_path", "text"),
        ],
        "x": 420,
        "y": 260,
        "w": 300,
    },
    "national_standard_extension": {
        "pk": ["std_code"],
        "uk": [],
        "cols": [
            ("std_code", "varchar(128)"),
            ("responsible_unit", "text"),
            ("secondary_responsible_unit", "text"),
            ("issuing_department", "text"),
            ("executing_unit", "text"),
            ("technical_committee", "text"),
            ("governing_department", "text"),
            ("adoption_status", "text"),
            ("drafting_unit", "text"),
            ("drafter", "text"),
        ],
        "x": 420,
        "y": 560,
        "w": 300,
    },
    "national_standard_indicator": {
        "pk": ["id"],
        "uk": [],
        "cols": [
            ("id", "bigint"),
            ("std_code", "varchar(128)"),
            ("specific_indicator_value", "longtext"),
            ("manual_review_status", "enum"),
        ],
        "x": 420,
        "y": 820,
        "w": 300,
    },
    "standard_document_catalog": {
        "pk": ["id"],
        "uk": [],
        "cols": [
            ("id", "bigint"),
            ("std_name", "text"),
            ("std_code", "varchar(128)"),
            ("core_keywords", "text"),
            ("content_text", "text"),
            ("scope_vector", "json"),
            ("embedding_model", "varchar(128)"),
        ],
        "x": 420,
        "y": 980,
        "w": 300,
    },
    "standard_pedigree": {
        "pk": ["id"],
        "uk": [],
        "cols": [
            ("id", "bigint"),
            ("std_code", "varchar(128)"),
            ("latest_std_code", "mediumtext"),
            ("ped_id", "mediumtext"),
            ("part_chain", "mediumtext"),
        ],
        "x": 40,
        "y": 260,
        "w": 280,
    },
    "standard_pedigree_relation": {
        "pk": ["id"],
        "uk": [],
        "cols": [
            ("id", "bigint"),
            ("source_std_code", "varchar(128)"),
            ("target_std_code", "varchar(128)"),
            ("relation_type", "varchar(128)"),
            ("created_at", "datetime(6)"),
        ],
        "x": 40,
        "y": 460,
        "w": 280,
    },
    "enterprise_standard_basic": {
        "pk": ["id"],
        "uk": ["qb_code"],
        "cols": [
            ("id", "bigint"),
            ("qb_code", "varchar(128)"),
            ("company_name", "text"),
            ("qb_name", "text"),
            ("publish_date", "date"),
            ("unified_social_credit_code", "varchar(32)"),
            ("indicator_set_json", "json"),
        ],
        "x": 1180,
        "y": 260,
        "w": 300,
    },
    "enterprise_standard_reference_mapping": {
        "pk": ["id"],
        "uk": [],
        "cols": [
            ("id", "bigint"),
            ("qb_code", "varchar(128)"),
            ("referenced_std_code", "varchar(50)"),
            ("latest_std_code", "varchar(50)"),
            ("supplement_std_version_code", "varchar(50)"),
            ("manual_review_status", "tinyint(1)"),
        ],
        "x": 1180,
        "y": 500,
        "w": 320,
    },
    "national_standard_enterprise_mapping": {
        "pk": ["id"],
        "uk": [],
        "cols": [
            ("id", "bigint"),
            ("std_code", "varchar(128)"),
            ("qb_code", "varchar(128)"),
        ],
        "x": 780,
        "y": 380,
        "w": 300,
    },
    "compliance_evaluation_task": {
        "pk": ["id"],
        "uk": [],
        "cols": [
            ("id", "bigint"),
            ("qb_code", "varchar(128)"),
            ("current_step", "smallint"),
            ("status", "varchar(16)"),
            ("uploaded_file_path", "text"),
            ("uploaded_file_name", "varchar(512)"),
            ("parse_result_json", "json"),
            ("indicator_bundle_json", "json"),
            ("compare_result_json", "json"),
            ("dify_run_metadata_json", "json"),
            ("parse_status", "varchar(24)"),
            ("parse_error", "text"),
            ("step4_indicators_confirmed", "tinyint(1)"),
            ("step5_compare_confirmed", "tinyint(1)"),
            ("created_at", "datetime(6)"),
            ("updated_at", "datetime(6)"),
            ("created_by", "varchar(128)"),
        ],
        "x": 1180,
        "y": 720,
        "w": 320,
    },
    "compliance_evaluation_snapshot": {
        "pk": ["id"],
        "uk": [],
        "cols": [
            ("id", "bigint"),
            ("task_id", "bigint"),
            ("step", "smallint"),
            ("payload_json", "json"),
            ("created_at", "datetime(6)"),
        ],
        "x": 1560,
        "y": 720,
        "w": 300,
    },
    "evaluation_result": {
        "pk": ["id"],
        "uk": [],
        "cols": [
            ("id", "bigint"),
            ("qb_code", "varchar(128)"),
            ("descriptive_result", "enum"),
            ("descriptive_result_report_file_path", "text"),
            ("reference_result", "enum"),
            ("reference_result_report_file_path", "text"),
            ("indicator_result", "enum"),
            ("indicator_result_report_file_path", "text"),
            ("overall_result", "enum"),
            ("certificate_file_path", "text"),
        ],
        "x": 1180,
        "y": 1040,
        "w": 320,
    },
}

# (source, target, fk_label, is_fk)
EDGES = [
    ("national_standard_basic", "national_standard_extension", "std_code", True),
    ("national_standard_basic", "national_standard_indicator", "std_code", True),
    ("national_standard_basic", "standard_document_catalog", "std_code", True),
    ("enterprise_standard_basic", "enterprise_standard_reference_mapping", "qb_code", True),
    ("national_standard_basic", "national_standard_enterprise_mapping", "std_code", True),
    ("enterprise_standard_basic", "national_standard_enterprise_mapping", "qb_code", True),
    ("enterprise_standard_basic", "compliance_evaluation_task", "qb_code", True),
    ("compliance_evaluation_task", "compliance_evaluation_snapshot", "task_id", True),
    ("enterprise_standard_basic", "evaluation_result", "qb_code", True),
    ("national_standard_basic", "standard_pedigree", "std_code", False),
    ("national_standard_basic", "standard_pedigree_relation", "source_std_code", False),
]


def table_html(name: str, meta: dict) -> str:
    pk = set(meta["pk"])
    uk = set(meta["uk"])
    rows = []
    for col, typ in meta["cols"]:
        mark = "PK " if col in pk else ("UK " if col in uk else "")
        rows.append(f"{mark}{html.escape(col)}: {html.escape(typ)}")
    body = "<br/>".join(rows)
    return (
        '&lt;div style=&quot;font-family:Consolas,monospace;font-size:11px;color:#ffffff;&quot;&gt;'
        f'&lt;div style=&quot;border-bottom:1px solid #888;padding:6px 8px;font-weight:bold;background:#222;&quot;&gt;'
        f"{html.escape(name)}&lt;/div&gt;"
        f'&lt;div style=&quot;padding:6px 8px;line-height:1.45;background:#111;&quot;&gt;{body}&lt;/div&gt;&lt;/div&gt;'
    )


def main() -> None:
    cells: list[str] = []
    cid = 2

    cells.append(
        f'<mxCell id="{cid}" value="" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#000000;strokeColor=none;" '
        f'vertex="1" parent="1"><mxGeometry x="0" y="0" width="2000" height="1400" as="geometry"/></mxCell>'
    )
    cid += 1

    cells.append(
        f'<mxCell id="{cid}" value="&lt;span style=&quot;color:#ffffff;font-size:14px;&quot;&gt;'
        "标准化平台 ER 图（12 张表）&lt;/span&gt;&lt;br&gt;"
        '&lt;span style=&quot;color:#aaaaaa;font-size:11px;&quot;&gt;实线=外键 | 虚线=逻辑关联&lt;/span&gt;" '
        'style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;" '
        f'vertex="1" parent="1"><mxGeometry x="40" y="20" width="360" height="40" as="geometry"/></mxCell>'
    )
    cid += 1

    id_map: dict[str, int] = {}
    for name, meta in TABLES.items():
        h = 38 + len(meta["cols"]) * 16
        val = table_html(name, meta)
        cells.append(
            f'<mxCell id="{cid}" value="{val}" '
            'style="rounded=0;whiteSpace=wrap;html=1;fillColor=#111111;strokeColor=#ffffff;strokeWidth=1;'
            'align=left;verticalAlign=top;spacing=0;" '
            f'vertex="1" parent="1"><mxGeometry x="{meta["x"]}" y="{meta["y"]}" width="{meta["w"]}" '
            f'height="{h}" as="geometry"/></mxCell>'
        )
        id_map[name] = cid
        cid += 1

    for src, tgt, label, solid in EDGES:
        style = (
            "endArrow=ERmany;startArrow=ERone;html=1;rounded=0;"
            "strokeColor=#ffffff;strokeWidth=1;fontColor=#ffffff;"
        )
        if not solid:
            style += "dashed=1;dashPattern=8 8;"
        eid = cid
        cid += 1
        lid = cid
        cid += 1
        cells.append(
            f'<mxCell id="{eid}" value="" style="{style}" edge="1" parent="1" '
            f'source="{id_map[src]}" target="{id_map[tgt]}">'
            '<mxGeometry relative="1" as="geometry"/></mxCell>'
        )
        cells.append(
            f'<mxCell id="{lid}" value="{html.escape(label)}" '
            'style="edgeLabel;html=1;align=center;verticalAlign=middle;fontSize=10;'
            'fontColor=#ffffff;labelBackgroundColor=#000000;" '
            f'vertex="1" connectable="0" parent="{eid}">'
            '<mxGeometry x="-0.2" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>'
        )

    xml = f"""<mxfile host="app.diagrams.net" agent="Cursor" version="24.0.0">
  <diagram id="er-12-tables" name="ER-12表">
    <mxGraphModel dx="1800" dy="1000" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="2000" pageHeight="1400" background="#000000" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
{chr(10).join(cells)}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
"""
    out = Path(__file__).resolve().parents[1] / "standardization_platform_er_12tables.drawio"
    out.write_text(xml, encoding="utf-8")
    print(f"written: {out}")


if __name__ == "__main__":
    main()
