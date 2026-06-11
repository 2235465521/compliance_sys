from __future__ import annotations

import json
import re
from collections import defaultdict

from django.db.models import Q

from apps.standards.models import (
    NationalStandardBasic,
    NationalStandardExtension,
    StandardPedigree,
    StandardPedigreeRelation,
)

REL_PART_CHAIN = "part_chain"
_MAX_PART_CHAIN_SCAN = 400

# 与 national_standard_basic.replace_type / 业务约定一致（方括号内的整数键）
REPLACE_TYPE_LABELS: dict[int, str] = {
    -1: "无",
    1: "全部代替",
    2: "部分代替",
    3: "部分代完",
    4: "未知",
}

# `{[-1]:{…}}、{[1,1,…]:{码1、码2…}}、{{{[1]:{…}}、…}}`：括号平衡拆块；勿全局按整数键排序连成一条链。
_BLOCK_HEAD = re.compile(r"\{\s*\[\s*([\d,\s-]+)\s*\]\s*:\s*\{")


def _norm_code_key(s: str) -> str:
    """忽略空格、斜杠、`T`，便于 GB 1000… 与 GB/T 1000… 对齐。"""
    x = re.sub(r"[\s/]+", "", (s or "").upper())
    if x.startswith("GBT"):
        return "GB" + x[3:]
    return x


def _code_lookup_variants(hint: str) -> list[str]:
    c = (hint or "").strip()
    if not c:
        return []
    seen: dict[str, None] = {}
    for x in (c, re.sub(r"\s+", "", c), re.sub(r"\s+", " ", c).strip()):
        if x:
            seen.setdefault(x, None)
    m = re.match(r"^GB\s+(.+)$", c, re.I)
    if m:
        tail = m.group(1).strip()
        for v in (f"GB/T {tail}", f"GB/T{tail}", f"GB/{tail}", f"GB {tail}"):
            seen.setdefault(v, None)
    return list(seen.keys())


def lookup_basic_by_hint(hint: str) -> NationalStandardBasic | None:
    hint = (hint or "").strip()
    if not hint:
        return None
    for v in _code_lookup_variants(hint):
        o = NationalStandardBasic.objects.filter(std_code=v).first()
        if o:
            return o
        o = NationalStandardBasic.objects.filter(std_code__iexact=v).first()
        if o:
            return o
    nk = _norm_code_key(hint)
    tail = re.sub(r"^GB/?T?\s*", "", hint, flags=re.I).strip()[:48] or hint
    token = tail.split("-")[0].strip() if tail else ""
    if not token:
        return None
    qs = (
        NationalStandardBasic.objects.filter(std_code__icontains=token)
        .only("std_code", "std_name", "std_status")[:80]
    )
    for o in qs:
        if _norm_code_key(o.std_code) == nk:
            return o
    return None


def canonical_std_code_hint(hint: str) -> str:
    o = lookup_basic_by_hint(hint)
    return o.std_code if o else (hint or "").strip()


def extract_balanced_blocks(s: str) -> list[tuple[list[int], str]]:
    out: list[tuple[list[int], str]] = []
    pos = 0
    while pos < len(s):
        m = _BLOCK_HEAD.search(s, pos)
        if not m:
            break
        key_part = m.group(1)
        keys: list[int] = []
        for piece in key_part.split(","):
            piece = piece.strip()
            if not piece:
                continue
            try:
                keys.append(int(piece))
            except ValueError:
                continue
        if not keys:
            pos = m.end()
            continue
        start_content = m.end()
        depth = 1
        j = start_content
        while j < len(s):
            if s[j] == "{":
                depth += 1
            elif s[j] == "}":
                depth -= 1
                if depth == 0:
                    inner = s[start_content:j].strip()
                    out.append((keys, inner))
                    pos = j + 1
                    break
            j += 1
        else:
            break
    return out


def _split_ideographic_codes(body: str) -> list[str]:
    body = (body or "").strip()
    if not body:
        return []
    return [p.strip() for p in re.split(r"\s*[、]\s*", body) if p.strip()]


