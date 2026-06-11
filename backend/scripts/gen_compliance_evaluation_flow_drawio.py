"""Generate draw.io business flowchart for compliance evaluation (six-step wizard)."""
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
    terminal = "ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;align=center;"
    process = "rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;align=center;"
    decision = "rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;align=center;"
    note = "rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;align=left;spacingLeft=6;fontSize=11;"
    api = "text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontSize=11;fontColor=#333333;"

    cx, w = 250, 400
    dw, dh = 200, 90
    gap = 14

    cells: list[str] = []
    cid = 2
    ids: dict[str, int] = {}
    y = 20

    def place(
        key: str,
        text: str,
        style: str,
        height: int,
        x: int | None = None,
        width: int | None = None,
    ) -> None:
        nonlocal cid, y
        px = cx if x is None else x
        pw = width if width is not None else (w if x is None else 320)
        cells.append(node(cid, text, style, px, y, pw, height))
        ids[key] = cid
        cid += 1
        y += height + gap

    place("title", "合规评价程序实现业务流程图", title, 36, x=130, width=640)
    y += 6
    place("start", "开始", terminal, 40, x=cx + (w - 80) // 2, width=80)
    y += 4

    place("s1", "① 用户填写任务信息\n点击「新建评价任务」", process, 56)
    cells.append(node(cid, "前端调用 POST /api/v1/compliance/evaluations", api, cx, y, w, 22))
    ids["api1"] = cid
    cid += 1
    y += 28

    place("s1b", "后端创建 ComplianceEvaluationTask\n写入 DB，current_step=1，返回 task_id", process, 56)
    place("s2", "② 用户选择企标文件（PDF/Word）\n点击上传", process, 56)
    cells.append(
        node(cid, "POST /api/v1/compliance/evaluations/{task_id}/upload", api, cx, y, w, 22)
    )
    ids["api2"] = cid
    cid += 1
    y += 28

    place("s2b", "后端保存文件至 MEDIA_ROOT\n更新 uploaded_file_path / parse_status", process, 56)

    dec_async_y = y
    place("dec_async", "COMPLIANCE_DIFY\n_PARSE_ASYNC\n= true ?", decision, dh, x=cx + (w - dw) // 2, width=dw)

    place(
        "async",
        "是：任务入队 Celery，parse_status=running\n前端轮询 GET /evaluations/{task_id}\n直至 completed | failed",
        process,
        72,
    )
    place(
        "wf1",
        "否：Dify 工作流 ① 企标解析（同步）\nPOST /v1/files/upload + POST /v1/workflows/run\nQB_init_info → parse_result_json",
        process,
        80,
    )

    dec_parse_y = y
    place("dec_parse", "Dify 解析\n是否成功？", decision, dh, x=cx + (w - dw) // 2, width=dw)

    ok_y = y
    place("ok", "是：写入 parse_result_json\nparse_status=completed", process, 56)

    fail_x = cx + w + 36
    cells.append(
        node(
            cid,
            "否：写入 parse_error\n前端展示错误，可重新上传",
            process,
            fail_x,
            dec_parse_y,
            320,
            56,
        )
    )
    ids["fail"] = cid
    cid += 1
    cells.append(
        node(cid, "结束（失败）", terminal, fail_x + 120, dec_parse_y + 68, 80, 40)
    )
    ids["end_fail"] = cid
    cid += 1

    y = ok_y + 56 + gap
    place(
        "st1",
        "③ Step1 结构审核\nGET .../step/1 → POST .../step/1/confirm\n current_step → 2",
        process,
        64,
    )
    place(
        "st2",
        "④ Step2 引用标准匹配\nGET .../step/2 → POST .../step/2/confirm\n写入 reference_mapping",
        process,
        64,
    )
    place(
        "st3",
        "⑤ Step3 引用版本核查\nGET .../step/3/reference-latest\nPOST .../step/3/supplements（可选）\nPOST .../step/3/confirm → current_step=4",
        process,
        80,
    )
    place(
        "wf2",
        "【步骤 4】Dify 工作流 ② 国标指标提取（按需）\nPOST .../step/4/indicators/ensure?target_std_codes=",
        note,
        64,
    )
    place(
        "st4",
        "⑥ Step4 指标审核\nGET .../step/4/indicators + 人工审核\nPOST .../step/4/confirm → current_step=5",
        process,
        64,
    )
    place(
        "wf3",
        "【步骤 5】Dify 工作流 ③ 指标逐条对比\nGET/POST .../step/5/compare → compare_result_json",
        note,
        56,
    )
    place(
        "st5",
        "⑦ Step5 对比结果审核\nPOST .../step/5/confirm → current_step=6",
        process,
        56,
    )
    place(
        "st6",
        "⑧ Step6 生成合规汇总报告\nGET .../summary + GET .../report\nHTML 汇总报告（无 Word 模板）",
        process,
        64,
    )
    y += 6
    place("end", "结束", terminal, 40, x=cx + (w - 80) // 2, width=80)

    eid = cid
    edges = [
        edge(eid := eid + 1, ids["start"], ids["s1"]),
        edge(eid := eid + 1, ids["s1"], ids["api1"]),
        edge(eid := eid + 1, ids["api1"], ids["s1b"]),
        edge(eid := eid + 1, ids["s1b"], ids["s2"]),
        edge(eid := eid + 1, ids["s2"], ids["api2"]),
        edge(eid := eid + 1, ids["api2"], ids["s2b"]),
        edge(eid := eid + 1, ids["s2b"], ids["dec_async"]),
        edge(eid := eid + 1, ids["dec_async"], ids["async"], "是"),
        edge(eid := eid + 1, ids["dec_async"], ids["wf1"], "否"),
        edge(eid := eid + 1, ids["async"], ids["dec_parse"]),
        edge(eid := eid + 1, ids["wf1"], ids["dec_parse"]),
        edge(eid := eid + 1, ids["dec_parse"], ids["ok"], "是"),
        edge(eid := eid + 1, ids["dec_parse"], ids["fail"], "否"),
        edge(eid := eid + 1, ids["fail"], ids["end_fail"]),
        edge(eid := eid + 1, ids["ok"], ids["st1"]),
        edge(eid := eid + 1, ids["st1"], ids["st2"]),
        edge(eid := eid + 1, ids["st2"], ids["st3"]),
        edge(eid := eid + 1, ids["st3"], ids["wf2"]),
        edge(eid := eid + 1, ids["wf2"], ids["st4"]),
        edge(eid := eid + 1, ids["st4"], ids["wf3"]),
        edge(eid := eid + 1, ids["wf3"], ids["st5"]),
        edge(eid := eid + 1, ids["st5"], ids["st6"]),
        edge(eid := eid + 1, ids["st6"], ids["end"]),
    ]

    page_h = y + 60
    xml = f"""<mxfile host="app.diagrams.net" agent="Cursor" version="24.0.0">
  <diagram id="compliance-eval-flow" name="合规评价业务流程">
    <mxGraphModel dx="1200" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="900" pageHeight="{page_h}" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
{chr(10).join(cells)}
{chr(10).join(edges)}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
"""
    out = Path(__file__).resolve().parents[1] / "compliance_evaluation_flow.drawio"
    out.write_text(xml, encoding="utf-8")
    print(f"written: {out}")


if __name__ == "__main__":
    main()
