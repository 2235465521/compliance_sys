"""由「标准号—代替标准」行集构建有向图并计算谱系号 / 谱系链 / 最新标准（与离线 谱系链生成 脚本一致）。

供批量元数据入库先于 `standard_pedigree`、再写 `national_standard_basic` 使用。
"""
from __future__ import annotations

import re
from typing import Any


def _require_networkx():
    try:
        import networkx as nx
    except ImportError as e:
        raise ImportError(
            "国标批量入库需要 networkx，请在当前 Python 环境中执行："
            'pip install "networkx>=3.2"'
        ) from e
    return nx


# 与离线脚本 REPLACE_TYPE_LABELS 对应：边权 1/2/3
_REL_ALL = 1
_REL_PARTIAL = 2
_REL_PARTIAL_DONE = 3


def clean_std_no(s) -> str:
    if s is None or (isinstance(s, float) and str(s) == "nan"):
        return ""
    s = str(s)
    for ch in ("\ufeff", "\u200b", "\u200c", "\u200d", "\xa0"):
        s = s.replace(ch, "")
    s = re.sub(r"[\u200b\u200c\u200d\ufeff\xa0]+", "", s)
    s = s.replace("标准", "")
    return re.sub(r"\s+", " ", s.strip())


def get_year(s: str) -> int:
    ys = re.findall(r"\d{4}", str(s))
    return int(ys[-1]) if ys else 0


def sort_key_node(n: str):
    return (-get_year(n), n)


def clean_and_split_targets(target_str) -> list[str]:
    if target_str is None or str(target_str).strip() in ("", "nan", "无", "None"):
        return []
    txt = str(target_str)
    txt = re.sub(r"[\(（\[【].*?[\)）\]】]", "", txt)
    txt = re.sub(
        r"(全部替代被以下标准|全部代替被以下标准|被以下标准代替|全部替代|部分替代|全部代替|部分代替|代替|替代)",
        "",
        txt,
    )
    targets = re.split(r"[,，、；;]+", txt)
    res: list[str] = []
    for t in targets:
        t = clean_std_no(t)
        if len(t) < 4 or not re.search(r"\d", t):
            continue
        if t in ("现行", "废止", "即将实施", "有效"):
            continue
        res.append(t)
    return res


def _map_tokentype_one(tok: str) -> int:
    t = str(tok).strip()
    if not t or t in ("无", "None", "nan"):
        return _REL_ALL
    if "代完" in t:
        return _REL_PARTIAL_DONE
    if "部分" in t:
        return _REL_PARTIAL
    if "全部" in t:
        return _REL_ALL
    return _REL_ALL


def clean_and_split_types(type_str, n: int) -> list[int]:
    if n == 0:
        return []
    if type_str is None or str(type_str).strip() in ("", "无", "None", "nan"):
        return [_REL_ALL] * n
    parts = re.split(r"[,，、；;]+", str(type_str).strip())
    parts = [p for p in parts if str(p).strip() not in ("", "无")]
    if not parts:
        return [_REL_ALL] * n
    if len(parts) == 1:
        return [_map_tokentype_one(parts[0])] * n
    out = [_map_tokentype_one(p) for p in parts]
    if len(out) < n and out:
        out.extend([out[-1]] * (n - len(out)))
    return out[:n]


def _fmt_state_group(states: list[int], stds: list[str]) -> str:
    if states == [-1] and len(stds) == 1:
        return f"[-1]:{{{stds[0]}}}"
    if states == [0] and not stds:
        return "[0]:{}"
    st = ",".join(str(s) for s in states)
    body = "、".join(stds) if stds else ""
    return f"[{st}]:{{{body}}}"


def _wrap_group(inner: str) -> str:
    return "{" + inner + "}"


def _join_layer_groups(wrapped_groups: list[str]) -> str:
    if len(wrapped_groups) == 1:
        return wrapped_groups[0]
    return "{{" + "、".join(wrapped_groups) + "}}"


