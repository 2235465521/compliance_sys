"""Generate draw.io business flowchart for batch normative reference evaluation."""
from __future__ import annotations

import html
from pathlib import Path


def node(cid: int, text: str, style: str, x: int, y: int, w: int, h: int) -> str:
    val = html.escape(text).replace("\n", "&#xa;")
    return (
        f'<mxCell id="{cid}" value="{val}" style="{style}" vertex="1" parent="1">'
        f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>'
    )


def edge(eid: int, src: int, tgt: int, label: str = "") -> str:
    style = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;"
    return (
        f'<mxCell id="{eid}" value="{html.escape(label)}" style="{style}" edge="1" parent="1" '
        f'source="{src}" target="{tgt}"><mxGeometry relative="1" as="geometry"/></mxCell>'
    )


def main() -> None:
    title = "text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontSize=16;fontStyle=1;"
    terminal = "ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;"
    process = "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;align=center;"
    decision = "rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;align=center;"
    note = "rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;align=left;spacingLeft=6;fontSize=11;"

    cells: list[str] = []
    cid = 2
    ids: dict[str, int] = {}

    def add(key: str, text: str, style: str, x: int, y: int, w: int, h: int) -> None:
        nonlocal cid
        cells.append(node(cid, text, style, x, y, w, h))
        ids[key] = cid
        cid += 1

    cx, w, h = 300, 300, 72
    dw, dh = 180, 90

    add("title", "批量合规性评价程序实现业务流程图", title, 150, 20, 600, 40)
    add("start", "开始", terminal, cx + 110, 70, 80, 40)

    y = 130
    for key, text in [
        ("s1", "用户访问批量合规性评价子页面\n进入 /batch-normative-reference"),
        ("s2", "前端加载批次列表\nGET /api/v1/batch-normative-reference/jobs/\n?page=1&page_size=20"),
        ("s3", "后端查询 batch_normative_reference_job\n返回分页 {results, total, page, page_size}"),
        ("s4", "前端表格展示批次列表\n显示：批次ID / 状态 / 文件总数 / 已完成 / 失败数 / 创建时间"),
    ]:
        add(key, text, process, cx, y, w, h)
        y += 92

    add("dec1", "用户选择\n操作类型", decision, cx + 60, y, dw, dh)
    y += 115

    # 主流程：新建批量评价
    for key, text in [
        ("m1", "① 用户选择多个企标文件\n可选填写 label 批次标签"),
        ("m2", "② 上传文件\nPOST /api/v1/batch-normative-reference/jobs/\nmultipart: files[] + label"),
        ("m3", "后端 create_job_from_uploads\n校验 Dify 配置 / 文件数 / MySQL"),
        ("m4", "写入 batch_normative_reference_job\n+ batch_normative_reference_item\n文件存 MEDIA_ROOT/batch_normative_reference/{id}/"),
        ("m5", "投递 Celery 异步任务\nprocess_batch_normative_reference_job.delay(job_id)"),
        ("m6", "返回 201 + Job 详情\n前端保存 job_id 并开始轮询"),
        ("m7", "③ 轮询进度\nGET /jobs/{job_id}/ 每 1~3 秒"),
    ]:
        add(key, text, process, cx, y, w, h)
        y += 92

    add("dec2", "job.status\n= completed\n或 failed ?", decision, cx + 60, y, dw, dh)
    y += 110
    add("m8", "④ 展示各文件处理结果\nitems[].references_resolved\nfile_compliance_outcome / error_message", process, cx, y, w, h)
    y += 92
    add("dec3", "需要人工\n修订引用?", decision, cx + 60, y, dw, dh)
    y += 110
    add("p1", "人工修订引用\nPATCH /jobs/{job_id}/items/{item_id}/\nBody: { references_resolved: [...] }", process, cx, y, w, h)
    y += 92
    add("p2", "后端 enrich 并持久化 reference_resolution_json\nGET 时重算 file_compliance_outcome", process, cx, y, w, h)
    y += 92
    add("end", "结束", terminal, cx + 110, y + 20, 80, 40)

    # 左分支：查看详情
    add("l1", "查看批次详情\nGET /jobs/{job_id}/\n返回 Job + 全部 items 明细", process, 20, 620, 250, h)
    add("l2", "前端展示每个企标文件\n引用查新结果 references_resolved\n合规结论 file_compliance_outcome", process, 20, 715, 250, h)
    add("l3", "可选：单条子项\nGET /jobs/{job_id}/items/{item_id}/", process, 20, 810, 250, 58)

    # 右分支：删除批次
    add("r1", "删除批次\nDELETE /jobs/{job_id}/\n删除 DB 记录 + 上传目录", process, 630, 650, 250, h)
    add("r2", "返回 204 No Content\n前端刷新批次列表", process, 630, 745, 250, 58)

    # 校验分支
    add("dec_dify", "Dify\n已配置?", decision, 680, 900, 120, 80)
    add("err503", "返回 HTTP 503\ndetail: 未配置 Dify\n前端弹窗提示", process, 630, 1020, 250, h)

    # Celery 说明框
    add(
        "celery",
        "【Celery Worker 异步处理】\n"
        "job.status → processing\n"
        "逐 item: pending → running\n"
        "→ Dify 批量工作流 (run_batch_normative_ref_workflow)\n"
        "→ 提取 referenced_std_codes\n"
        "→ resolve_reference_for_parse_context 谱系查新\n"
        "→ 写入 parse_result_json / reference_resolution_json\n"
        "→ item.status = completed | failed\n"
        "job.status → completed",
        note,
        630,
        820,
        280,
        150,
    )

    eid = cid
    edge_xml = [
        edge(eid := eid + 1, ids["start"], ids["s1"]),
        edge(eid := eid + 1, ids["s1"], ids["s2"]),
        edge(eid := eid + 1, ids["s2"], ids["s3"]),
        edge(eid := eid + 1, ids["s3"], ids["s4"]),
        edge(eid := eid + 1, ids["s4"], ids["dec1"]),
        edge(eid := eid + 1, ids["dec1"], ids["m1"], "新建批量评价"),
        edge(eid := eid + 1, ids["dec1"], ids["l1"], "查看详情"),
        edge(eid := eid + 1, ids["dec1"], ids["r1"], "删除批次"),
        edge(eid := eid + 1, ids["m1"], ids["m2"]),
        edge(eid := eid + 1, ids["m2"], ids["m3"]),
        edge(eid := eid + 1, ids["m3"], ids["dec_dify"]),
        edge(eid := eid + 1, ids["dec_dify"], ids["m4"], "是"),
        edge(eid := eid + 1, ids["dec_dify"], ids["err503"], "否"),
        edge(eid := eid + 1, ids["m4"], ids["m5"]),
        edge(eid := eid + 1, ids["m5"], ids["m6"]),
        edge(eid := eid + 1, ids["m6"], ids["m7"]),
        edge(eid := eid + 1, ids["m7"], ids["dec2"]),
        edge(eid := eid + 1, ids["dec2"], ids["m7"], "否"),
        edge(eid := eid + 1, ids["dec2"], ids["m8"], "是"),
        edge(eid := eid + 1, ids["m8"], ids["dec3"]),
        edge(eid := eid + 1, ids["dec3"], ids["p1"], "是"),
        edge(eid := eid + 1, ids["dec3"], ids["end"], "否"),
        edge(eid := eid + 1, ids["p1"], ids["p2"]),
        edge(eid := eid + 1, ids["p2"], ids["end"]),
        edge(eid := eid + 1, ids["l1"], ids["l2"]),
        edge(eid := eid + 1, ids["l2"], ids["l3"]),
        edge(eid := eid + 1, ids["l3"], ids["end"]),
        edge(eid := eid + 1, ids["r1"], ids["r2"]),
        edge(eid := eid + 1, ids["r2"], ids["end"]),
    ]
    edge_xml.append(
        f'<mxCell id="{eid + 1}" value="异步" style="edgeStyle=orthogonalEdgeStyle;rounded=0;dashed=1;html=1;" '
        f'edge="1" parent="1" source="{ids["m5"]}" target="{ids["celery"]}">'
        f'<mxGeometry relative="1" as="geometry"/></mxCell>'
    )

    xml = f"""<mxfile host="app.diagrams.net" agent="Cursor" version="24.0.0">
  <diagram id="batch-normative-ref-flow" name="批量合规性评价业务流程">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="920" pageHeight="1500" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
{chr(10).join(cells)}
{chr(10).join(edge_xml)}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
"""
    out = Path(__file__).resolve().parents[1] / "batch_normative_reference_flow.drawio"
    out.write_text(xml, encoding="utf-8")
    print(f"written: {out}")


if __name__ == "__main__":
    main()
