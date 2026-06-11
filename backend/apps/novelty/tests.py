from __future__ import annotations

from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from apps.batch_normative_reference.models import (
    BatchNormativeReferenceItem,
    BatchNormativeReferenceJob,
)
from apps.compliance.models import ComplianceEvaluationTask
from apps.novelty.models import NoveltyReferenceBaselineSnapshot, NoveltySearchTask
from apps.novelty.services.baseline_service import get_baseline_map, record_baseline_rows
from apps.novelty.services.compare_service import compute_row_conclusion, compute_task_conclusion
from apps.novelty.services.history_aggregator import find_history_for_qb_code


class BaselineServiceTests(TestCase):
    def test_insert_if_not_exists_does_not_overwrite(self):
        rows = [
            {
                "referenced_std_code": "GB/T 1.1",
                "latest_std_primary": "GB/T 1.1-2020",
            }
        ]
        n1 = record_baseline_rows(
            "Q/TEST 001-2020",
            rows,
            source=NoveltyReferenceBaselineSnapshot.BaselineSource.COMPLIANCE,
            source_id=1,
        )
        self.assertEqual(n1, 1)
        n2 = record_baseline_rows(
            "Q/TEST 001-2020",
            [{"referenced_std_code": "GB/T 1.1", "latest_std_primary": "GB/T 1.1-2025"}],
            source=NoveltyReferenceBaselineSnapshot.BaselineSource.COMPLIANCE,
            source_id=2,
        )
        self.assertEqual(n2, 0)
        m = get_baseline_map("Q/TEST 001-2020")
        self.assertEqual(len(m), 1)
        snap = next(iter(m.values()))
        self.assertEqual(snap.baseline_latest_std_primary, "GB/T 1.1-2020")


class CompareServiceTests(TestCase):
    def test_row_conclusion_unchanged(self):
        self.assertEqual(
            compute_row_conclusion(
                baseline="GB/T 1.1-2020",
                current="GB/T 1.1-2020",
                compliance_assessable=True,
            ),
            "unchanged",
        )

    def test_row_conclusion_updated(self):
        self.assertEqual(
            compute_row_conclusion(
                baseline="GB/T 1.1-2020",
                current="GB/T 1.1-2025",
                compliance_assessable=True,
            ),
            "updated",
        )

    def test_task_conclusion_has_updates(self):
        rows = [{"row_conclusion": "updated"}, {"row_conclusion": "unchanged"}]
        conclusion, summary = compute_task_conclusion(rows)
        self.assertEqual(conclusion, "has_updates")
        self.assertIn("已更新", summary or "")


class HistoryAggregatorTests(TestCase):
    def test_find_history_compliance_and_batch(self):
        qb = "Q/HIST 001-2024"
        ComplianceEvaluationTask.objects.create(
            subject_code=qb,
            current_step=4,
            parse_result_json={"indicators": [{"name": "铅", "value": "0.1"}]},
        )
        job = BatchNormativeReferenceJob.objects.create(
            status=BatchNormativeReferenceJob.Status.COMPLETED,
            total_items=1,
            completed_items=1,
        )
        BatchNormativeReferenceItem.objects.create(
            job=job,
            sort_order=0,
            original_filename="a.pdf",
            stored_file_path="/tmp/a.pdf",
            status=BatchNormativeReferenceItem.Status.COMPLETED,
            parse_result_json={"qb_code": qb},
            reference_resolution_json=[
                {
                    "referenced_std_code": "GB 2762",
                    "full_std_at_publication": "GB 2762-2017",
                    "latest_std_primary": "GB 2762-2022",
                    "compliance_assessable": True,
                }
            ],
        )
        history = find_history_for_qb_code(qb)
        self.assertIsNotNone(history)
        assert history is not None
        self.assertGreaterEqual(len(history.reference_sheet_rows), 1)
        self.assertGreaterEqual(len(history.eval_reference_rows), 1)
        self.assertEqual(len(history.source_evaluations), 2)

    def test_find_history_empty(self):
        self.assertIsNone(find_history_for_qb_code("Q/NONE 999-2099"))


