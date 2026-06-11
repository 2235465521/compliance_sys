from __future__ import annotations

from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from apps.batch_normative_reference.models import BatchNormativeReferenceJob
from apps.batch_normative_reference.utils import referenced_codes_from_flat_parse


class ReferencedCodesFromFlatParseTests(TestCase):
    def test_from_referenced_std_codes(self):
        d = {"referenced_std_codes": ["GB 1", "GB 2"], "references_detail": []}
        self.assertEqual(referenced_codes_from_flat_parse(d), ["GB 1", "GB 2"])

    def test_from_references_detail(self):
        d = {
            "references_detail": [
                {"standard_id": "GB/T 191", "has_year": False},
                {"standard_id": "GB 2762", "has_year": True},
            ]
        }
        self.assertEqual(referenced_codes_from_flat_parse(d), ["GB/T 191", "GB 2762"])


class BatchJobHttpTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.batch_normative_reference.services.job_service.process_batch_normative_reference_job")
    @patch("apps.batch_normative_reference.services.job_service.DifyClient")
    def test_post_jobs_creates_row(self, mock_dify_cls, mock_task):
        mock_dify_cls.return_value.is_batch_normative_ref_configured.return_value = True
        mock_task.delay = MagicMock()
        pdf = SimpleUploadedFile("doc.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        # Django Test Client：文件须放在 data 中与字段名 files 一并编码为 multipart（勿用 files= 关键字）。
        r = self.client.post(
            "/api/v1/batch-normative-reference/jobs",
            data={"label": "batch-a", "files": pdf},
        )
        self.assertEqual(r.status_code, 201, r.content)
        data = r.json()
        self.assertEqual(data["total_items"], 1)
        self.assertEqual(data["status"], "pending")
        self.assertEqual(len(data["items"]), 1)
        self.assertTrue(BatchNormativeReferenceJob.objects.filter(pk=data["id"]).exists())
        mock_task.delay.assert_called_once()

    def test_post_jobs_without_files_422(self):
        r = self.client.post(
            "/api/v1/batch-normative-reference/jobs",
            data={"label": "x"},
            format="multipart",
        )
        self.assertEqual(r.status_code, 422)


class BatchJobDeleteTests(TestCase):
    def test_delete_job_returns_204_and_removes_rows(self):
        from apps.batch_normative_reference.models import BatchNormativeReferenceItem

        job = BatchNormativeReferenceJob.objects.create(
            status=BatchNormativeReferenceJob.Status.COMPLETED,
            label="del-me",
            total_items=1,
            completed_items=1,
            failed_items=0,
        )
        it = BatchNormativeReferenceItem.objects.create(
            job=job,
            sort_order=0,
            original_filename="a.pdf",
            stored_file_path="/tmp/x",
            status=BatchNormativeReferenceItem.Status.COMPLETED,
        )
        r = self.client.delete(f"/api/v1/batch-normative-reference/jobs/{job.id}")
        self.assertEqual(r.status_code, 204, r.content)
        self.assertEqual(r.content, b"")
        self.assertFalse(BatchNormativeReferenceJob.objects.filter(pk=job.id).exists())
        self.assertFalse(BatchNormativeReferenceItem.objects.filter(pk=it.id).exists())

    def test_delete_job_not_found_404(self):
        r = self.client.delete("/api/v1/batch-normative-reference/jobs/999999")
        self.assertEqual(r.status_code, 404)

    @override_settings(COMPLIANCE_API_AUTH_REQUIRED=True)
    def test_delete_job_forbidden_wrong_owner_service(self):
        from unittest.mock import MagicMock

        from ninja.errors import HttpError

        from apps.batch_normative_reference.services.job_service import delete_job_for_request

        job = BatchNormativeReferenceJob.objects.create(
            status=BatchNormativeReferenceJob.Status.PENDING,
            total_items=0,
            created_by="alice-subject",
        )
        req = MagicMock()
        req.auth = {"type": "bearer", "subject": "bob-subject"}
        with self.assertRaises(HttpError) as ctx:
            delete_job_for_request(job.id, req)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertTrue(BatchNormativeReferenceJob.objects.filter(pk=job.id).exists())


class BatchJobListAndPatchTests(TestCase):
    def test_get_jobs_pagination_empty(self):
        r = self.client.get("/api/v1/batch-normative-reference/jobs?page=1&page_size=10")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["total"], 0)
        self.assertEqual(data["results"], [])
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["page_size"], 10)

    def test_patch_item_references_completed(self):
        from apps.batch_normative_reference.models import BatchNormativeReferenceItem

        job = BatchNormativeReferenceJob.objects.create(
            status=BatchNormativeReferenceJob.Status.COMPLETED,
            label="t",
            total_items=1,
            completed_items=1,
            failed_items=0,
        )
        row = [
            {
                "referenced_std_code": "GB 1",
                "resolution_path": "pedigree_direct",
                "compliance_assessable": True,
                "full_std_at_publication": "GB 1-2020",
                "latest_std_primary": "GB 1-2020",
                "citation_matches_latest": True,
                "explanation": "",
            }
        ]
        it = BatchNormativeReferenceItem.objects.create(
            job=job,
            sort_order=0,
            original_filename="a.pdf",
            stored_file_path="/tmp/x",
            status=BatchNormativeReferenceItem.Status.COMPLETED,
            reference_resolution_json=row,
        )
        new_rows = [
            {
                "referenced_std_code": "GB 2",
                "resolution_path": "pedigree_direct",
                "compliance_assessable": True,
                "full_std_at_publication": "GB 2-2020",
                "latest_std_primary": "GB 2-2010",
                "explanation": "",
            }
        ]
        r = self.client.patch(
            f"/api/v1/batch-normative-reference/jobs/{job.id}/items/{it.id}",
            data=new_rows,
            content_type="application/json",
            format="json",
        )
        self.assertEqual(r.status_code, 422, r.content)  # wrong body shape

        r2 = self.client.patch(
            f"/api/v1/batch-normative-reference/jobs/{job.id}/items/{it.id}",
            data={"references_resolved": new_rows},
            content_type="application/json",
            format="json",
        )
        self.assertEqual(r2.status_code, 200, r2.content)
        body = r2.json()
        self.assertEqual(body["references_resolved"][0]["referenced_std_code"], "GB 2")
        self.assertEqual(body["file_compliance_outcome"], "non_compliant")
        it.refresh_from_db()
        self.assertEqual(len(it.reference_resolution_json), 1)
        self.assertEqual(it.reference_resolution_json[0]["referenced_std_code"], "GB 2")

    def test_patch_pending_item_422(self):
        from apps.batch_normative_reference.models import BatchNormativeReferenceItem

        job = BatchNormativeReferenceJob.objects.create(
            status=BatchNormativeReferenceJob.Status.PENDING,
            total_items=1,
        )
        it = BatchNormativeReferenceItem.objects.create(
            job=job,
            sort_order=0,
            original_filename="a.pdf",
            stored_file_path="/tmp/x",
            status=BatchNormativeReferenceItem.Status.PENDING,
        )
        r = self.client.patch(
            f"/api/v1/batch-normative-reference/jobs/{job.id}/items/{it.id}",
            data={"references_resolved": []},
            content_type="application/json",
            format="json",
        )
        self.assertEqual(r.status_code, 422)