def build_type_graph(rows: list[dict]) -> Any:
    """rows: 每项含 `std_code` / `replaces_std_code` / `replace_type`（国标号已为规范化字符串）。"""
    nx = _require_networkx()
    G = nx.DiGraph()
    for row in rows:
        src = (row.get("std_code") or "").strip()
        if not src or not re.search(r"\d", src):
            continue
        G.add_node(src)
        targets = clean_and_split_targets(row.get("replaces_std_code"))
        t_list = clean_and_split_types(row.get("replace_type"), len(targets))
        for i, tgt in enumerate(targets):
            tt = normalize_lineage_std_code(tgt)
            if not tt:
                continue
            if src == tt:
                continue
            G.add_node(tt)
            st = t_list[i] if i < len(t_list) else _REL_ALL
            if G.has_edge(src, tt):
                G[src][tt]["st"] = st
            else:
                G.add_edge(src, tt, st=st)
    return G


def _layer_all_leaves(parents, G: Any) -> bool:
    for p in parents:
        if G.out_degree(p) > 0:
            return False
    return bool(parents)


def _append_child_segments(parents_in_layer, G: Any, chain_parts: list) -> None:
    parents = sorted(parents_in_layer, key=sort_key_node)
    wrapped = []
    for p in parents:
        ch = sorted(list(G.successors(p)), key=sort_key_node)
        if not ch:
            wrapped.append(_wrap_group(_fmt_state_group([0], [])))
        else:
            st_list = [G[p][c].get("st", _REL_ALL) for c in ch]
            wrapped.append(_wrap_group(_fmt_state_group(st_list, ch)))
    chain_parts.append(_join_layer_groups(wrapped))


def compute_lineage_maps(G: Any):
    latest = [n for n in G.nodes() if G.in_degree(n) == 0]
    latest_sorted = sorted(latest, key=sort_key_node)
    node_to_pids: dict[str, set[str]] = {}
    node_to_chain: dict[str, str] = {}
    node_to_latest: dict[str, set[str]] = {}
    for idx, root in enumerate(latest_sorted):
        pid = f"P{str(idx + 1).zfill(7)}"
        chain_parts = [
            _join_layer_groups([_wrap_group(_fmt_state_group([-1], [root]))])
        ]
        current_layer = {root}
        visited: set[str] = set()
        while current_layer:
            if not _layer_all_leaves(current_layer, G):
                _append_child_segments(current_layer, G, chain_parts)
            next_layer = set()
            for node in current_layer:
                if node not in visited:
                    visited.add(node)
                    node_to_pids.setdefault(node, set()).add(pid)
                    node_to_latest.setdefault(node, set()).add(root)
                    next_layer.update(G.successors(node))
            next_layer -= visited
            current_layer = next_layer
        full_chain = "、".join(chain_parts)
        for node in visited:
            if node not in node_to_chain:
                node_to_chain[node] = full_chain
    return node_to_pids, node_to_chain, node_to_latest, latest_sorted


def normalize_lineage_std_code(raw: str) -> str:
    """与批量入库 `national_standard_basic.std_code` 对齐：先去「脚本」杂音再 NFC 折叠。"""
    from apps.standards.services.registry import _normalize_std_code_import

    c = clean_std_no(raw)
    if not c:
        return ""
    return _normalize_std_code_import(c)


def build_row_models_for_graph(row_dicts: list[dict[str, str]]) -> list[dict]:
    """将上传行转为图输入行：`std_code` 为规范化国标号字符串。"""
    out: list[dict] = []
    for rd in row_dicts:
        raw_code = rd.get("std_code")
        if not raw_code:
            continue
        sk = normalize_lineage_std_code(str(raw_code))
        if not sk or not re.search(r"\d", sk):
            continue
        replaces = rd.get("replaces_std_code")
        rp = replaces if replaces else ""
        rt = rd.get("replace_type")
        out.append(
            {
                "std_code": sk,
                "replaces_std_code": rp,
                "replace_type": rt,
            }
        )
    return out


def lineage_fields_for_std(
    node_to_pids: dict[str, set[str]],
    node_to_chain: dict[str, str],
    node_to_latest: dict[str, set[str]],
    std_code: str,
) -> tuple[str | None, str | None, str | None]:
    """返回 (ped_id 逗号拼接, part_chain, latest_std_code 顿号拼接)。"""
    pids = node_to_pids.get(std_code)
    ped = ",".join(sorted(pids)) if pids else None
    chain = node_to_chain.get(std_code)
    lasts = node_to_latest.get(std_code)
    latest = "、".join(sorted(lasts, key=sort_key_node)) if lasts else None
    return ped, chain or None, latest
