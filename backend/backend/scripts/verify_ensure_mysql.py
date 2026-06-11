"""MySQL 联调：POST step/4/indicators/ensure 端到端验证（非 test 库）。"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import django

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
django.setup()

from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402
from django.db import connection  # noqa: E402
from django.test import Client  # noqa: E402
from unittest.mock import patch  # noqa: E402

from apps.compliance.db import is_mysql  # noqa: E402
from apps.compliance.models import ComplianceEvaluationTask  # noqa: E402

STD = "ZZ-E2E-ENSURE-001"


def cleanup(std_code: str = STD) -> None:
    with connection.cursor() as c:
        c.execute("DELETE FROM national_standard_indicator WHERE std_code = %s", [std_code])
        c.execute("DELETE FROM national_standard_basic WHERE std_code = %s", [std_code])


def seed(std_code: str = STD) -> None:
    cleanup(std_code)
    with connection.cursor() as c:
        c.execute(
            """
            INSERT INTO national_standard_basic (std_code, std_name, std_file_path)
            VALUES (%s, %s, NULL)
            """,
            [std_code, "E2E ensure 联调标准"],
        )


def main() -> int:
    if not is_mysql():
        print("SKIP: 当前 default 库不是 MySQL，请在 backend/.env 配置 MYSQL_* 后重试")
        return 1
    with connection.cursor() as c:
        c.execute("SHOW TABLES LIKE 'national_standard_basic'")
        if not c.fetchone():
            print("FAIL: national_standard_basic 表不存在，请先导入 v1.0-sql")
            return 1

    seed()
    task = ComplianceEvaluationTask.objects.create(current_step=4, qb_code=None)
    client = Client()
    url = f"/api/v1/compliance/evaluations/{task.id}/step/4/indicators/ensure"
    body = {"compare_pairs": [{"publication_std_code": STD, "latest_std_code": STD}]}

    r1 = client.post(url, data=body, content_type="application/json")
    d1 = r1.json()
    print("STEP1 ensure (无文件):", r1.status_code, "all_ready=", d1.get("all_ready"))
    if r1.status_code != 200 or d1.get("all_ready") is not False:
        cleanup()
        task.delete()
        print("FAIL: 期望缺件 all_ready=false")
        return 1

    upload = SimpleUploadedFile("e2e.pdf", b"%PDF-1.4 e2e", content_type="application/pdf")
    r_up = client.post(
        f"/api/v1/compliance/national-standards/upload?std_code={STD}",
        data={"file": upload},
    )
    print("STEP2 upload:", r_up.status_code, r_up.json() if r_up.status_code == 200 else r_up.content)

    with patch("apps.compliance.services.evaluation_flow.DifyClient") as mock_cls:
        mock_cls.return_value.is_workflow2_configured.return_value = False
        r2 = client.post(url, data=body, content_type="application/json")
    d2 = r2.json()
    print("STEP3 ensure (补传后):", r2.status_code, "all_ready=", d2.get("all_ready"))
    print("std_statuses:", json.dumps(d2.get("std_statuses"), ensure_ascii=False))

    task.refresh_from_db()
    bundle_ok = (task.indicator_bundle_json or {}).get("missing_gb_files") == []
    print("indicator_bundle_json.missing_gb_files 为空:", bundle_ok)

    cleanup()
    task.delete()

    ok = r2.status_code == 200 and d2.get("all_ready") is True and bundle_ok
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