class ReferenceBundleSharedTests(TestCase):
    def _gb_raw(
        self,
        *,
        ref: str,
        full: str,
        latest: str,
        path: str = "pedigree_direct",
        assessable: bool = True,
    ) -> dict:
        return {
            "query_bz_id": ref,
            "historical_full_std_code": full,
            "pedigree_anchor_std_code": full,
            "current_latest_std_codes": [latest],
            "current_latest_id": latest,
            "resolution_path": path,
            "pedigree_chain": "",
            "compliance_assessable": assessable,
        }

    @patch("apps.standards.services.reference_bundle.fetch_national_standard_names_by_codes")
    def test_normative_row_includes_std_names_when_basic_has_row(self, mock_names):
        mock_names.return_value = {"GB/T 1-2020": "测试标准名称"}
        from apps.standards.services.reference_bundle import normative_reference_row_out

        out = normative_reference_row_out(
            self._gb_raw(ref="GB/T 1", full="GB/T 1-2020", latest="GB/T 1-2020"),
        )
        mock_names.assert_called()
        self.assertEqual(out["full_std_name_at_publication"], "测试标准名称")
        self.assertEqual(out["latest_std_name"], "测试标准名称")

    @patch("apps.standards.services.reference_bundle.fetch_national_standard_names_by_codes")
    def test_attach_std_names_batch_dedupes_codes(self, mock_names):
        from apps.standards.services.reference_bundle import (
            attach_normative_reference_std_names,
            normative_reference_row_core,
        )

        mock_names.return_value = {"GB/T 1-2020": "同名"}
        r1 = normative_reference_row_core(self._gb_raw(ref="GB/T 1", full="GB/T 1-2020", latest="GB/T 1-2020"))
        r2 = normative_reference_row_core(self._gb_raw(ref="GB/T 1", full="GB/T 1-2020", latest="GB/T 1-2020"))
        attach_normative_reference_std_names([r1, r2])
        mock_names.assert_called_once()
        args = mock_names.call_args[0][0]
        self.assertEqual(len(args), 1)
        self.assertEqual(args[0], "GB/T 1-2020")

    def test_normative_row_compliant_match(self):
        from apps.standards.services.reference_bundle import normative_reference_row_out

        out = normative_reference_row_out(
            self._gb_raw(ref="GB/T 1", full="GB/T 1-2020", latest="GB/T 1-2020"),
        )
        self.assertEqual(out["referenced_std_code"], "GB/T 1")
        self.assertEqual(out["full_std_at_publication"], "GB/T 1-2020")
        self.assertEqual(out["latest_std_primary"], "GB/T 1-2020")
        self.assertTrue(out["citation_matches_latest"])

    def test_normative_row_non_compliant_mismatch(self):
        from apps.standards.services.reference_bundle import normative_reference_row_out

        out = normative_reference_row_out(
            self._gb_raw(ref="GB/T 191", full="GB/T 191-2008", latest="GB/T 191-2020"),
        )
        self.assertFalse(out["citation_matches_latest"])

    def test_normative_row_non_compliant_primary_not_full(self):
        from apps.standards.services.reference_bundle import normative_reference_row_out

        out = normative_reference_row_out(
            self._gb_raw(ref="GB/T 191", full="GB/T 191-2020", latest="GB/T 191-2008"),
        )
        self.assertFalse(out["citation_matches_latest"])

    def test_normative_row_match_when_primary_equals_full(self):
        from apps.standards.services.reference_bundle import normative_reference_row_out

        out = normative_reference_row_out(
            self._gb_raw(ref="GB/T 191", full="GB/T 191-2020", latest="GB/T 191-2020"),
        )
        self.assertTrue(out["citation_matches_latest"])

    def test_unresolved_path_citation_null(self):
        from apps.standards.services.reference_bundle import normative_reference_row_out

        raw = {
            "query_bz_id": "GB/X",
            "resolution_path": "unresolved_no_historical_row",
            "historical_full_std_code": None,
            "current_latest_std_codes": [],
            "current_latest_id": "",
            "pedigree_chain": "x",
            "compliance_assessable": False,
        }
        out = normative_reference_row_out(raw)
        self.assertIsNone(out["citation_matches_latest"])

    def test_file_compliance_outcome(self):
        from apps.standards.services.reference_bundle import (
            FILE_COMPLIANCE_COMPLIANT,
            FILE_COMPLIANCE_NON_COMPLIANT,
            FILE_COMPLIANCE_NO_REFERENCES,
            FILE_COMPLIANCE_UNDETERMINED,
            compute_normative_reference_file_outcome,
        )

        self.assertEqual(compute_normative_reference_file_outcome(None), FILE_COMPLIANCE_NO_REFERENCES)
        self.assertEqual(compute_normative_reference_file_outcome([]), FILE_COMPLIANCE_NO_REFERENCES)
        self.assertEqual(
            compute_normative_reference_file_outcome(
                [{"compliance_assessable": True, "citation_matches_latest": True}]
            ),
            FILE_COMPLIANCE_COMPLIANT,
        )
        self.assertEqual(
            compute_normative_reference_file_outcome(
                [
                    {"compliance_assessable": True, "citation_matches_latest": True},
                    {"compliance_assessable": True, "citation_matches_latest": False},
                ]
            ),
            FILE_COMPLIANCE_NON_COMPLIANT,
        )
        self.assertEqual(
            compute_normative_reference_file_outcome(
                [{"compliance_assessable": False, "citation_matches_latest": None}]
            ),
            FILE_COMPLIANCE_UNDETERMINED,
        )

    def test_qb_row_undetermined_file_outcome(self):
        from apps.standards.services.reference_bundle import (
            FILE_COMPLIANCE_UNDETERMINED,
            compute_normative_reference_file_outcome,
            normative_reference_row_out,
        )
        from apps.standards.services.reference_resolution import RESOLUTION_PATH_QB_ENTERPRISE_CITATION

        raw = {
            "query_bz_id": "QB/T 1-2020",
            "resolution_path": RESOLUTION_PATH_QB_ENTERPRISE_CITATION,
            "historical_full_std_code": None,
            "current_latest_id": "",
            "current_latest_std_codes": [],
            "pedigree_chain": "",
            "compliance_assessable": False,
        }
        out = normative_reference_row_out(raw)
        self.assertIsNone(out["citation_matches_latest"])
        self.assertEqual(
            compute_normative_reference_file_outcome([out]),
            FILE_COMPLIANCE_UNDETERMINED,
        )

    def test_enrich_restores_assessable_when_omitted_legacy_mixed_row(self):
        """模拟落库/PATCH 混用 legacy 键且缺省 compliance_assessable：勿钉死为 false。"""
        from apps.standards.services.reference_bundle import (
            FILE_COMPLIANCE_NON_COMPLIANT,
            compute_normative_reference_file_outcome,
            enrich_normative_reference_row,
        )

        row = {
            "referenced_std_code": "GB/T 13217.1-2020",
            "query_bz_id": "GB/T 13217.1-2020",
            "resolution_path": "pedigree_direct",
            "full_std_at_publication": "GB/T 13217.1-2020",
            "historical_full_std_code": "GB/T 13217.1-2020",
            "latest_std_primary": "GB/T 13217.1-2020",
            "current_latest_id": "GB/T 13217.1-2020",
            "latest_std_code_raw": "GB/T 13217.1-2020",
        }
        enrich_normative_reference_row(row)
        self.assertTrue(row["compliance_assessable"])
        self.assertTrue(row["citation_matches_latest"])

        mismatch = {
            "referenced_std_code": "GB 24613-2009",
            "resolution_path": "pedigree_direct",
            "full_std_at_publication": "GB 24613-2009",
            "latest_std_primary": "GB 30981.2-2025",
            "current_latest_id": "GB 30981.2-2025",
            "latest_std_code_raw": "GB 30981.2-2025",
        }
        enrich_normative_reference_row(mismatch)
        self.assertTrue(mismatch["compliance_assessable"])
        self.assertFalse(mismatch["citation_matches_latest"])
        self.assertEqual(
            compute_normative_reference_file_outcome([row, mismatch]),
            FILE_COMPLIANCE_NON_COMPLIANT,
        )

    def test_historical_then_pedigree_slim_row_without_inferred_still_assessable(self):
        """精简行仅有 full_std_at_publication、无 inferred_historical_std_code 时须可比对（与 resolve 一致）。"""
        from apps.standards.services.reference_bundle import enrich_normative_reference_row

        row = {
            "referenced_std_code": "GB/T 1732",
            "resolution_path": "historical_then_pedigree",
            "full_std_at_publication": "GB/T 1732-1993",
            "latest_std_primary": "GB/T 1732-2020",
        }
        enrich_normative_reference_row(row)
        self.assertTrue(row["compliance_assessable"])
        self.assertFalse(row["citation_matches_latest"])

        same = {
            "referenced_std_code": "GB 6566",
            "resolution_path": "historical_then_pedigree",
            "full_std_at_publication": "GB 6566-2010",
            "latest_std_primary": "GB 6566-2010",
        }
        enrich_normative_reference_row(same)
        self.assertTrue(same["compliance_assessable"])
        self.assertTrue(same["citation_matches_latest"])
        from apps.standards.services.reference_bundle import (
            FILE_COMPLIANCE_UNDETERMINED,
            compute_normative_reference_file_outcome,
        )
        from apps.standards.services.reference_resolution import RESOLUTION_PATH_QB_ENTERPRISE_CITATION

        self.assertEqual(
            compute_normative_reference_file_outcome(
                [
                    {
                        "compliance_assessable": False,
                        "citation_matches_latest": None,
                        "resolution_path": RESOLUTION_PATH_QB_ENTERPRISE_CITATION,
                    },
                    {"compliance_assessable": True, "citation_matches_latest": True},
                ]
            ),
            FILE_COMPLIANCE_UNDETERMINED,
        )