class NoveltySearchHttpTests(TestCase):
    def test_module_anonymous(self):
        r = self.client.get("/api/v1/novelty-search/module")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["module"], "novelty_search")

    @patch("apps.novelty.services.task_service.find_history_for_qb_code")
    def test_post_tasks_empty_history_422(self, mock_hist):
        mock_hist.return_value = None
        r = self.client.post(
            "/api/v1/novelty-search/tasks",
            data={"qb_code": "Q/EMPTY 001-2020"},
        )
        self.assertEqual(r.status_code, 422)
        self.assertIn("empty_history", r.json()["detail"])

    @patch("apps.novelty.services.task_service.find_history_for_qb_code")
    def test_post_tasks_creates_pending_confirm(self, mock_hist):
        from apps.novelty.services.history_aggregator import AggregatedHistory

        mock_hist.return_value = AggregatedHistory(
            subject_code="Q/OK 001-2020",
            reference_sheet_rows=[
                {
                    "id": "1",
                    "std_no": "GB/T 1.1",
                    "std_name": "导则",
                    "tech_fragment": None,
                    "remark": "",
                }
            ],
            full_std_by_ref_norm={},
            indicators={"enterprise_indicators": [], "national_by_std_code": {}, "source_evaluations": []},
            source_evaluations=[],
        )
        r = self.client.post(
            "/api/v1/novelty-search/tasks",
            data={"qb_code": "Q/OK 001-2020"},
        )
        self.assertEqual(r.status_code, 201, r.content)
        data = r.json()
        self.assertEqual(data["status"], "pending_confirm")
        self.assertEqual(len(data["reference_sheet"]), 1)

    @patch("apps.novelty.services.compare_service.resolve_reference_for_parse_context")
    @patch("apps.novelty.services.task_service.find_history_for_qb_code")
    def test_confirm_sheet_completes_compare(self, mock_hist, mock_resolve):
        from apps.novelty.services.history_aggregator import AggregatedHistory

        mock_hist.return_value = AggregatedHistory(
            subject_code="Q/CMP 001-2020",
            reference_sheet_rows=[
                {"id": "1", "std_no": "GB/T 1.1", "std_name": "导则", "tech_fragment": None, "remark": ""}
            ],
            full_std_by_ref_norm={},
            indicators={"enterprise_indicators": [], "national_by_std_code": {}, "source_evaluations": []},
            source_evaluations=[],
        )
        create_r = self.client.post(
            "/api/v1/novelty-search/tasks",
            data={"qb_code": "Q/CMP 001-2020"},
        )
        task_id = create_r.json()["id"]
        mock_resolve.return_value = {
            "query_bz_id": "GB/T 1.1",
            "resolution_path": "pedigree",
            "compliance_assessable": True,
            "historical_full_std_code": "GB/T 1.1-2020",
            "current_latest_id": "GB/T 1.1-2025",
            "pedigree_chain": "链",
        }
        r = self.client.post(
            f"/api/v1/novelty-search/tasks/{task_id}/confirm-sheet",
            data={},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["status"], "completed")
        self.assertEqual(len(body["compare_rows"]), 1)
        self.assertEqual(body["compare_rows"][0]["row_conclusion"], "first_record")

    @override_settings(COMPLIANCE_API_AUTH_REQUIRED=True)
    def test_cross_tenant_forbidden(self):
        task = NoveltySearchTask.objects.create(
            title="t",
            subject_code="Q/A 001",
            status=NoveltySearchTask.Status.PENDING_CONFIRM,
            created_by="alice",
        )
        r = self.client.get(
            f"/api/v1/novelty-search/tasks/{task.id}",
            HTTP_AUTHORIZATION="Bearer bob-token",
        )
        self.assertEqual(r.status_code, 403)

    def test_delete_task_returns_204(self):
        task = NoveltySearchTask.objects.create(
            title="del",
            subject_code="Q/DEL 001",
            status=NoveltySearchTask.Status.COMPLETED,
        )
        r = self.client.delete(f"/api/v1/novelty-search/tasks/{task.id}")
        self.assertEqual(r.status_code, 204, r.content)
        self.assertEqual(r.content, b"")
        self.assertFalse(NoveltySearchTask.objects.filter(pk=task.id).exists())

    def test_delete_task_not_found_404(self):
        r = self.client.delete("/api/v1/novelty-search/tasks/999999")
        self.assertEqual(r.status_code, 404)

    @override_settings(COMPLIANCE_API_AUTH_REQUIRED=True)
    def test_delete_task_forbidden_wrong_owner(self):
        from ninja.errors import HttpError

        from apps.novelty.services.task_service import delete_task_for_request

        task = NoveltySearchTask.objects.create(
            title="t",
            subject_code="Q/A 001",
            status=NoveltySearchTask.Status.COMPLETED,
            created_by="alice-subject",
        )
        req = MagicMock()
        req.auth = {"type": "bearer", "subject": "bob-subject"}
        with self.assertRaises(HttpError) as ctx:
            delete_task_for_request(task.id, req)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertTrue(NoveltySearchTask.objects.filter(pk=task.id).exists())

    def test_report_not_implemented(self):
        task = NoveltySearchTask.objects.create(
            title="t",
            subject_code="Q/A 001",
            status=NoveltySearchTask.Status.COMPLETED,
        )
        r = self.client.post(f"/api/v1/novelty-search/tasks/{task.id}/report")
        self.assertEqual(r.status_code, 501)


class ConfirmStep3BaselineHookTests(TestCase):
    @patch("apps.novelty.services.baseline_service.record_baseline_from_compliance_task")
    @patch("apps.compliance.services.certificate_service.write_reference_certificate_placeholder", return_value=None)
    @patch("apps.compliance.services.evaluation_flow.is_mysql", return_value=False)
    @patch("apps.compliance.services.evaluation_flow.require_mysql")
    def test_confirm_step3_calls_baseline(self, _req, _mysql, _cert, mock_baseline):
        from apps.compliance.schemas.api_schemas import Step3ConfirmIn
        from apps.compliance.services.evaluation_flow import confirm_step3

        task = ComplianceEvaluationTask.objects.create(subject_code="Q/X 001", current_step=3)
        confirm_step3(task.id, Step3ConfirmIn(rows=[]), request=None)
        mock_baseline.assert_called_once()
