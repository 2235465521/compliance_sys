"""按任务各步骤 JSON 汇总生成合规评价 HTML 报告（无需 Word 模板）。"""

from __future__ import annotations

import html
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import connection

from apps.compliance.db import is_mysql
from apps.compliance.models import ComplianceEvaluationTask
from apps.standards.services.reference_bundle import normative_reference_row_core
from apps.standards.services.reference_resolution import resolve_reference_for_task

_RESULT_LABELS: dict[str, str] = {
    "compliant": "符合",
    "non_compliant": "不符合",
    "partial": "部分符合",
    "not_applicable": "不适用",
    "pending": "待评价",
}

_REPORT_FILENAME = "compliance_evaluation_report.html"


def _esc(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return html.escape(json.dumps(value, ensure_ascii=False, indent=2))
    return html.escape(str(value))


def _result_label(value: Any) -> str:
    if value is None:
        return "—"
    key = str(value).strip()
    return _RESULT_LABELS.get(key, key)


def _markdown_pipe_table_to_html(text: str) -> str:
    if not text or not str(text).strip():
        return "<p class=\"muted\">（无对比表格）</p>"
    lines = [ln.strip() for ln in str(text).strip().splitlines() if ln.strip() and "|" in ln]
    if not lines:
        return f"<pre>{_esc(text)}</pre>"
    rows: list[list[str]] = []
    for ln in lines:
        if re.match(r"^\|?[\s\-:|]+\|?$", ln):
            continue
        cells = [c.strip() for c in ln.strip("|").split("|")]
        rows.append(cells)
    if not rows:
        return f"<pre>{_esc(text)}</pre>"
    parts = ['<table class="data">']
    for i, row in enumerate(rows):
        tag = "th" if i == 0 else "td"
        parts.append("<tr>" + "".join(f"<{tag}>{_esc(c)}</{tag}>" for c in row) + "</tr>")
    parts.append("</table>")
    return "".join(parts)


def _dict_rows_table(rows: list[dict[str, Any]], columns: list[tuple[str, str]]) -> str:
    if not rows:
        return "<p class=\"muted\">（无数据）</p>"
    parts = ['<table class="data"><thead><tr>']
    parts.extend(f"<th>{_esc(label)}</th>" for _key, label in columns)
    parts.append("</tr></thead><tbody>")
    for row in rows:
        parts.append("<tr>")
        for key, _label in columns:
            parts.append(f"<td>{_esc(row.get(key))}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table>")
    return "".join(parts)


def _build_reference_table_rows(task: ComplianceEvaluationTask) -> list[dict[str, Any]]:
    """
    规范性引用表：发布侧引用与最新标准号同一行对齐。

    映射表中 N 侧（referenced）与 M 补充行（仅 latest）是分条存储的，不可直接逐行渲染。
    """
    subject_code = task.subject_code
    bundle = task.indicator_bundle_json if isinstance(task.indicator_bundle_json, dict) else {}

    if not subject_code:
        pairs = bundle.get("compare_pairs") or []
        if pairs:
            return [
                {
                    "referenced_std_code": (p.get("publication_std_code") or "—") if isinstance(p, dict) else "—",
                    "latest_std_code": (p.get("latest_std_code") or "—") if isinstance(p, dict) else "—",
                    "manual_review_status": None,
                }
                for p in pairs
                if isinstance(p, dict)
            ]
        return []

    if not is_mysql():
        pairs = bundle.get("compare_pairs") or []
        return [
            {
                "referenced_std_code": p.get("publication_std_code") or "—",
                "latest_std_code": p.get("latest_std_code") or "—",
                "manual_review_status": None,
            }
            for p in pairs
            if isinstance(p, dict)
        ]

    from apps.core import regulation_subject as reg

    anchor_id = None
    with connection.cursor() as c:
        anchor_id = reg.get_enterprise_anchor_id(c, subject_code)
    if anchor_id is None:
        mapping_rows = []
    else:
        with connection.cursor() as c:
            mapping_rows = reg.fetch_mapping_rows_for_anchor(c, anchor_id)

    rows: list[dict[str, Any]] = []
    seen_refs: set[str] = set()

    for m in mapping_rows:
        ref = (m.get("referenced_std_code") or "").strip()
        if not ref or ref in seen_refs:
            continue
        seen_refs.add(ref)
        latest = (m.get("latest_std_code") or "").strip()
        try:
            raw = resolve_reference_for_task(task, ref)
            core = normative_reference_row_core(raw)
            resolved = (core.get("latest_std_primary") or "").strip()
            if resolved:
                latest = resolved
        except Exception:
            pass
        rows.append(
            {
                "referenced_std_code": ref,
                "latest_std_code": latest or "—",
                "manual_review_status": m.get("manual_review_status"),
            }
        )

    shown_latest = {
        r["latest_std_code"]
        for r in rows
        if r.get("latest_std_code") and r["latest_std_code"] != "—"
    }

    for m in mapping_rows:
        ref = (m.get("referenced_std_code") or "").strip()
        latest = (m.get("latest_std_code") or "").strip()
        if ref or not latest or latest in shown_latest:
            continue
        rows.append(
            {
                "referenced_std_code": "—",
                "latest_std_code": latest,
                "manual_review_status": m.get("manual_review_status"),
            }
        )
        shown_latest.add(latest)

    return rows


def _parse_summary_fields(parse: dict[str, Any]) -> dict[str, Any]:
    return {
        "subject_code": parse.get("qb_code") or parse.get("subject_code"),
        "subject_name": parse.get("qb_name") or parse.get("subject_name"),
        "company_name": parse.get("company_name"),
        "publish_date": parse.get("publish_date") or parse.get("qibiao_release_date"),
        "referenced_std_codes": parse.get("referenced_std_codes") or [],
    }


def _indicator_rows(indicators: list[Any], limit: int = 50) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in indicators[:limit]:
        if isinstance(item, dict):
            rows.append(
                {
                    "name": item.get("name") or item.get("index_name") or item.get("key"),
                    "value": item.get("value") or item.get("specific_indicator_value"),
                    "type": item.get("index_type") or item.get("type"),
                }
            )
        else:
            rows.append({"name": str(item), "value": "", "type": ""})
    return rows


def build_compliance_report_html(
    task: ComplianceEvaluationTask,
    evaluation_result: dict[str, Any] | None = None,
) -> str:
    parse = task.parse_result_json if isinstance(task.parse_result_json, dict) else {}
    parse_fields = _parse_summary_fields(parse)
    bundle = task.indicator_bundle_json if isinstance(task.indicator_bundle_json, dict) else {}
    compare = task.compare_result_json if isinstance(task.compare_result_json, dict) else {}
    er = evaluation_result or {}

    subject_code = task.subject_code or parse_fields.get("subject_code") or "—"
    subject_name = parse_fields.get("subject_name") or "—"
    company = parse_fields.get("company_name") or "—"
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    refs = _build_reference_table_rows(task)
    if not refs and parse_fields.get("referenced_std_codes"):
        refs = [
            {"referenced_std_code": c, "latest_std_code": "—", "manual_review_status": None}
            for c in parse_fields["referenced_std_codes"]
        ]

    compare_pairs = bundle.get("compare_pairs") or []
    std_statuses = bundle.get("std_statuses") or []
    enterprise_indicators = bundle.get("enterprise_indicators") or parse.get("indicators") or []

    compare_summary = compare.get("summary") or compare.get("conclusion") or ""
    compare_markdown = compare.get("markdown") or ""

    sections: list[str] = []

    sections.append(
        f"""
<section>
  <h2>一、基本信息</h2>
  <table class="meta">
    <tr><th>任务编号</th><td>{_esc(task.id)}</td></tr>
    <tr><th>企业标准号</th><td>{_esc(subject_code)}</td></tr>
    <tr><th>标准名称</th><td>{_esc(subject_name)}</td></tr>
    <tr><th>企业名称</th><td>{_esc(company)}</td></tr>
    <tr><th>发布日期</th><td>{_esc(parse_fields.get("publish_date") or "—")}</td></tr>
    <tr><th>上传文件</th><td>{_esc(task.uploaded_file_name or "—")}</td></tr>
    <tr><th>当前步骤</th><td>{_esc(task.current_step)} / 6</td></tr>
    <tr><th>报告生成时间</th><td>{_esc(generated_at)}</td></tr>
  </table>
</section>
"""
    )

    sections.append(
        f"""
<section>
  <h2>二、规范性引用（步骤 2–3）</h2>
  {_dict_rows_table(refs, [("referenced_std_code", "发布时引用标准"), ("latest_std_code", "最新标准号"), ("manual_review_status", "人工审核")])}
</section>
"""
    )

    if compare_pairs:
        pair_rows = [
            {
                "publication_std_code": p.get("publication_std_code"),
                "latest_std_code": p.get("latest_std_code"),
            }
            for p in compare_pairs
            if isinstance(p, dict)
        ]
        sections.append(
            f"""
<section>
  <h2>三、指标对比编排（步骤 4）</h2>
  <h3>对比行（compare_pairs）</h3>
  {_dict_rows_table(pair_rows, [("publication_std_code", "发布侧标准号（N）"), ("latest_std_code", "最新侧标准号（N+M）")])}
  <h3>国标指标解析状态</h3>
  {_dict_rows_table(std_statuses, [("std_code", "标准号"), ("status", "状态"), ("error_message", "错误信息")])}
  <h3>企标技术指标（节选）</h3>
  {_dict_rows_table(_indicator_rows(enterprise_indicators), [("name", "指标名称"), ("value", "指标值"), ("type", "类型")])}
</section>
"""
        )
    else:
        sections.append(
            f"""
<section>
  <h2>三、企标技术指标（步骤 1）</h2>
  {_dict_rows_table(_indicator_rows(enterprise_indicators), [("name", "指标名称"), ("value", "指标值"), ("type", "类型")])}
</section>
"""
        )

    sections.append(
        f"""
<section>
  <h2>四、指标对比结论（步骤 5）</h2>
  <p><strong>摘要：</strong>{_esc(compare_summary or "—")}</p>
  {_markdown_pipe_table_to_html(compare_markdown)}
</section>
"""
    )

    sections.append(
        f"""
<section>
  <h2>五、合规评价结论</h2>
  <table class="meta">
    <tr><th>描述性合规</th><td>{_esc(_result_label(er.get("descriptive_result")))}</td></tr>
    <tr><th>引用合规</th><td>{_esc(_result_label(er.get("reference_result")))}</td></tr>
    <tr><th>指标对比</th><td>{_esc(_result_label(er.get("indicator_result")))}</td></tr>
    <tr><th>总体结论</th><td><strong>{_esc(_result_label(er.get("overall_result")))}</strong></td></tr>
  </table>
</section>
"""
    )

    body = "\n".join(sections)
    title = f"合规性评价报告 — {subject_code}"
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{_esc(title)}</title>
  <style>
    body {{ font-family: "Segoe UI", "Microsoft YaHei", sans-serif; margin: 2rem; color: #1a1a1a; line-height: 1.5; }}
    h1 {{ font-size: 1.6rem; border-bottom: 2px solid #2563eb; padding-bottom: 0.4rem; }}
    h2 {{ font-size: 1.2rem; margin-top: 2rem; color: #1e40af; }}
    h3 {{ font-size: 1rem; margin-top: 1rem; }}
    section {{ margin-bottom: 1.5rem; }}
    table.meta {{ border-collapse: collapse; width: 100%; max-width: 720px; }}
    table.meta th {{ text-align: left; width: 160px; padding: 0.35rem 0.6rem; background: #f1f5f9; border: 1px solid #e2e8f0; }}
    table.meta td {{ padding: 0.35rem 0.6rem; border: 1px solid #e2e8f0; }}
    table.data {{ border-collapse: collapse; width: 100%; font-size: 0.92rem; }}
    table.data th, table.data td {{ border: 1px solid #cbd5e1; padding: 0.35rem 0.5rem; vertical-align: top; }}
    table.data th {{ background: #eff6ff; }}
    table.data tr:nth-child(even) td {{ background: #f8fafc; }}
    .muted {{ color: #64748b; }}
    pre {{ background: #f8fafc; padding: 0.75rem; overflow-x: auto; border: 1px solid #e2e8f0; }}
    @media print {{ body {{ margin: 1cm; }} }}
  </style>
</head>
<body>
  <h1>{_esc(title)}</h1>
  <p class="muted">本报告由系统根据合规评价各步骤结果自动汇总生成，无需 Word 模板。</p>
  {body}
</body>
</html>
"""


def generate_compliance_report(
    task: ComplianceEvaluationTask,
    evaluation_result: dict[str, Any] | None = None,
) -> str:
    """写入 MEDIA_ROOT/compliance_certs/{task_id}/compliance_evaluation_report.html，返回相对路径。"""
    root = Path(settings.MEDIA_ROOT) / "compliance_certs" / str(task.id)
    root.mkdir(parents=True, exist_ok=True)
    path = root / _REPORT_FILENAME
    html_text = build_compliance_report_html(task, evaluation_result)
    path.write_text(html_text, encoding="utf-8")
    return str(path.relative_to(Path(settings.MEDIA_ROOT)))