class QbEnterpriseCitationResolutionTests(TestCase):
    @patch("apps.standards.services.reference_resolution._fetch_pedigree_row")
    @patch("apps.standards.services.reference_resolution._infer_std_code_from_pedigree_prefix")
    @patch("apps.standards.services.reference_resolution.is_mysql", return_value=True)
    def test_qb_prefix_skips_pedigree_and_infer(self, _mock_mysql, mock_infer, mock_pedigree):
        from apps.standards.services.reference_resolution import (
            RESOLUTION_PATH_QB_ENTERPRISE_CITATION,
            resolve_reference_for_parse_context,
        )

        out = resolve_reference_for_parse_context(
            "  qb/T-demo-2020  ",
            pr={},
            qb_code=None,
            fallback_year=2024,
        )
        mock_pedigree.assert_not_called()
        mock_infer.assert_not_called()
        self.assertEqual(out["resolution_path"], RESOLUTION_PATH_QB_ENTERPRISE_CITATION)
        self.assertIsNone(out["historical_full_std_code"])
        self.assertEqual(out["query_bz_id"], "qb/T-demo-2020")
        self.assertEqual(out["current_latest_id"], "")
        self.assertEqual(out["current_latest_std_codes"], [])
        self.assertFalse(out["compliance_assessable"])


