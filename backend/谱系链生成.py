import pandas as pd
import networkx as nx
import re
import os
import sys
from datetime import datetime

# ================= ⚙️ 配置区域 =================
# 输入文件路径 (支持 .csv 或 .xlsx)
INPUT_FILE = r'D:\vscode代码\替代表未拆分.xlsx'
# 最终结果保存路径
OUTPUT_FILE = r'D:\vscode代码\新版带状态谱系链结果.xlsx'

# 务必确认这些变量与 Excel 表头一致
COL_SOURCE = '标准号'
COL_TARGET = '代替标准'
# 与 «代替标准» 一一对应时可为 «全部代替、部分代替、…»；若仅一行可应用于全部目标
COL_TYPE = '代替类型'

# ============================================


def get_year(s):
    """提取标准号中的年份，用于从新到旧排序；同年再按标准号稳定排序。"""
    ys = re.findall(r'\d{4}', str(s))
    return int(ys[-1]) if ys else 0


def sort_key_node(n):
    return (-get_year(n), n)


def clean_std_no(s):
    if pd.isna(s):
        return ""
    s = str(s)
    s = re.sub(r'[\u200b\u200c\u200d\ufeff\xa0]+', '', s)
    s = s.replace('标准', '')
    return re.sub(r'\s+', ' ', s.strip())


def clean_and_split_targets(target_str):
    if pd.isna(target_str) or str(target_str).strip() in ('', 'nan', '无', 'None'):
        return []

    txt = str(target_str)
    txt = re.sub(r'[\(（\[【].*?[\)）\]】]', '', txt)
    txt = re.sub(
        r'(全部替代被以下标准|全部代替被以下标准|被以下标准代替|全部替代|部分替代|全部代替|部分代替|代替|替代)', '',
        txt)

    targets = re.split(r'[,，、；;]+', txt)

    res = []
    for t in targets:
        t = clean_std_no(t)
        if len(t) < 4 or not re.search(r'\d', t):
            continue
        if t in ('现行', '废止', '即将实施', '有效'):
            continue
        res.append(t)

    return res


def _map_tokentype_one(tok: str) -> int:
    """1 全部代替 2 部分代替 3 部分代完（按业务约定）。"""
    t = str(tok).strip()
    if not t or t in ('无', 'None', 'nan'):
        return 1
    if '代完' in t:
        return 3
    if '部分' in t:
        return 2
    if '全部' in t:
        return 1
    return 1


def clean_and_split_types(type_str, n: int) -> list:
    """
    与 target 一一对应：支持 «全部代替、全部代替» 多段，或与单行同义广播到 n 个目标。
    若 n==0 则返回空列表。
    """
    if n == 0:
        return []
    if pd.isna(type_str) or str(type_str).strip() in ('', '无', 'None', 'nan'):
        return [1] * n

    parts = re.split(r'[,，、；;]+', str(type_str).strip())
    parts = [p for p in parts if str(p).strip() not in ('', '无')]
    if not parts:
        return [1] * n
    if len(parts) == 1:
        return [_map_tokentype_one(parts[0])] * n
    out = [_map_tokentype_one(p) for p in parts]
    if len(out) < n and out:
        out.extend([out[-1]] * (n - len(out)))
    return out[:n]


def _fmt_state_group(states: list, stds: list) -> str:
    """
    生成单层内一个分组（不含多父时的最外层双括弧）：
    根/最新：[-1]:{A}；无子：[0]:{}；否则 [s1,s2]:{c1、c2}
    """
    if states == [-1] and len(stds) == 1:
        return f"[-1]:{{{stds[0]}}}"
    if states == [0] and not stds:
        return "[0]:{}"
    st = ",".join(str(s) for s in states)
    body = "、".join(stds) if stds else ""
    return f"[{st}]:{{{body}}}"


def _wrap_group(inner: str) -> str:
    return "{" + inner + "}"


def _join_layer_groups(wrapped_groups: list) -> str:
    """
    各 wrapped_groups 已形如 {[-1]:{A}}、{[1,2]:{B,C}}。
    多父时整体再包一层双花括号，见需求说明。
    """
    if len(wrapped_groups) == 1:
        return wrapped_groups[0]
    return "{{" + "、".join(wrapped_groups) + "}}"


