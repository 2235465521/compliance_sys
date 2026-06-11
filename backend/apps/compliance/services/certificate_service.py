"""占位证书写入 MEDIA_ROOT（阶段 8 与 archive 统一）。"""

from __future__ import annotations

from pathlib import Path

from django.conf import settings

from apps.compliance.models import ComplianceEvaluationTask

_MINIMAL_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def write_reference_certificate_placeholder(task: ComplianceEvaluationTask) -> str | None:
    root = Path(settings.MEDIA_ROOT) / "compliance_certs" / str(task.id)
    root.mkdir(parents=True, exist_ok=True)
    path = root / "reference_compliance.pdf"
    path.write_bytes(_MINIMAL_PDF)
    return str(path.relative_to(Path(settings.MEDIA_ROOT)))


def write_indicator_certificate_placeholder(task: ComplianceEvaluationTask) -> str | None:
    root = Path(settings.MEDIA_ROOT) / "compliance_certs" / str(task.id)
    root.mkdir(parents=True, exist_ok=True)
    path = root / "indicator_compare_certificate.pdf"
    path.write_bytes(_MINIMAL_PDF)
    return str(path.relative_to(Path(settings.MEDIA_ROOT)))