class MissingEnterpriseQbResolutionTests(TestCase):
    @patch("apps.standards.services.reference_resolution._infer_std_code_from_pedigree_prefix")
    @patch("apps.standards.services.reference_resolution.is_mysql", return_value=True)
    def test_gb_without_complete_qb_code_short_circuits(self, _mock_mysql, mock_infer):
        from apps.standards.services.reference_resolution import (
            RESOLUTION_PATH_MISSING_ENTERPRISE_QB,
            resolve_reference_for_parse_context,
        )

        out = resolve_reference_for_parse_context(
            "GB/T 191",
            pr={"企标编号": "内部流水号-001", "publish_date": "2020-01-01"},
            qb_code=None,
            fallback_year=2020,
        )
        mock_infer.assert_not_called()
        self.assertEqual(out["resolution_path"], RESOLUTION_PATH_MISSING_ENTERPRISE_QB)
        self.assertEqual(out["current_latest_id"], "")
        self.assertEqual(out["current_latest_std_codes"], [])
        self.assertIsNone(out["historical_full_std_code"])
        self.assertFalse(out["compliance_assessable"])


class BatchJobProcessTaskTests(TestCase):
    @patch("apps.batch_normative_reference.tasks.attach_normative_reference_std_names")
    @patch("apps.batch_normative_reference.tasks.resolve_reference_for_parse_context")
    @patch("apps.batch_normative_reference.tasks.DifyClient")
    def test_process_job_continues_after_item_db_error(self, mock_dify_cls, mock_resolve, _mock_names):
        from apps.batch_normative_reference.models import BatchNormativeReferenceItem
        from apps.batch_normative_reference.tasks import _process_batch_normative_reference_job_impl

        mock_dify_cls.return_value.is_batch_normative_ref_configured.return_value = True

        def _dify_side_effect(path, **kwargs):
            name = path.name if hasattr(path, "name") else str(path)
            if name == "a.pdf":
                return (
                    {"qb_code": "Q/TEST 1-2020", "referenced_std_codes": ["GB/T 1"]},
                    {"workflow_run_id": "w1"},
                )
            return (
                {"qb_code": "Q/TEST 2-2020", "referenced_std_codes": ["GB/T 2"]},
                {"workflow_run_id": "w2"},
            )

        mock_dify_cls.return_value.run_batch_normative_ref_workflow.side_effect = _dify_side_effect

        def _resolve_side_effect(ref, **kwargs):
            if ref == "GB/T 1":
                raise RuntimeError("(1146, \"Table 'standard_pedigree' doesn't exist\")")
            return {
                "query_bz_id": ref,
                "resolution_path": "pedigree_direct",
                "historical_full_std_code": "GB/T 2-2020",
                "current_latest_id": "GB/T 2-2020",
                "current_latest_std_codes": ["GB/T 2-2020"],
                "compliance_assessable": True,
            }

        mock_resolve.side_effect = _resolve_side_effect

        job = BatchNormativeReferenceJob.objects.create(
            status=BatchNormativeReferenceJob.Status.PENDING,
            total_items=2,
        )
        it1 = BatchNormativeReferenceItem.objects.create(
            job=job,
            sort_order=0,
            original_filename="a.pdf",
            stored_file_path="a.pdf",
            status=BatchNormativeReferenceItem.Status.PENDING,
        )
        it2 = BatchNormativeReferenceItem.objects.create(
            job=job,
            sort_order=1,
            original_filename="b.pdf",
            stored_file_path="b.pdf",
            status=BatchNormativeReferenceItem.Status.PENDING,
        )

        result = _process_batch_normative_reference_job_impl(job.id)
        self.assertEqual(result, "ok")

        job.refresh_from_db()
        it1.refresh_from_db()
        it2.refresh_from_db()
        self.assertEqual(job.status, BatchNormativeReferenceJob.Status.COMPLETED)
        self.assertEqual(job.completed_items, 1)
        self.assertEqual(job.failed_items, 1)
        self.assertEqual(it1.status, BatchNormativeReferenceItem.Status.FAILED)
        self.assertIn("standard_pedigree", it1.error_message or "")
        self.assertEqual(it2.status, BatchNormativeReferenceItem.Status.COMPLETED)


class NonGbCitationResolutionTests(TestCase):
    @patch("apps.standards.services.reference_resolution._fetch_pedigree_row")
    @patch("apps.standards.services.reference_resolution._infer_std_code_from_pedigree_prefix")
    @patch("apps.standards.services.reference_resolution.is_mysql", return_value=True)
    def test_non_gb_skips_infer_and_pedigree(self, _mock_mysql, mock_infer, mock_pedigree):
        from apps.standards.services.reference_resolution import (
            RESOLUTION_PATH_MANUAL_REVIEW_NON_GB,
            resolve_reference_for_parse_context,
        )

        out = resolve_reference_for_parse_context(
            "DB11/T 419-2021",
            pr={},
            qb_code=None,
            fallback_year=2024,
        )
        mock_infer.assert_not_called()
        mock_pedigree.assert_not_called()
        self.assertEqual(out["resolution_path"], RESOLUTION_PATH_MANUAL_REVIEW_NON_GB)
        self.assertEqual(out["current_latest_id"], "")
        self.assertEqual(out["current_latest_std_codes"], [])
        self.assertIsNone(out["historical_full_std_code"])
        self.assertFalse(out["compliance_assessable"])
