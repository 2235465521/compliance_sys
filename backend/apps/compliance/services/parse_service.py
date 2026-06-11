"""企标解析：Dify 工作流 ① 或 Mock。"""

from __future__ import annotations

from pathlib import Path

from pydantic import ValidationError

from apps.compliance.schemas.dify_contracts import DifyWorkflow1Output, DifyWorkflow1ReferenceItem
from apps.engine.dify_client import DifyApiError, DifyClient


def mock_workflow1_parse(file_name: str | None) -> dict:
    data = DifyWorkflow1Output(
        qb_code="Q/MOCK-2026",
        qb_name="Mock 企业标准",
        company_name="Mock 企业有限公司",
        indicators=[{"name": "水分", "value": "≤12%", "raw": None}],
        referenced_std_codes=["GB/T 1.1-2020", "GB/T 20000.1-2014"],
        references_detail=[
            DifyWorkflow1ReferenceItem(
                standard_id="GB/T 1.1-2020",
                has_year=True,
                full_text="Mock 引用原文 GB/T 1.1-2020",
            ),
            DifyWorkflow1ReferenceItem(
                standard_id="GB/T 20000.1-2014",
                has_year=True,
                full_text="Mock 引用原文 GB/T 20000.1-2014",
            ),
        ],
    )
    return data.model_dump()


def workflow1_parse_uploaded_file(local_path: Path, file_name: str | None, task_id: int) -> tuple[dict, dict | None]:
    """
    若已配置 DIFY_API_BASE + DIFY_API_KEY + DIFY_WORKFLOW1_FILES_INPUT_KEY，则走真实 Dify ①；
    否则返回 Mock。
    """
    client = DifyClient()
    if not client.is_workflow1_configured():
        return mock_workflow1_parse(file_name), None
    raw, meta = client.run_workflow_1_parse_enterprise(
        local_path,
        user=f"compliance-task-{task_id}",
        trace_id=f"compliance-task-{task_id}",
    )
    try:
        validated = DifyWorkflow1Output.model_validate(raw)
    except ValidationError as e:
        raise DifyApiError(f"Dify 工作流 ① 输出与后端契约 DifyWorkflow1Output 不一致: {e}") from e
    return validated.model_dump(), meta
