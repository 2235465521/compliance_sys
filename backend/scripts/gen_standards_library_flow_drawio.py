"""Generate draw.io business flowchart for standard library management."""
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

    place("title", "标准库管理程序实现业务流程图", title, 36, x=130, width=640)
    y += 6
    place("start", "开始", terminal, 40, x=cx + (w - 80) // 2, width=80)
    y += 4

    place("s1", "用户访问 /standard-library\n进入标准库子页面", process, 56)
    place("s2", "前端加载标准注册表页面", process, 48)
    cells.append(
        node(
            cid,
            "GET /api/v1/standards/?page=1&page_size=10&search=",
            api,
            cx,
            y,
            w,
            22,
        )
    )
    ids["api_list"] = cid
    cid += 1
    y += 28

    place(
        "s3",
        "后端查询 national_standard_basic\n支持 std_code / std_name 模糊搜索\n返回 {count, results, page, page_size}",
        process,
        72,
    )
    place(
        "s4",
        "前端 ProTable 渲染标准列表\n显示：标准号 / 名称 / 状态 / 实施日期等",
        process,
        56,
    )
    place(
        "ops",
        "用户可选操作（列表页）\n· 查看详情  · 查看正文  · 批量导入元数据",
        note,
        48,
    )

    place(
        "op_detail",
        "【查看详情】\nGET /api/v1/standards/detail-info/?bz_id=xxx\n联查 basic + extension，抽屉展示",
        process,
        64,
    )
    place(
        "op_pedigree",
        "【谱系图】（从详情进入）\nGET /api/get_tree_data/?bz_id=xxx\nECharts 树图展示版本演化",
        note,
        56,
    )
    place(
        "op_preview",
        "【查看正文】\nGET /api/v1/standards/detail-text/preview/?bz_id=xxx\nPDF inline 或外链 302",
        process,
        64,
    )

    place(
        "i1",
        "【批量导入 ①】下载模板\nGET /api/v1/standards/metadata-import-template/?format=xlsx",
        process,
        56,
    )
    place(
        "i2",
        "【批量导入 ②】上传填写好的文件\nPOST /api/v1/standards/metadata-batch-import/\nmultipart 字段名 files[]",
        process,
        72,
    )

    dec_dup_y = y
    place("dec_dup", "存在重复\n标准号？", decision, dh, x=cx + (w - dw) // 2, width=dw)

    ok_y = y
    place(
        "ok",
        "否：批量写入 national_standard_basic\n返回 {imported, rejected_duplicates}\n前端展示导入结果",
        process,
        64,
    )

    fail_x = cx + w + 36
    cells.append(
        node(
            cid,
            "是：返回 HTTP 400\ndetail 含重复行说明\n前端弹窗提示",
            process,
            fail_x,
            dec_dup_y,
            320,
            64,
        )
    )
    ids["fail"] = cid
    cid += 1
    cells.append(
        node(cid, "结束（未入库）", terminal, fail_x + 120, dec_dup_y + 72, 80, 40)
    )
    ids["end_fail"] = cid
    cid += 1

    y = ok_y + 64 + gap
    place("end", "结束", terminal, 40, x=cx + (w - 80) // 2, width=80)

    eid = cid
    edges = [
        edge(eid := eid + 1, ids["start"], ids["s1"]),
        edge(eid := eid + 1, ids["s1"], ids["s2"]),
        edge(eid := eid + 1, ids["s2"], ids["api_list"]),
        edge(eid := eid + 1, ids["api_list"], ids["s3"]),
        edge(eid := eid + 1, ids["s3"], ids["s4"]),
        edge(eid := eid + 1, ids["s4"], ids["ops"]),
        edge(eid := eid + 1, ids["ops"], ids["op_detail"]),
        edge(eid := eid + 1, ids["op_detail"], ids["op_pedigree"]),
        edge(eid := eid + 1, ids["op_pedigree"], ids["op_preview"]),
        edge(eid := eid + 1, ids["op_preview"], ids["i1"]),
        edge(eid := eid + 1, ids["i1"], ids["i2"]),
        edge(eid := eid + 1, ids["i2"], ids["dec_dup"]),
        edge(eid := eid + 1, ids["dec_dup"], ids["ok"], "否"),
        edge(eid := eid + 1, ids["dec_dup"], ids["fail"], "是"),
        edge(eid := eid + 1, ids["fail"], ids["end_fail"]),
        edge(eid := eid + 1, ids["ok"], ids["end"]),
    ]

    page_h = y + 60
    xml = f"""<mxfile host="app.diagrams.net" agent="Cursor" version="24.0.0">
  <diagram id="standards-library-flow" name="标准库管理业务流程">
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
    out = Path(__file__).resolve().parents[1] / "standards_library_flow.drawio"
    out.write_text(xml, encoding="utf-8")
    print(f"written: {out}")


if __name__ == "__main__":
    main()
