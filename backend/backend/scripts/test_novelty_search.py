#!/usr/bin/env python
"""
查新服务联调脚本：按企标号创建任务 → 确认专用表 → 打印三列比对结果。

用法（在 backend 目录下）:
  python scripts/test_novelty_search.py
  python scripts/test_novelty_search.py --qb-code "Q/MPSTC 0010-2018"
  python scripts/test_novelty_search.py --http --base-url http://127.0.0.1:8000

依赖：.env 已配置 MySQL（MYSQL_*）且 COMPLIANCE_REQUIRE_MYSQL=true 时 default 须为 MySQL；
      该企标号在库中须存在已完成 Step3 的合规任务或 completed 的批量子项。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")


def _print_compare_table(compare_rows: list[dict]) -> None:
    if not compare_rows:
        print("  （无比对行）")
        return
    cols = [
        ("referenced_std_code", "企标引用号", 28),
        ("full_std_at_publication", "列1-发布时点补全", 36),
        ("baseline_latest_std_primary", "列2-基线现行", 28),
        ("current_latest_std_primary", "列3-本次现行", 28),
        ("row_conclusion_label", "结论", 12),
    ]
    header = " | ".join(title.ljust(w) for _, title, w in cols)
    print(header)
    print("-" * len(header))
    for row in compare_rows:
        parts = []
        for key, _, w in cols:
            val = row.get(key) if row.get(key) is not None else "-"
            s = str(val)
            if len(s) > w:
                s = s[: w - 2] + ".."
            parts.append(s.ljust(w))
        print(" | ".join(parts))


def run_direct(qb_code: str) -> int:
    """直接调用 service 层，不经过 HTTP（避免未起服务或 ninja 路由问题）。"""
    import django

    django.setup()

    from apps.compliance.db import is_mysql
    from apps.novelty.services.serializers import task_to_out
    from apps.novelty.services.task_service import confirm_sheet, create_task
    from ninja.errors import HttpError

    if not is_mysql():
        print("FAIL: 当前 Django 未连接 MySQL，请检查 backend/.env 中 MYSQL_*")
        return 1

    print(f"企标号: {qb_code}")
    print("--- 直接调用 create_task / confirm_sheet ---")
    try:
        task = create_task(request=None, qb_code=qb_code, source="upload")
    except HttpError as e:
        print(f"创建失败 HTTP {e.status_code}: {e.message}")
        if e.status_code == 422:
            print("说明: 库中无该企标号的合规/批量历史记录。")
        return 1

    print(f"任务 ID: {task.id}  status: {task.status}")
    sheet = task.reference_sheet_json if isinstance(task.reference_sheet_json, list) else []
    print(f"专用表初稿: {len(sheet)} 条引用")
    for i, row in enumerate(sheet[:10], 1):
        if isinstance(row, dict):
            print(f"  [{i}] {row.get('std_no')}  {row.get('std_name') or ''}")
    if len(sheet) > 10:
        print(f"  ... 另有 {len(sheet) - 10} 条")

    try:
        task = confirm_sheet(task.id, None, request=None)
    except HttpError as e:
        print(f"比对失败 HTTP {e.status_code}: {e.message}")
        return 1

    result = task_to_out(task).model_dump(mode="json")
    print(f"任务状态: {result.get('status')}")
    print(f"任务结论: {result.get('task_conclusion')}  —  {result.get('task_summary') or ''}")
    print()
    print("=== 三列比对明细 ===")
    _print_compare_table(result.get("compare_rows") or [])

    out_path = BACKEND / f"novelty_task_{task.id}_result.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print()
    print(f"完整 JSON: {out_path}")
    return 0


def run_django_client(qb_code: str, token: str | None) -> int:
    import django

    django.setup()

    from django.conf import settings
    from django.test import Client

    from apps.compliance.db import is_mysql

    if not is_mysql():
        print("FAIL: 当前 Django 未连接 MySQL，请检查 backend/.env 中 MYSQL_* 并重启服务")
        return 1

    client = Client()
    headers = {}
    if token:
        headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    elif getattr(settings, "COMPLIANCE_API_AUTH_REQUIRED", False):
        print("提示: COMPLIANCE_API_AUTH_REQUIRED=true，请传 --token")

    print(f"企标号: {qb_code}")
    print("--- 创建查新任务 POST /api/v1/novelty-search/tasks ---")
    r = client.post(
        "/api/v1/novelty-search/tasks",
        data={"qb_code": qb_code, "source": "upload"},
        **headers,
    )
    if r.status_code == 422:
        print("HTTP 422:", r.json().get("detail", r.content.decode()))
        print("说明: 库中无该企标号的合规 Step3+ / 批量 completed 历史，无法汇聚引用。")
        return 1
    if r.status_code == 503:
        print("HTTP 503:", r.json().get("detail", r.content.decode()))
        return 1
    if r.status_code != 201:
        print(f"FAIL: 创建任务 HTTP {r.status_code}", r.content.decode()[:500])
        return 1

    task = r.json()
    task_id = task["id"]
    print(f"任务 ID: {task_id}  status: {task.get('status')}")
    sheet = task.get("reference_sheet") or []
    print(f"专用表初稿: {len(sheet)} 条引用")
    for i, row in enumerate(sheet[:10], 1):
        print(f"  [{i}] {row.get('std_no')}  {row.get('std_name') or ''}")
    if len(sheet) > 10:
        print(f"  ... 另有 {len(sheet) - 10} 条")

    print("--- 确认专用表 POST .../confirm-sheet ---")
    r2 = client.post(
        f"/api/v1/novelty-search/tasks/{task_id}/confirm-sheet",
        data=json.dumps({}),
        content_type="application/json",
        **headers,
    )
    if r2.status_code != 200:
        print(f"FAIL: 确认比对 HTTP {r2.status_code}", r2.content.decode()[:800])
        return 1

    result = r2.json()
    print(f"任务状态: {result.get('status')}")
    print(f"任务结论: {result.get('task_conclusion')}  —  {result.get('task_summary') or ''}")
    print()
    print("=== 三列比对明细 ===")
    _print_compare_table(result.get("compare_rows") or [])

    if result.get("indicators_available"):
        r3 = client.get(f"/api/v1/novelty-search/tasks/{task_id}/indicators", **headers)
        if r3.status_code == 200:
            ind = r3.json()
            ent = ind.get("enterprise_indicators") or []
            nat = ind.get("national_by_std_code") or {}
            print()
            print(f"企标指标条数: {len(ent)}  国标分组数: {len(nat)}")

    print()
    print(f"完整 JSON 已写入: novelty_task_{task_id}_result.json")
    out_path = BACKEND / f"novelty_task_{task_id}_result.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


def run_http(base_url: str, qb_code: str, token: str | None) -> int:
    try:
        import httpx
    except ImportError:
        print("请安装 httpx: pip install httpx")
        return 1

    base = base_url.rstrip("/")
    api = f"{base}/api/v1/novelty-search"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    print(f"Base: {api}")
    print(f"企标号: {qb_code}")

    with httpx.Client(timeout=120.0) as client:
        r = client.post(f"{api}/tasks", data={"qb_code": qb_code, "source": "upload"}, headers=headers)
        if r.status_code == 422:
            print("HTTP 422:", r.json().get("detail"))
            return 1
        r.raise_for_status()
        task = r.json()
        task_id = task["id"]
        print(f"任务 ID: {task_id}  status: {task.get('status')}")

        r2 = client.post(f"{api}/tasks/{task_id}/confirm-sheet", json={}, headers=headers)
        r2.raise_for_status()
        result = r2.json()

    print(f"任务结论: {result.get('task_conclusion')}  —  {result.get('task_summary') or ''}")
    print("=== 三列比对明细 ===")
    _print_compare_table(result.get("compare_rows") or [])
    out_path = BACKEND / f"novelty_task_{task_id}_result.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完整 JSON: {out_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="查新服务联调：指定企标号跑通创建+比对并打印结果")
    parser.add_argument(
        "--qb-code",
        default="Q/MPSTC 0010-2018",
        help="企标号（默认 Q/MPSTC 0010-2018）",
    )
    parser.add_argument(
        "--direct",
        action="store_true",
        help="直接调用 service 层（推荐；不依赖 runserver / URL 路由）",
    )
    parser.add_argument(
        "--http",
        action="store_true",
        help="通过 HTTP 调用已启动的 runserver",
    )
    parser.add_argument(
        "--client",
        action="store_true",
        help="用 Django Test Client 调 API（需 ninja 依赖正常）",
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="--http 时的服务根地址",
    )
    parser.add_argument("--token", default=None, help="Bearer token（开启鉴权时）")
    args = parser.parse_args()

    qb = args.qb_code.strip()
    if args.http:
        return run_http(args.base_url, qb, args.token)
    if args.client:
        return run_django_client(qb, args.token)
    return run_direct(qb)


if __name__ == "__main__":
    raise SystemExit(main())