def _split_top_level_ideographic(s: str) -> list[str]:
    """按顶层 `、` 分段（花括号深度为 0 时分隔），与谱系链生成脚本里 `、`.join(chain_parts) 一致。"""
    s = (s or "").strip()
    if not s:
        return []
    depth = 0
    start = 0
    parts: list[str] = []
    for i, ch in enumerate(s):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == "、" and depth == 0:
            parts.append(s[start:i].strip())
            start = i + 1
    parts.append(s[start:].strip())
    return [p for p in parts if p]


def _get_year_std(s: str) -> int:
    ys = re.findall(r"\d{4}", str(s))
    return int(ys[-1]) if ys else 0


def _sort_key_std(n: str) -> tuple:
    """与生成脚本 `sort_key_node` 一致：新年份优先（遍历层内排序）。"""
    return (-_get_year_std(n), n)


def _relation_label_for_code_int(st: int) -> str:
    if st == -1:
        return REPLACE_TYPE_LABELS[-1]
    if st in REPLACE_TYPE_LABELS:
        return REPLACE_TYPE_LABELS[st]
    return REPLACE_TYPE_LABELS[4]


def _parse_bracket_dsl(s: str) -> tuple[list[str], list[tuple[str, str, str]], dict[str, tuple[int, int]]] | None:
    """
    解析库表 `part_chain` 花括号 DSL（与 Excel/脚本生成逻辑对齐）：
    - 顶层 `、` 分隔 **BFS 每一层**；
    - 第一层为 `[-1]:{最新标准}`；
    - 其后每层为若干 `{[st1,st2,…]:{子1、子2…}}`（单父一层一对花括号）或
      `{{…}、{…}}`（多父：块顺序与上一层父节点 **一一对应**）；
    - `[0]:{}` 表示该父无下代；
    - 方括号内整数与 `、` 分隔的子女 **一一对应**（长度不足时最后一个类型广播到剩余子女）。
    """
    s = (s or "").strip()
    if not s or "{[" not in s:
        return None

    segments = _split_top_level_ideographic(s)
    if not segments:
        return None

    edges: list[tuple[str, str, str]] = []
    order: list[str] = []
    layout: dict[str, tuple[int, int]] = {}

    def touch(x: str) -> None:
        x = (x or "").strip()
        if not x or x in order:
            return
        order.append(x)

    def lay(node: str, rank: int, col: int) -> None:
        x = (node or "").strip()
        if x:
            layout[x] = (rank, col)

    blocks0 = extract_balanced_blocks(segments[0])
    if not blocks0:
        return None

    parents_list: list[str] = []
    for keys, body in blocks0:
        body = (body or "").strip()
        codes = (
            _split_ideographic_codes(body)
            if ("、" in body or len(body) > 48)
            else ([body.strip()] if body.strip() else [])
        )
        if keys == [0] and not codes:
            continue
        if keys == [-1] or -1 in keys:
            for i, c in enumerate(codes):
                cc = c.strip()
                touch(cc)
                lay(cc, 0, i)
                parents_list.append(cc)
        else:
            for i, c in enumerate(codes):
                cc = c.strip()
                touch(cc)
                lay(cc, 0, len(parents_list))
                parents_list.append(cc)

    if not parents_list:
        return None

    for layer_idx, seg in enumerate(segments[1:], start=1):
        blocks = extract_balanced_blocks(seg)
        next_children_order: list[str] = []

        for bi, (keys, body) in enumerate(blocks):
            if bi >= len(parents_list):
                break
            parent = parents_list[bi]
            body = (body or "").strip()
            if keys == [0] and not body:
                continue
            children = (
                _split_ideographic_codes(body)
                if ("、" in body or len(body) > 48)
                else ([body.strip()] if body.strip() else [])
            )
            if not children:
                continue
            for j, raw_ch in enumerate(children):
                ch = raw_ch.strip()
                if not ch:
                    continue
                st = int(keys[j]) if j < len(keys) else int(keys[-1] if keys else 1)
                lbl = _relation_label_for_code_int(st)
                edges.append((parent, ch, lbl))
                touch(ch)
                next_children_order.append(ch)

        unique_next = list(dict.fromkeys(next_children_order))
        parents_list = sorted(unique_next, key=_sort_key_std)
        for col, node in enumerate(parents_list):
            lay(node, layer_idx, col)

    for a, b, _ in edges:
        touch(a)
        touch(b)

    if not order:
        return None
    return order, edges, layout


