"""Generate draw.io business flowchart for dashboard data aggregation."""
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
        pw = width if width is not None else w
        cells.append(node(cid, text, style, px, y, pw, height))
        ids[key] = cid
        cid += 1
        y += height + gap

    place("title", "仪表盘数据聚合程序实现业务流程图", title, 36, x=130, width=640)
    y += 6
    place("start", "开始", terminal, 40, x=cx + (w - 80) // 2, width=80)
    y += 4

    place("s1", "用户访问 /dashboard 页面", process, 48)
    place(
        "s2",
        "前端并行发起 API 请求\n（Promise.all 或分别调用）",
        process,
        48,
    )
    place(
        "api1",
        "GET /api/v1/dashboard/summary/\n国标主表总览：total / types(std_category) / states",
        note,
        56,
    )
    place(
        "api2",
        "GET /api/v1/dashboard/abolition-hints/\n近期废止 / 即将废止提示（abolition_date）",
        note,
        56,
    )
    place(
        "api3",
        "GET /api/v1/standards/statistics/\n（或与 summary 同源的标准库统计）",
        note,
        48,
    )
    place(
        "compat",
        "兼容路径（可选）：\nGET /api/standards/dashboard-alerts/\nGET /api/standards/basic-search/?q=",
        note,
        48,
    )
    place(
        "s3",
        "后端 dashboard.services.aggregate\n· national_standard_basic_statistics()\n· abolition_hints() 查 national_standard_basic",
        process,
        72,
    )
    place(
        "s4",
        "前端接收数据并渲染\n· 饼图：std_category 类别分布\n· 列表：upcoming / recent 废止预警\n· 统计卡片：total、status_groups 等",
        process,
        80,
    )

    dec_search_y = y
    place("dec_search", "用户输入\n标准号查询？", decision, dh, x=cx + (w - dw) // 2, width=dw)
    place(
        "lookup",
        "是：GET /api/v1/dashboard/quick-lookup/?std_code=xxx\n精确匹配 national_standard_basic\n返回单条标准详情",
        process,
        64,
    )
    place(
        "popup",
        "前端弹窗展示标准详情\n标准号 / 名称 / 状态 / 实施日期等",
        process,
        56,
    )

    fail_x = cx + w + 36
    cells.append(
        node(cid, "否：跳过快捷查询", process, fail_x, dec_search_y, 280, 40)
    )
    ids["skip"] = cid
    cid += 1

    place(
        "s5",
        "页面持续展示，支持手动刷新\n用户浏览完毕离开页面",
        process,
        48,
    )
    place("end", "结束", terminal, 40, x=cx + (w - 80) // 2, width=80)

    eid = cid
    edges = [
        edge(eid := eid + 1, ids["start"], ids["s1"]),
        edge(eid := eid + 1, ids["s1"], ids["s2"]),
        edge(eid := eid + 1, ids["s2"], ids["api1"]),
        edge(eid := eid + 1, ids["api1"], ids["api2"]),
        edge(eid := eid + 1, ids["api2"], ids["api3"]),
        edge(eid := eid + 1, ids["api3"], ids["compat"]),
        edge(eid := eid + 1, ids["compat"], ids["s3"]),
        edge(eid := eid + 1, ids["s3"], ids["s4"]),
        edge(eid := eid + 1, ids["s4"], ids["dec_search"]),
        edge(eid := eid + 1, ids["dec_search"], ids["lookup"], "是"),
        edge(eid := eid + 1, ids["dec_search"], ids["skip"], "否"),
        edge(eid := eid + 1, ids["lookup"], ids["popup"]),
        edge(eid := eid + 1, ids["popup"], ids["s5"]),
        edge(eid := eid + 1, ids["skip"], ids["s5"]),
        edge(eid := eid + 1, ids["s5"], ids["end"]),
    ]

    page_h = y + 60
    xml = f"""<mxfile host="app.diagrams.net" agent="Cursor" version="24.0.0">
  <diagram id="dashboard-flow" name="仪表盘数据聚合业务流程">
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
    out = Path(__file__).resolve().parents[1] / "dashboard_flow.drawio"
    out.write_text(xml, encoding="utf-8")
    print(f"written: {out}")


if __name__ == "__main__":
    main()