def _build_type_graph(df) -> nx.DiGraph:
    G = nx.DiGraph()
    for _, row in df.iterrows():
        src = clean_std_no(row.get(COL_SOURCE, ''))
        if not src or src == 'nan' or not re.search(r'\d', src):
            continue
        G.add_node(src)
        targets = clean_and_split_targets(row.get(COL_TARGET, ''))
        t_list = clean_and_split_types(
            row.get(COL_TYPE, ''), len(targets))
        for i, tgt in enumerate(targets):
            if src == tgt:
                continue
            st = t_list[i] if i < len(t_list) else 1
            G.add_node(tgt)
            if G.has_edge(src, tgt):
                G[src][tgt]['st'] = st
            else:
                G.add_edge(src, tgt, st=st)
    return G


def _layer_all_leaves(parents, G: nx.DiGraph) -> bool:
    """
    本层在图中已全是叶（无出边）。此时若再写一段只会全是 [0]:{}，表示无下代,
    作为谱系最末层无意义,故不再追加该段; [0]:{} 只出现在「中间层」有分支仍延续时.
    """
    for p in parents:
        if G.out_degree(p) > 0:
            return False
    return bool(parents)


def compute_lineage_maps(G: nx.DiGraph):
    """
    由建好的有向图计算 谱系号 / 谱系链 / 最新标准 归属（与 generate_lineage 内逻辑一致）。
    """
    latest = [n for n in G.nodes() if G.in_degree(n) == 0]
    latest_sorted = sorted(latest, key=sort_key_node)
    node_to_pids, node_to_chain, node_to_latest = {}, {}, {}
    for idx, root in enumerate(latest_sorted):
        pid = f"P{str(idx + 1).zfill(7)}"
        chain_parts = [
            _join_layer_groups(
                [_wrap_group(_fmt_state_group([-1], [root]))]
            )]
        current_layer = {root}
        visited = set()
        while current_layer:
            if not _layer_all_leaves(current_layer, G):
                _append_child_segments(current_layer, G, chain_parts)
            next_layer = set()
            for node in current_layer:
                if node not in visited:
                    visited.add(node)
                    if node not in node_to_pids:
                        node_to_pids[node] = set()
                    node_to_pids[node].add(pid)
                    if node not in node_to_latest:
                        node_to_latest[node] = set()
                    node_to_latest[node].add(root)
                    next_layer.update(G.successors(node))
            next_layer = next_layer - visited
            current_layer = next_layer
        full_chain = "、".join(chain_parts)
        for node in visited:
            if node not in node_to_chain:
                node_to_chain[node] = full_chain
    return node_to_pids, node_to_chain, node_to_latest, latest_sorted


def _append_child_segments(
        parents_in_layer, G: nx.DiGraph, chain_parts: list) -> None:
    """
    以本层中每个节点为父，为下一「谱系段」生成分组；无子为 [0]:{}。
    单父为 {…}，多父为 {{…}、{…}}。
    """
    parents = sorted(parents_in_layer, key=sort_key_node)
    wrapped = []
    for p in parents:
        ch = sorted(list(G.successors(p)), key=sort_key_node)
        if not ch:
            wrapped.append(_wrap_group(_fmt_state_group([0], [])))
        else:
            st_list = [G[p][c].get('st', 1) for c in ch]
            wrapped.append(_wrap_group(_fmt_state_group(st_list, ch)))
    chain_parts.append(_join_layer_groups(wrapped))


def generate_lineage():
    print("正在读取本地数据...")
    try:
        if INPUT_FILE.endswith('.csv'):
            df = pd.read_csv(INPUT_FILE, encoding='utf-8-sig')
        else:
            df = pd.read_excel(INPUT_FILE)
    except UnicodeDecodeError:
        df = pd.read_csv(INPUT_FILE, encoding='gbk')
    if COL_TYPE not in df.columns:
        print(f"警告: 表中没有列 «{COL_TYPE}»，各边代替类型将视为 1（全部代替）。")
        df[COL_TYPE] = '全部代替'

    print(f"成功读取 {len(df)} 条原始数据。正在构建替代关系图谱...")

    G = _build_type_graph(df)
    n_latest = len([n for n in G.nodes() if G.in_degree(n) == 0])
    print(
        f"图谱构建完毕！共识别到 {n_latest} 个最新标准，将作为谱系起点。")
    print("正在计算谱系链与最新标准...")
    node_to_pids, node_to_chain, node_to_latest, _ = compute_lineage_maps(G)

    print("正在导出最终结果...")
    final_rows = []
    for src in df[COL_SOURCE].dropna().unique():
        src_str = clean_std_no(src)
        if not src_str or src_str == 'nan' or not re.search(r'\d', src_str):
            continue
        pids = ','.join(sorted(node_to_pids.get(src_str, set())))
        chain = node_to_chain.get(src_str, "")
        latest_stds = '、'.join(
            sorted(
                node_to_latest.get(
                    src_str, set()), key=sort_key_node)) if node_to_latest.get(
                src_str) else ""
        sucs = list(
            G.successors(src_str)) if src_str in G else []
        combined_tgt = '、'.join(
            sorted(sucs, key=sort_key_node)) if sucs else ''
        final_rows.append({
            '本标准标准号': src_str,
            '替代标准': combined_tgt,
            '最新标准': latest_stds,
            '谱系号': pids,
            '谱系链': chain
        })
    result_df = pd.DataFrame(final_rows)
    try:
        result_df.to_excel(OUTPUT_FILE, index=False)
        saved = os.path.abspath(OUTPUT_FILE)
    except PermissionError:
        root, ext = os.path.splitext(OUTPUT_FILE)
        alt = f"{root}_{datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"
        result_df.to_excel(alt, index=False)
        saved = os.path.abspath(alt)
        print(
            f"原输出文件无法写入（多被 Excel 占用，请先关闭: {os.path.abspath(OUTPUT_FILE)}）")
    print(f"处理完成！最终生成了 {len(result_df)} 行数据。已保存至: {saved}")