def _token_split_flat(text: str) -> list[str]:
    parts = re.split(r"[,，;；\|]+|\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _code_from_dict(n: dict) -> str | None:
    for k in ("std_code", "code", "bz_id"):
        v = n.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _walk_tree_dict(
    n: dict,
    parent: str | None,
    *,
    edges: list[tuple[str, str, str]],
    order: list[str],
) -> None:
    c = _code_from_dict(n)
    if not c:
        return
    order.append(c)
    if parent:
        edges.append((parent, c, REL_PART_CHAIN))
    for ch in n.get("children") or []:
        if isinstance(ch, dict):
            _walk_tree_dict(ch, c, edges=edges, order=order)
        elif isinstance(ch, str) and ch.strip():
            t = ch.strip()
            edges.append((c, t, REL_PART_CHAIN))
            order.append(t)


def parse_part_chain_for_graph(
    raw: str | None,
) -> tuple[list[str], list[tuple[str, str, str]], dict[str, tuple[int, int]]]:
    """
    解析 `part_chain` 文本。
    - 方括号 DSL：返回 `layout`（rank/col）供前端树形排布。
    - JSON / 纯分隔：layout 为按序列顺序 rank=0、col=i。
    """
    if raw is None or not str(raw).strip():
        return [], [], {}
    s = str(raw).strip()
    edges: list[tuple[str, str, str]] = []

    br = _parse_bracket_dsl(s)
    if br is not None:
        order, e_list, lay = br
        return order, e_list, lay

    if "{[" in s:
        return [], [], {}

    if s.startswith(("{", "[")):
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            data = None
        if data is not None:
            layout: dict[str, tuple[int, int]] = {}
            if isinstance(data, list):
                if data and all(isinstance(x, str) for x in data):
                    chain = [x.strip() for x in data if x and str(x).strip()]
                    for i, c in enumerate(chain):
                        layout[c] = (i, 0)
                    for i in range(len(chain) - 1):
                        edges.append((chain[i], chain[i + 1], REL_PART_CHAIN))
                    return chain, edges, layout
                chain: list[str] = []
                for item in data:
                    if isinstance(item, dict):
                        e: list[tuple[str, str, str]] = []
                        o: list[str] = []
                        _walk_tree_dict(item, None, edges=e, order=o)
                        edges.extend(e)
                        chain.extend(o)
                for i, c in enumerate(chain):
                    layout[c] = (i, 0)
                return chain, edges, layout
            if isinstance(data, dict):
                e, order = [], []
                _walk_tree_dict(data, None, edges=e, order=order)
                for i, c in enumerate(order):
                    layout[c] = (i, 0)
                return order, e, layout

    chain = _token_split_flat(s)
    layout = {c: (i, 0) for i, c in enumerate(chain)}
    for i in range(len(chain) - 1):
        edges.append((chain[i], chain[i + 1], REL_PART_CHAIN))
    return chain, edges, layout


def chain_contains_code(part_chain_raw: str | None, center: str) -> bool:
    if not part_chain_raw:
        return False
    o = NationalStandardBasic.objects.filter(std_code=center).first() or lookup_basic_by_hint(center)
    canonical = o.std_code if o else center
    nk_c = _norm_code_key(canonical)
    chain, _, _ = parse_part_chain_for_graph(part_chain_raw)
    for h in chain:
        oh = lookup_basic_by_hint(h)
        sid = oh.std_code if oh else h.strip()
        if sid == canonical or _norm_code_key(sid) == nk_c:
            return True
    return False


def parse_latest_std_codes(raw: str | None) -> list[str]:
    if raw is None or not str(raw).strip():
        return []
    return _token_split_flat(str(raw))


def find_pedigree_rows_for_std_code(center: str) -> list[StandardPedigree]:
    direct = list(StandardPedigree.objects.filter(std_code=center))
    if direct:
        return direct
    out: list[StandardPedigree] = []
    seen: set[int] = set()
    qs = (
        StandardPedigree.objects.filter(part_chain__contains=center)
        .only("id", "std_code", "part_chain", "latest_std_code", "ped_id")[:_MAX_PART_CHAIN_SCAN]
    )
    for row in qs:
        if chain_contains_code(row.part_chain, center) and row.id not in seen:
            seen.add(row.id)
            out.append(row)
    return out


def resolve_std_code(bz_id: str) -> str:
    """与列表/详情一致：bz_id 可为库 id 或 std_code。"""
    s = (bz_id or "").strip()
    if not s:
        raise ValueError("bz_id 不能为空")
    obj: NationalStandardBasic | None = None
    if s.isdigit():
        obj = NationalStandardBasic.objects.filter(id=int(s)).first()
    if obj is None:
        obj = NationalStandardBasic.objects.filter(std_code=s).first()
    if obj is None:
        raise ValueError(f"未找到标准: {bz_id!r}")
    return obj.std_code


def _merge_layout_hints(
    acc: dict[str, tuple[int, int]], lay: dict[str, tuple[int, int]]
) -> None:
    """同一标准号多条 hint 时保留更靠上（rank 更小）的层；同层取更小 col。"""
    for k, v in lay.items():
        ck = canonical_std_code_hint(k)
        if ck not in acc:
            acc[ck] = v
            continue
        ra, ca = acc[ck]
        rb, cb = v
        if rb < ra or (rb == ra and cb < ca):
            acc[ck] = v


def _fmt_date(d) -> str | None:
    if d is None:
        return None
    return d.isoformat()


def _build_nodes_for_codes(
    codes: set[str],
    *,
    focus_std_code: str,
    layout_hints: dict[str, tuple[int, int]] | None = None,
) -> list[dict]:
    """节点主标签 `name` 使用标准号；`std_name` 为完整名称（可选用于悬停）；`highlighted` 标识本次检索焦点节点。"""
    code_list = list(codes)
    basics = NationalStandardBasic.objects.filter(std_code__in=code_list).only(
        "std_code",
        "std_name",
        "std_status",
        "publish_date",
        "effective_date",
    )
    by_code = {o.std_code: o for o in basics}
    # 不可与 .only() 同用 select_related('extension_row')，单独查扩展表
    ext_unit: dict[str, str | None] = {}
    for e in NationalStandardExtension.objects.filter(
        national_standard_id__in=code_list
    ).only("national_standard_id", "responsible_unit"):
        ru = (e.responsible_unit or "").strip()
        ext_unit[str(e.national_standard_id)] = ru if ru else None
    hints = layout_hints or {}
    nk_focus = _norm_code_key(focus_std_code)
    nodes: list[dict] = []
    fallback_i = 0
    for c in sorted(codes):
        o = by_code.get(c) or lookup_basic_by_hint(c)
        cid = o.std_code if o else c
        highlighted = _norm_code_key(cid) == nk_focus
        pair = hints.get(cid)
        if pair is None:
            nk = _norm_code_key(cid)
            for hk, p in hints.items():
                if _norm_code_key(hk) == nk:
                    pair = p
                    break
        if pair is None:
            rk, cl = 4, fallback_i
            fallback_i += 1
        else:
            rk, cl = pair
        pub: str | None = None
        eff: str | None = None
        if o:
            pub = _fmt_date(o.publish_date)
            eff = _fmt_date(o.effective_date)
        unit = ext_unit.get(str(cid))
        nodes.append(
            {
                "id": cid,
                "name": cid,
                "label": cid,
                "ex_state": (o.std_status if o and o.std_status else "") or "",
                "std_name": o.std_name if o and o.std_name else None,
                "publish_date": pub,
                "effective_date": eff,
                "responsible_unit": unit,
                "highlighted": highlighted,
                "layout": {"rank": rk, "col": cl},
            }
        )
    return nodes


def _assign_layout_positions(nodes: list[dict], links: list[dict]) -> None:
    """
    计算 `layout_pos`：按 `layout.rank` 分层，用边的父子关系把子节点排在父节点下方并横向铺开；
    层内防止重叠后，将 **第 0 层（根）的重心移到 x=0**，使根居中、整体近树形。
    间距偏大以便前端一屏内或可缩放阅读；节点很多时仍缩小但底限比此前略高（减轻挤成一团）。
    纵向 `y_step` 含「层与层之间」空隙，过小会与节点下标签争空间；标签与下一层圆的分离还可由前端 `labelCfg.offset` 加强。
    """
    if not nodes:
        return
    n_nodes = len(nodes)
    shrink = max(0.58, min(1.0, 34 / max(n_nodes, 1)))
    x_step = max(76.0, 122.0 * shrink)
    # 层间距：给节点下方文字留空，避免与下一层圆点叠画（文字垂向仍需前端 labelOffset）
    y_step = max(92, int(138 * shrink))

    by_id: dict[str, dict] = {str(n["id"]): n for n in nodes}
    parents_of: dict[str, list[str]] = defaultdict(list)
    for lk in links:
        s, t = str(lk.get("source", "")), str(lk.get("target", ""))
        if s in by_id and t in by_id:
            parents_of[t].append(s)

    layers: dict[int, list[str]] = defaultdict(list)
    ranks: dict[str, int] = {}
    for n in nodes:
        nid = str(n["id"])
        r = int((n.get("layout") or {}).get("rank", 0))
        ranks[nid] = r
        layers[r].append(nid)
    max_rank = max(layers.keys()) if layers else 0
    for r in layers:
        layers[r].sort(
            key=lambda i: (
                (by_id[i].get("layout") or {}).get("col", 0),
                i,
            )
        )

    x_assign: dict[str, float] = {}

    r0 = layers.get(0, [])
    if r0:
        m = len(r0)
        for j, nid in enumerate(r0):
            x_assign[nid] = (j - (m - 1) / 2.0) * x_step
        if m == 1:
            x_assign[r0[0]] = 0.0

    for r in range(1, max_rank + 1):
        layer_ids = layers[r]
        groups: dict[tuple[str, ...], list[str]] = defaultdict(list)
        for nid in layer_ids:
            ps = [p for p in parents_of.get(nid, []) if p in by_id]
            key: tuple[str, ...] = tuple(sorted(ps)) if ps else ("__orphan__",)
            groups[key].append(nid)
        for key, cids in groups.items():
            cids.sort(
                key=lambda i: (
                    (by_id[i].get("layout") or {}).get("col", 0),
                    i,
                )
            )
            if key == ("__orphan__",):
                px = 0.0
            else:
                px = sum(x_assign.get(p, 0.0) for p in key) / len(key)
            m2 = len(cids)
            for j, cid in enumerate(cids):
                x_assign[cid] = px + (j - (m2 - 1) / 2.0) * x_step

    for nid in ranks:
        x_assign.setdefault(nid, 0.0)

    min_gap = max(68.0, x_step * 0.85)
    for r in range(0, max_rank + 1):
        ids = [i for i in layers[r] if i in x_assign]
        if len(ids) < 2:
            continue
        ids.sort(key=lambda i: x_assign[i])
        for _ in range(len(ids) * 3):
            moved = False
            for i in range(1, len(ids)):
                if x_assign[ids[i]] - x_assign[ids[i - 1]] < min_gap:
                    mid = (x_assign[ids[i]] + x_assign[ids[i - 1]]) / 2.0
                    x_assign[ids[i - 1]] = mid - min_gap / 2
                    x_assign[ids[i]] = mid + min_gap / 2
                    moved = True
            if not moved:
                break

    if r0:
        ax = sum(x_assign.get(i, 0.0) for i in r0) / len(r0)
        for nid in x_assign:
            x_assign[nid] -= ax

    for n in nodes:
        nid = str(n["id"])
        r = ranks.get(nid, 0)
        n["layout_pos"] = {
            "x": int(round(x_assign.get(nid, 0.0))),
            "y": int(round(r * y_step)),
        }


def tree_data(bz_id: str) -> dict:
    """谱系图：`nodes`/`links`；节点含 publish_date、effective_date、responsible_unit；顶层 `pedigree_root_std_code` 为图上 rank=0 根标准号。"""
    center = resolve_std_code(bz_id)
    rows = find_pedigree_rows_for_std_code(center)

    codes: set[str] = {center}
    edge_map: dict[tuple[str, str], str] = {}
    layout_merged: dict[str, tuple[int, int]] = {}

    for row in rows:
        codes.add(canonical_std_code_hint(row.std_code))
        chain, edges, lay = parse_part_chain_for_graph(row.part_chain)
        _merge_layout_hints(layout_merged, lay)
        for h in chain:
            codes.add(canonical_std_code_hint(h))
        for src, tgt, rt in edges:
            s = canonical_std_code_hint(src)
            t = canonical_std_code_hint(tgt)
            codes.add(s)
            codes.add(t)
            edge_map[(s, t)] = rt

    nodes = _build_nodes_for_codes(
        codes, focus_std_code=center, layout_hints=layout_merged
    )
    links = [
        {"source": s, "target": t, "relation_type": edge_map[(s, t)]}
        for s, t in sorted(edge_map.keys(), key=lambda x: (x[0], x[1]))
    ]
    _assign_layout_positions(nodes, links)

    roots = sorted(
        (
            n
            for n in nodes
            if int((n.get("layout") or {}).get("rank", -1)) == 0
        ),
        key=lambda x: (int((x.get("layout") or {}).get("col", 0)), x.get("id") or ""),
    )
    pedigree_root_std_code: str | None = None
    if roots:
        pedigree_root_std_code = "、".join(str(x.get("id") or "") for x in roots if x.get("id"))

    return {
        "nodes": nodes,
        "links": links,
        "pedigree_root_std_code": pedigree_root_std_code,
        # 前端节点属性面板：不再展示「拓扑关系概览」（由 links 自行绘制即可）
        "node_panel": {"show_topology_overview": False},
    }


def check_latest_flat(bz_id: str) -> dict:
    """是否最新与谱系链：优先 `latest_std_code`，否则取 `part_chain` 链尾。"""
    center = resolve_std_code(bz_id)
    rows = find_pedigree_rows_for_std_code(center)
    row = rows[0] if rows else None

    pedigree_chain: list[str] = []
    current_latest_id = ""
    is_latest = True

    if row:
        chain_raw, _, _ = parse_part_chain_for_graph(row.part_chain)
        pedigree_chain = list(dict.fromkeys(canonical_std_code_hint(c) for c in chain_raw))
        latest_tokens = [canonical_std_code_hint(x) for x in parse_latest_std_codes(row.latest_std_code)]

        if latest_tokens:
            current_latest_id = latest_tokens[0]
            is_latest = center in set(latest_tokens)
        elif pedigree_chain:
            tail = pedigree_chain[-1]
            current_latest_id = tail
            is_latest = center == tail
        else:
            current_latest_id = row.std_code
            is_latest = center == row.std_code
    else:
        pedigree_chain = [center]
        current_latest_id = center
        is_latest = True

    return {
        "query_bz_id": bz_id,
        "is_latest": is_latest,
        "current_latest_id": current_latest_id,
        "pedigree_chain": pedigree_chain if pedigree_chain else [center],
    }


def delete_relations_for_std_code(bz_id: str) -> int:
    """
    删除与本标准相关的谱系有向边（`standard_pedigree_relation` 中凡 source 或 target 命中该标准号）。
    标准号经 `resolve_std_code` 解析为主表 std_code。
    """
    center = resolve_std_code(bz_id)
    deleted, _ = StandardPedigreeRelation.objects.filter(
        Q(source_std_code=center) | Q(target_std_code=center)
    ).delete()
    return int(deleted)
