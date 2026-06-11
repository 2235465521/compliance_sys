"""Generate draw.io business flowchart for novelty search and duplicate check."""
from __future__ import annotations

import html
from pathlib import Path


def node(cid: int, text: str, style: str, x: int, y: int, w: int, h: int) -> str:
    val = html.escape(text).replace("\n", "&#xa;")
    return (
        f'<mxCell id="{cid}" value="{val}" style="{style}" vertex="1" parent="1">'
        f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>'
    )


def edge(eid: int, src: int, tgt: int, label: str = "", dashed: bool = False) -> str:
    style = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;"
    if dashed:
        style += "dashed=1;"
    return (
        f'<mxCell id="{eid}" value="{html.escape(label)}" style="{style}" edge="1" parent="1" '
        f'source="{src}" target="{tgt}"><mxGeometry relative="1" as="geometry"/></mxCell>'
    )


def main() -> None:
    title = "text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontSize=16;fontStyle=1;"
    section = "text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontSize=14;fontStyle=1;"
    terminal = "ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;"
    process = "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;align=center;"
    decision = "rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;align=center;"
    note = "rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;align=left;spacingLeft=6;fontSize=11;"
    error = "rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;align=center;"

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

    add("title", "查新 / 查重业务程序实现业务流程图", title, 150, 20, 600, 40)

    # ── 查新 ──
    add("ns_sec", "【查新功能】/api/v1/novelty-search", section, 200, 70, 500, 30)
    add("ns_start", "开始 (查新)", terminal, cx + 110, 110, 80, 40)

    y = 170
    for key, text in [
        (
            "ns1",
            "用户点击「创建查新任务」\n填写企标号 qb_code\n可选上传企标文件 (multipart file)",
        ),
        (
            "ns2",
            "POST /api/v1/novelty-search/tasks\nmultipart: qb_code + source + file",
        ),
        (
            "ns3",
            "后端 find_history_for_qb_code\n汇聚合规评价 + 批量规范性引用历史\n生成 reference_sheet / indicators",
        ),
    ]:
        add(key, text, process, cx, y, w, h)
        y += 92

    add("ns_dec", "存在\n历史引用?", decision, cx + 60, y, dw, dh)
    y += 115
    add(
        "ns_err",
        "返回 HTTP 422\nempty_history\n该企标号无合规/批量记录",
        error,
        630,
        y - 115,
        250,
        h,
    )
    add(
        "ns4",
        "写入 novelty_search_task\nstatus = pending_confirm\n返回 201 + 专用表 reference_sheet",
        process,
        cx,
        y,
        w,
        h,
    )
    y += 92
    for key, text in [
        (
            "ns5",
            "GET /api/v1/novelty-search/tasks/{id}\n或 GET /tasks 列表\n前端展示专用表待确认",
        ),
        (
            "ns6",
            "可选：PATCH /tasks/{id}/reference-sheet\n编辑专用表草稿 rows[]",
        ),
        (
            "ns7",
            "POST /tasks/{id}/confirm-sheet\n确认专用表并触发比对",
        ),
        (
            "ns8",
            "build_compare_rows +\nresolve_reference_for_parse_context\n三列谱系比对 → status = completed",
        ),
        (
            "ns9",
            "GET /tasks/{id}\n展示 compare_rows / task_conclusion\n可选 GET /tasks/{id}/indicators",
        ),
        (
            "ns10",
            "可选：POST /tasks/{id}/report\n当前返回 HTTP 501\n(PDF 报告尚未实现)",
        ),
    ]:
        add(key, text, process, cx, y, w, h)
        y += 92

    add("ns_end", "结束 (查新)", terminal, cx + 110, y + 10, 80, 40)
    ns_end_y = y + 10

    add(
        "ns_note",
        "说明：查新不走 Dify 关键词检索\n"
        "核心是按企标号汇聚历史引用 + 谱系查新比对\n"
        "失败任务可 POST /tasks/{id}/retry 重试",
        note,
        630,
        170,
        280,
        90,
    )

    # ── 查重 ──
    dc_start_y = ns_end_y + 80
    add("dc_sec", "【查重功能】/api/v1/duplicate-check", section, 200, dc_start_y, 500, 30)
    add("dc_start", "开始 (查重)", terminal, cx + 110, dc_start_y + 40, 80, 40)

    y = dc_start_y + 100
    add(
        "dc1",
        "用户进入查重页面\n输入标准名称关键词\n或填写立项意图 + 候选国标号",
        process,
        cx,
        y,
        w,
        h,
    )
    y += 92
    add("dc_dec", "检查\n类型?", decision, cx + 60, y, dw, dh)
    y += 115

    add(
        "dc_name1",
        "POST /api/v1/duplicate-check/name-check\nBody: { keyword }\n(兼容 /api/duplicate/name-check/)",
        process,
        20,
        y,
        260,
        h,
    )
    add(
        "dc_name2",
        "run_name_check\nnational_standard_basic LIKE 检索\n+ difflib 相似度评分排序",
        process,
        20,
        y + 92,
        260,
        h,
    )
    add(
        "dc_name3",
        "前端展示候选国标列表\nstd_code / std_name / similarity\n(无固定重复率阈值分支)",
        process,
        20,
        y + 184,
        260,
        h,
    )

    add(
        "dc_sem1",
        "POST /api/v1/duplicate-check/semantic-check\nBody: intent_text + candidate_ids[]",
        process,
        630,
        y,
        260,
        h,
    )
    add(
        "dc_sem2",
        "投递 Celery run_semantic_check_task\n(无 Redis 时同步执行)\nrun_semantic_ranking 语义排序",
        process,
        630,
        y + 92,
        260,
        h,
    )
    add(
        "dc_sem3",
        "返回 task_id + 受理消息\n结果写入日志\n(暂无 GET 轮询接口)",
        process,
        630,
        y + 184,
        260,
        h,
    )

    dc_end_y = y + 280
    add("dc_end", "结束 (查重)", terminal, cx + 110, dc_end_y, 80, 40)

    add(
        "dc_note",
        "说明：当前查重为「名称快查 + 语义立项」\n"
        "非文档全文上传查重，也无 duplicate-check/tasks 接口",
        note,
        cx,
        dc_end_y + 60,
        300,
        70,
    )

    eid = cid
    edge_xml = [
        edge(eid := eid + 1, ids["ns_start"], ids["ns1"]),
        edge(eid := eid + 1, ids["ns1"], ids["ns2"]),
        edge(eid := eid + 1, ids["ns2"], ids["ns3"]),
        edge(eid := eid + 1, ids["ns3"], ids["ns_dec"]),
        edge(eid := eid + 1, ids["ns_dec"], ids["ns4"], "是"),
        edge(eid := eid + 1, ids["ns_dec"], ids["ns_err"], "否"),
        edge(eid := eid + 1, ids["ns_err"], ids["ns_end"]),
        edge(eid := eid + 1, ids["ns4"], ids["ns5"]),
        edge(eid := eid + 1, ids["ns5"], ids["ns6"]),
        edge(eid := eid + 1, ids["ns6"], ids["ns7"]),
        edge(eid := eid + 1, ids["ns7"], ids["ns8"]),
        edge(eid := eid + 1, ids["ns8"], ids["ns9"]),
        edge(eid := eid + 1, ids["ns9"], ids["ns10"]),
        edge(eid := eid + 1, ids["ns10"], ids["ns_end"]),
        edge(eid := eid + 1, ids["ns_end"], ids["dc_start"]),
        edge(eid := eid + 1, ids["dc_start"], ids["dc1"]),
        edge(eid := eid + 1, ids["dc1"], ids["dc_dec"]),
        edge(eid := eid + 1, ids["dc_dec"], ids["dc_name1"], "名称快查"),
        edge(eid := eid + 1, ids["dc_dec"], ids["dc_sem1"], "语义立项"),
        edge(eid := eid + 1, ids["dc_name1"], ids["dc_name2"]),
        edge(eid := eid + 1, ids["dc_name2"], ids["dc_name3"]),
        edge(eid := eid + 1, ids["dc_name3"], ids["dc_end"]),
        edge(eid := eid + 1, ids["dc_sem1"], ids["dc_sem2"]),
        edge(eid := eid + 1, ids["dc_sem2"], ids["dc_sem3"]),
        edge(eid := eid + 1, ids["dc_sem3"], ids["dc_end"]),
    ]

    page_height = dc_end_y + 180
    xml = f"""<mxfile host="app.diagrams.net" agent="Cursor" version="24.0.0">
  <diagram id="novelty-duplicate-flow" name="查新查重业务流程">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="920" pageHeight="{page_height}" math="0" shadow="0">
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
    out = Path(__file__).resolve().parents[1] / "novelty_duplicate_flow.drawio"
    out.write_text(xml, encoding="utf-8")
    print(f"written: {out}")


if __name__ == "__main__":
    main()