def _load_input_df(path: str) -> "pd.DataFrame":
    if path.endswith('.csv'):
        try:
            return pd.read_csv(path, encoding='utf-8-sig')
        except UnicodeDecodeError:
            return pd.read_csv(path, encoding='gbk')
    return pd.read_excel(path)


def verify_result_excel(
        result_excel: str,
        input_excel: str = None) -> bool:
    """
    用与生成时相同的输入表重算谱系，与已导出的结果表逐行比对。
    若行数/标准号一致且各列相同，则视为本次结果与程序逻辑自洽。
    """
    input_excel = input_excel or INPUT_FILE
    print("=== 谱系结果自检（重算 vs 已导出 xlsx）===\n")
    print("输入(替代表):", os.path.abspath(input_excel))
    print("待验证结果:", os.path.abspath(result_excel))
    if not os.path.isfile(result_excel):
        print("错误: 结果文件不存在。")
        return False
    df = _load_input_df(input_excel)
    if COL_TYPE not in df.columns:
        df[COL_TYPE] = '全部代替'
    G = _build_type_graph(df)
    node_to_pids, node_to_chain, node_to_latest, _ = compute_lineage_maps(G)
    out = pd.read_excel(result_excel)
    n_bad_c = n_bad_p = n_bad_l = n_bad_t = 0
    n = 0
    for _, row in out.iterrows():
        k = clean_std_no(row.get('本标准标准号', ''))
        if not k or k == 'nan' or not re.search(r'\d', k):
            continue
        n += 1
        ref_c = node_to_chain.get(k, "")
        ref_p = ",".join(sorted(node_to_pids.get(k, set())))
        ref_l = "、".join(
            sorted(
                node_to_latest.get(k, set()), key=sort_key_node
            )
        ) if node_to_latest.get(k) else ""
        sucs = list(G.successors(k)) if k in G else []
        ref_t = "、".join(sorted(sucs, key=sort_key_node)) if sucs else ""
        o_c = "" if pd.isna(row.get("谱系链")) else str(row["谱系链"]).strip()
        o_p = "" if pd.isna(row.get("谱系号")) else str(row["谱系号"]).strip()
        o_l = "" if pd.isna(row.get("最新标准")) else str(row["最新标准"]).strip()
        o_t = "" if pd.isna(row.get("替代标准")) else str(row["替代标准"]).strip()
        if ref_c != o_c:
            n_bad_c += 1
        if ref_p != o_p:
            n_bad_p += 1
        if ref_l != o_l:
            n_bad_l += 1
        if ref_t != o_t:
            n_bad_t += 1
    print(f"有效比对行: {n}")
    print(
        f"  谱系链 不一致: {n_bad_c}  谱系号: {n_bad_p}  最新标准: {n_bad_l}  替代标准: {n_bad_t}"
    )
    ok = n_bad_c == n_bad_p == n_bad_l == n_bad_t == 0
    if ok and n:
        print("结论: 与当前输入、当前代码重算结果完全一致（可认为导出正确）。")
    elif n:
        print(
            "结论: 存在差异。请确认结果是否由**本机当前** 谱系链生成.py 与 **同一份** 输入表生成，"
            "或输入/代码已改。")
    return ok


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        r_path = sys.argv[2] if len(sys.argv) > 2 else OUTPUT_FILE
        in_path = None
        for i, a in enumerate(sys.argv):
            if a == "--input" and i + 1 < len(sys.argv):
                in_path = sys.argv[i + 1]
                break
        verify_result_excel(r_path, in_path)
    else:
        generate_lineage()
