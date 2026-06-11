from django.test import SimpleTestCase, TestCase, override_settings

import os
import json
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection

from apps.compliance.models import ComplianceEvaluationTask
from apps.compliance.schemas.api_schemas import ComparePairIn, StdCodeOrchestrationStatus
from apps.compliance.services.evaluation_flow import (
    _build_workflow3_enterprise_data,
    _build_workflow3_reference_data,
    _orchestrate_single_std_code,
    _split_compare_pairs_to_sides,
    _unique_std_codes_from_compare_pairs,
)

from apps.standards.services.reference_resolution import (
    _split_latest_std_codes,
    enterprise_as_of_year_from_parse_dict,
    enterprise_as_of_year_from_task,
    std_code_has_year_suffix,
    _historical_full_std_code_for_resolve,
    _truncate_part_chain_for_display,
    resolve_reference_for_parse_context,
)

from apps.compliance.schemas.dify_contracts import DifyWorkflow1Output
from apps.compliance.state_machine import (
    TaskStateView,
    assert_confirm_step1,
    assert_confirm_step3,
    assert_confirm_step4,
    assert_confirm_step5,
    assert_upload_allowed,
    next_step_after_confirm,
)
from apps.compliance.services.task_status import compute_display_status
from apps.engine.dify_client import (
    extract_workflow1_output_dict,
    extract_workflow2_indexes_json,
    extract_workflow2_indicator_lines,
)


class DifyWorkflow1ExtractTests(SimpleTestCase):
    def test_flat_outputs_root_with_qb_id_and_reference_objects(self):
        outputs = {
            "qb_id": "Q/AHYY 001-2020",
            "qb_name": "《茶制代烟品》",
            "company_name": "安徽御叶生物科技有限公司",
            "qibiao_release_date": "2020-12-28",
            "indexes": [
                {
                    "index_name": "理化指标",
                    "key": "焦油量",
                    "value": "≤18 mg/支",
                    "index_type": "具体值",
                },
            ],
            "references": [
                {"standard_id": "GB/T 191", "has_year": False, "full_text": "GB/T191 包装储运图示标志"},
                {"standard_id": "GB 2762", "has_year": True, "full_text": "GB2762 …"},
            ],
        }
        raw = extract_workflow1_output_dict(outputs)
        out = DifyWorkflow1Output.model_validate(raw)
        self.assertEqual(out.qb_code, "Q/AHYY 001-2020")
        self.assertEqual(out.qb_name, "《茶制代烟品》")
        self.assertEqual(out.company_name, "安徽御叶生物科技有限公司")
        self.assertEqual(out.publish_date, "2020-12-28")
        self.assertEqual(len(out.indicators), 1)
        self.assertEqual(out.indicators[0].name, "理化指标 / 焦油量")
        self.assertEqual(out.indicators[0].value, "≤18 mg/支")
        self.assertEqual(out.referenced_std_codes, ["GB/T 191", "GB 2762"])
        self.assertEqual(len(out.references_detail), 2)
        self.assertEqual(out.references_detail[0].standard_id, "GB/T 191")
        self.assertEqual(out.references_detail[0].has_year, False)
        self.assertEqual(out.references_detail[0].full_text, "GB/T191 包装储运图示标志")
        self.assertEqual(out.references_detail[1].standard_id, "GB 2762")


class DifyWorkflow2ExtractTests(SimpleTestCase):
    _SAMPLE_INDEXES = [
        {
            "index_name": "感官和理化指标",
            "index_type": "其他",
            "index_content": {
                "外观": "不分层，无明显悬浮物或沉淀，无机械杂质的均匀液体",
                "气味": "无异味，符合规定香型",
            },
        },
        {
            "index_name": "感官和理化指标",
            "index_type": "具体值",
            "index_content": {
                "总活性物": "≥6 %",
                "PH（25℃,1%水溶液）": "4.0-10.0",
            },
        },
        {
            "index_name": "性能指标",
            "index_type": "其他",
            "index_content": {"去污力要求": "规定污布 JB-01、JB-02、JB-03 中任意一种污布的去污力大于或等于标准洗衣液"},
        },
    ]

    def test_indexes_root_saves_whole_array_as_one_payload(self):
        outputs = {"indexes": self._SAMPLE_INDEXES}
        lines = extract_workflow2_indicator_lines(outputs)
        self.assertEqual(len(lines), 1)
        parsed = json.loads(lines[0])
        self.assertIsInstance(parsed, list)
        self.assertEqual(len(parsed), 3)
        self.assertEqual(parsed[0]["index_name"], "感官和理化指标")
        self.assertIn("外观", parsed[0]["index_content"])
        self.assertEqual(parsed[1]["index_content"]["总活性物"], "≥6 %")

    def test_text_field_json_array_parsed_as_whole_list(self):
        outputs = {"text": json.dumps(self._SAMPLE_INDEXES, ensure_ascii=False)}
        payload = extract_workflow2_indexes_json(outputs)
        self.assertIsNotNone(payload)
        parsed = json.loads(payload or "")
        self.assertEqual(len(parsed), 3)

    def test_wrapper_dict_with_indexes_expands_to_array_not_rows(self):
        outputs = {
            "GB_init_info": {
                "std_code": "GB/T 4472-2025",
                "indexes": self._SAMPLE_INDEXES[:1],
            },
        }
        lines = extract_workflow2_indicator_lines(outputs, wrapper_key="GB_init_info")
        self.assertEqual(len(lines), 1)
        parsed = json.loads(lines[0])
        self.assertEqual(len(parsed), 1)
        self.assertIn("index_content", parsed[0])

    def test_qb_init_info_dict_still_supported(self):
        inner = {
            "qb_id": "Q/X 1-2024",
            "indexes": [{"index_name": "A", "key": "k", "value": "v"}],
            "references": ["GB 1", "GB 2"],
        }
        outputs = {"QB_init_info": inner}
        raw = extract_workflow1_output_dict(outputs)
        out = DifyWorkflow1Output.model_validate(raw)
        self.assertEqual(out.qb_code, "Q/X 1-2024")
        self.assertEqual(out.referenced_std_codes, ["GB 1", "GB 2"])
        self.assertEqual(len(out.references_detail), 2)
        self.assertEqual(out.references_detail[0].standard_id, "GB 1")
        self.assertIsNone(out.references_detail[0].has_year)
        self.assertIsNone(out.references_detail[0].full_text)


class Step2SuggestedReferencesTests(SimpleTestCase):
    def test_build_from_references_detail(self):
        from apps.compliance.services.evaluation_flow import build_step2_suggested_references

        pr = {
            "references_detail": [
                {"standard_id": "GB/T 191", "has_year": False, "full_text": "包装储运图示标志"},
            ],
            "referenced_std_codes": ["GB/T 191"],
        }
        rows = build_step2_suggested_references(pr)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["referenced_std_code"], "GB/T 191")
        self.assertEqual(rows[0]["latest_std_code"], None)
        self.assertEqual(rows[0]["has_year"], False)
        self.assertEqual(rows[0]["full_text"], "包装储运图示标志")

    def test_build_legacy_codes_only(self):
        from apps.compliance.services.evaluation_flow import build_step2_suggested_references

        rows = build_step2_suggested_references({"referenced_std_codes": ["GB 1", "GB 2"]})
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["referenced_std_code"], "GB 1")
        self.assertIsNone(rows[0]["has_year"])
        self.assertIsNone(rows[0]["full_text"])


class ReferenceResolutionAuxTests(SimpleTestCase):
    def test_enterprise_as_of_year_uses_qibiao_release_date(self):
        t = MagicMock()
        t.parse_result_json = {"qibiao_release_date": "2018-06-01"}
        t.subject_code = None
        t.created_at = datetime(2020, 1, 1)
        self.assertEqual(enterprise_as_of_year_from_task(t), 2018)
        self.assertEqual(
            enterprise_as_of_year_from_parse_dict(
                {"qibiao_release_date": "2018-06-01"},
                subject_code=None,
                fallback_year=2020,
            ),
            2018,
        )

    def test_historical_full_std_code_alias(self):
        self.assertEqual(
            _historical_full_std_code_for_resolve(ref="GB 1-2020", has_year=True, inferred=None),
            "GB 1-2020",
        )
        self.assertEqual(
            _historical_full_std_code_for_resolve(ref="GB 1", has_year=False, inferred="GB 1-2017"),
            "GB 1-2017",
        )
        self.assertIsNone(_historical_full_std_code_for_resolve(ref="GB 1", has_year=False, inferred=None))

    @patch("apps.standards.services.reference_resolution.is_mysql", return_value=True)
    @patch(
        "apps.standards.services.reference_resolution._infer_std_code_from_pedigree_prefix",
        return_value=None,
    )
    def test_parse_context_no_infer_latest_empty(self, _mock_infer, _mock_mysql):
        """无年代号且谱系前缀族未筛出时点内版本：现行侧为空。"""
        out = resolve_reference_for_parse_context(
            "GB/T 191",
            pr={"publish_date": "2020-01-01"},
            subject_code="Q/Test-001-2020",
            fallback_year=2020,
        )
        self.assertEqual(out["resolution_path"], "unresolved_no_historical_row")
        self.assertEqual(out["current_latest_id"], "")
        self.assertEqual(out["current_latest_std_codes"], [])
        self.assertIsNone(out["historical_full_std_code"])
        self.assertFalse(out["compliance_assessable"])

    @patch("apps.standards.services.reference_resolution.is_mysql", return_value=True)
    def test_parse_context_non_q_slash_qb_triggers_missing_path(self, _mock_mysql):
        """任务/解析里仅有非 Q/… 占位串时：不走国标推断，现行为空（missing_enterprise_subject_code）。"""
        from apps.standards.services.reference_resolution import (
            RESOLUTION_PATH_MISSING_ENTERPRISE_QB,
            resolve_reference_for_parse_context,
        )

        out = resolve_reference_for_parse_context(
            "GB 1",
            pr={"企标编号": "备案文号-2020"},
            qb_code="仅内部编号",
            fallback_year=2020,
        )
        self.assertEqual(out["resolution_path"], RESOLUTION_PATH_MISSING_ENTERPRISE_QB)
        self.assertEqual(out["current_latest_id"], "")
        self.assertEqual(out["current_latest_std_codes"], [])
        self.assertFalse(out["compliance_assessable"])

    def test_part_chain_truncates_when_limit_positive(self):
        with patch.dict(os.environ, {"REFERENCE_PEDIGREE_CHAIN_MAX_CHARS": "5"}):
            self.assertEqual(_truncate_part_chain_for_display("0123456789"), "01234…")

    def test_part_chain_no_trunc_when_limit_zero(self):
        long = "A" * 2000
        with patch.dict(os.environ, {"REFERENCE_PEDIGREE_CHAIN_MAX_CHARS": "0"}):
            self.assertEqual(_truncate_part_chain_for_display(long), long)


class SplitLatestStdCodesTests(SimpleTestCase):
    def test_split_dunhao_two_codes(self):
        self.assertEqual(
            _split_latest_std_codes("GB/T A-2021、GB/T B-2022"),
            ["GB/T A-2021", "GB/T B-2022"],
        )

    def test_split_ordered_dedup(self):
        self.assertEqual(
            _split_latest_std_codes("GB 1, GB 2; GB 1"),
            ["GB 1", "GB 2"],
        )


class ReferenceLatestBundleTests(SimpleTestCase):
    @patch("apps.compliance.services.evaluation_flow.is_mysql", return_value=False)
    @patch("apps.compliance.services.evaluation_flow.get_compliance_task_or_404")
    @patch("apps.compliance.services.evaluation_flow.require_mysql")
    def test_sqlite_with_subject_code_raises_503(self, _require_mysql, mock_get_task, _mock_is_mysql):
        from ninja.errors import HttpError

        from apps.compliance.services.evaluation_flow import get_reference_latest_bundle

        task = MagicMock()
        task.current_step = 3
        task.subject_code = "Q/X 1-2024"
        mock_get_task.return_value = task

        with self.assertRaises(HttpError) as ctx:
            get_reference_latest_bundle(1)
        self.assertEqual(ctx.exception.status_code, 503)

    @patch("apps.compliance.services.evaluation_flow.get_compliance_task_or_404")
    @patch("apps.compliance.services.evaluation_flow.require_mysql")
    def test_no_subject_code_returns_empty_list(self, _require_mysql, mock_get_task):
        from apps.compliance.services.evaluation_flow import get_reference_latest_bundle

        task = MagicMock()
        task.current_step = 3
        task.subject_code = ""
        mock_get_task.return_value = task

        self.assertEqual(
            get_reference_latest_bundle(1),
            {"references": [], "file_compliance_outcome": "no_references"},
        )


    def test_year_suffix_detection(self):
        self.assertTrue(std_code_has_year_suffix("GB/T 1.1-2020"))
        self.assertTrue(std_code_has_year_suffix("GB 1002－1996"))
        self.assertFalse(std_code_has_year_suffix("GB/T 1.1"))
        self.assertFalse(std_code_has_year_suffix("GB 1002"))


class DifyWorkflowConfigTests(SimpleTestCase):
    """步骤 4～5 依赖的工作流 ②③ 环境变量（与 backend/.env 一致，由 settings load_dotenv 加载）。"""

    def test_workflow1_configured(self):
        from apps.engine.dify_client import DifyClient

        c = DifyClient()
        self.assertTrue(c.is_workflow1_configured())
        self.assertEqual(c.workflow1_files_input_key, "QB_file")

    def test_workflow2_configured(self):
        from apps.engine.dify_client import DifyClient

        c = DifyClient()
        self.assertTrue(c.is_workflow2_configured())
        self.assertEqual(c.workflow2_files_input_key, "file")

    def test_workflow3_configured(self):
        from apps.engine.dify_client import DifyClient

        c = DifyClient()
        self.assertTrue(c.is_workflow3_configured())


class Step45StateMachineTests(SimpleTestCase):
    """步骤 4～5 闸门与步进（F8 状态机子集）。"""

    def test_confirm4_requires_at_least_step4_allows_reconfirm(self):
        assert_confirm_step4(TaskStateView(4, False, False, True))
        assert_confirm_step4(TaskStateView(5, True, False, True))
        assert_confirm_step4(TaskStateView(6, True, True, True))
        with self.assertRaises(ValueError):
            assert_confirm_step4(TaskStateView(3, False, False, True))

    def test_confirm3_requires_at_least_step3_allows_reconfirm(self):
        assert_confirm_step3(TaskStateView(3, False, False, True))
        assert_confirm_step3(TaskStateView(6, True, True, True))
        with self.assertRaises(ValueError):
            assert_confirm_step3(TaskStateView(2, False, False, True))

    def test_confirm5_requires_step5_and_step4_done(self):
        assert_confirm_step5(TaskStateView(5, True, False, True))
        with self.assertRaises(ValueError):
            assert_confirm_step5(TaskStateView(5, False, False, True))
        with self.assertRaises(ValueError):
            assert_confirm_step5(TaskStateView(4, True, False, True))

    def test_step_progression_after_confirm4_and5(self):
        self.assertEqual(next_step_after_confirm("confirm_step4"), 5)
        self.assertEqual(next_step_after_confirm("confirm_step5"), 6)


class StateMachineTests(SimpleTestCase):
    def test_upload_only_step1(self):
        assert_upload_allowed(TaskStateView(1, False, False, True))
        with self.assertRaises(ValueError):
            assert_upload_allowed(TaskStateView(2, False, False, True))

    def test_confirm1_requires_parse(self):
        with self.assertRaises(ValueError):
            assert_confirm_step1(TaskStateView(1, False, False, False))

    def test_upload_blocked_while_parse_pending(self):
        with self.assertRaises(ValueError):
            assert_upload_allowed(TaskStateView(1, False, False, False, parse_status="pending"))

    def test_confirm1_blocked_while_parse_running(self):
        with self.assertRaises(ValueError):
            assert_confirm_step1(TaskStateView(1, False, False, True, parse_status="running"))

    def test_confirm1_failed_shows_retry(self):
        with self.assertRaises(ValueError) as ctx:
            assert_confirm_step1(
                TaskStateView(1, False, False, True, parse_status="failed", parse_error="timeout")
            )
        self.assertIn("重新上传", str(ctx.exception))

    def test_next_step(self):
        self.assertEqual(next_step_after_confirm("confirm_step1"), 2)
        self.assertEqual(next_step_after_confirm("confirm_step5"), 6)


class Step5Workflow3CompareTests(SimpleTestCase):
    _PAIRS = [
        ComparePairIn(publication_std_code="GB 10035-2006", latest_std_code="GB/T 20882.1-2025"),
        ComparePairIn(publication_std_code=None, latest_std_code="GB/T 1628-2020"),
    ]

    def test_split_compare_pairs_to_sides_excludes_m_only_from_publication(self):
        pub, lat = _split_compare_pairs_to_sides(self._PAIRS)
        self.assertEqual(pub, ["GB 10035-2006"])
        self.assertEqual(lat, ["GB/T 20882.1-2025", "GB/T 1628-2020"])

    def test_build_workflow3_enterprise_data_includes_publication_side(self):
        bundle = {
            "enterprise_indicators": [{"name": "企标项"}],
            "national_by_std_code": {
                "GB 10035-2006": [{"id": 1}],
                "GB/T 20882.1-2025": [{"id": 2}],
                "GB/T 1628-2020": [{"id": 3}],
            },
            "publication_std_codes": ["GB 10035-2006"],
            "latest_std_codes": ["GB/T 20882.1-2025", "GB/T 1628-2020"],
        }
        ent = _build_workflow3_enterprise_data(bundle, "Q/Test-001")
        self.assertEqual(ent["qb_code"], "Q/Test-001")
        self.assertIn("publication_side", ent)
        self.assertNotIn("latest_side", ent)
        self.assertEqual(ent["publication_side"]["std_codes"], ["GB 10035-2006"])
        self.assertEqual(list(ent["publication_side"]["national_by_std_code"].keys()), ["GB 10035-2006"])
        self.assertNotIn("GB/T 1628-2020", ent["publication_side"]["national_by_std_code"])

    def test_build_workflow3_reference_data_latest_side_only(self):
        bundle = {
            "national_by_std_code": {
                "GB 10035-2006": [{"id": 1}],
                "GB/T 20882.1-2025": [{"id": 2}],
                "GB/T 1628-2020": [{"id": 3}],
            },
            "publication_std_codes": ["GB 10035-2006"],
            "latest_std_codes": ["GB/T 20882.1-2025", "GB/T 1628-2020"],
        }
        ref = _build_workflow3_reference_data(bundle)
        self.assertNotIn("publication_side", ref)
        self.assertIn("latest_side", ref)
        self.assertEqual(
            set(ref["latest_side"]["national_by_std_code"].keys()),
            {"GB/T 20882.1-2025", "GB/T 1628-2020"},
        )
        self.assertNotIn("GB 10035-2006", ref["latest_side"]["national_by_std_code"])


class Step4IndicatorsEnsureUnitTests(SimpleTestCase):
    def test_unique_std_codes_from_compare_pairs_dedupes(self):
        pairs = [
            ComparePairIn(publication_std_code="GB/T 4472-2011", latest_std_code="GB/T 4472-2025"),
            ComparePairIn(publication_std_code=None, latest_std_code="GB/T 20882.1-2025"),
            ComparePairIn(publication_std_code="GB/T 4472-2011", latest_std_code="GB/T 4472-2025"),
        ]
        self.assertEqual(
            _unique_std_codes_from_compare_pairs(pairs),
            ["GB/T 4472-2011", "GB/T 4472-2025", "GB/T 20882.1-2025"],
        )

    @patch("apps.compliance.services.evaluation_flow._dify2_fill_from_gb_file")
    @patch("apps.compliance.services.evaluation_flow._national_std_row")
    @patch("apps.compliance.services.evaluation_flow._has_indicator_rows")
    def test_orchestrate_skips_dify_when_not_target(self, mock_has, mock_row, mock_dify):
        mock_has.return_value = False
        mock_row.return_value = (True, "/tmp/a.pdf", "名称")
        task = ComplianceEvaluationTask(id=1)
        one = _orchestrate_single_std_code(task, "GB 1", invoke_dify=False)
        self.assertEqual(one.status, "pending_parse")
        mock_dify.assert_not_called()


class Step4IndicatorsEnsureHttpTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_post_ensure_step3_422(self):
        task = ComplianceEvaluationTask.objects.create(current_step=3)
        r = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/indicators/ensure",
            data={"compare_pairs": [{"publication_std_code": "GB 1", "latest_std_code": "GB 2"}]},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 422, r.content)

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.compliance.services.evaluation_flow.is_mysql", return_value=True)
    @patch("apps.compliance.services.evaluation_flow.require_mysql")
    def test_post_ensure_empty_codes_422(self, _req, _mysql):
        task = ComplianceEvaluationTask.objects.create(current_step=4)
        r = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/indicators/ensure",
            data={"compare_pairs": [{"publication_std_code": None, "latest_std_code": "  "}]},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 422, r.content)

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.compliance.services.evaluation_flow.is_mysql", return_value=True)
    @patch("apps.compliance.services.evaluation_flow.require_mysql")
    @patch("apps.compliance.services.evaluation_flow._run_orchestration_for_std_codes")
    @patch("apps.compliance.services.evaluation_flow.list_latest_side_std_codes_for_task")
    def test_post_ensure_all_ready(self, mock_list_latest, mock_run, _req, _mysql):
        task = ComplianceEvaluationTask.objects.create(
            current_step=4,
            parse_result_json={"indicators": [{"name": "x"}]},
            subject_code="Q/T 1",
        )
        mock_run.return_value = (
            {"GB/T 4472-2025": [{"id": 1, "std_code": "GB/T 4472-2025", "specific_indicator_value": "v"}]},
            [],
            [],
            [
                StdCodeOrchestrationStatus(
                    std_code="GB/T 4472-2025",
                    status="ready",
                    indicator_count=1,
                )
            ],
            {},
        )
        r = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/indicators/ensure",
            data={
                "compare_pairs": [
                    {"publication_std_code": "GB/T 4472-2011", "latest_std_code": "GB/T 4472-2025"},
                ]
            },
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertTrue(data["all_ready"])
        self.assertEqual(data["missing_gb_files"], [])
        self.assertEqual(data["publication_std_codes"], ["GB/T 4472-2011"])
        self.assertEqual(data["latest_std_codes"], ["GB/T 4472-2025"])
        task.refresh_from_db()
        bundle = task.indicator_bundle_json or {}
        self.assertEqual(bundle.get("publication_std_codes"), ["GB/T 4472-2011"])
        self.assertEqual(bundle.get("latest_std_codes"), ["GB/T 4472-2025"])
        mock_list_latest.assert_not_called()

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.compliance.services.evaluation_flow.is_mysql", return_value=True)
    @patch("apps.compliance.services.evaluation_flow.require_mysql")
    @patch("apps.compliance.services.evaluation_flow._run_orchestration_for_std_codes")
    def test_post_ensure_missing_file(self, mock_run, _req, _mysql):
        task = ComplianceEvaluationTask.objects.create(current_step=4)
        mock_run.return_value = (
            {},
            [{"std_code": "GB 9", "std_name": None, "reason": "empty_std_file_path"}],
            [],
            [
                StdCodeOrchestrationStatus(
                    std_code="GB 9",
                    status="missing_file",
                    indicator_count=0,
                    reason="empty_std_file_path",
                )
            ],
            {},
        )
        r = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/indicators/ensure",
            data={"compare_pairs": [{"publication_std_code": "GB 9", "latest_std_code": "GB 9"}]},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()["all_ready"])
        self.assertEqual(len(r.json()["missing_gb_files"]), 1)


class Step5CompareHttpTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_get_compare_step4_not_confirmed_422(self):
        task = ComplianceEvaluationTask.objects.create(
            current_step=5,
            step4_indicators_confirmed=False,
            indicator_bundle_json={
                "publication_std_codes": ["GB 1"],
                "latest_std_codes": ["GB 2"],
                "missing_gb_files": [],
            },
        )
        r = self.client.get(f"/api/v1/compliance/evaluations/{task.id}/step/5/compare")
        self.assertEqual(r.status_code, 422, r.content)

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.compliance.services.evaluation_flow.DifyClient")
    def test_post_compare_missing_gb_files_422(self, mock_dify_cls):
        task = ComplianceEvaluationTask.objects.create(
            current_step=5,
            step4_indicators_confirmed=True,
            indicator_bundle_json={
                "publication_std_codes": ["GB 9"],
                "latest_std_codes": ["GB 9"],
                "missing_gb_files": [{"std_code": "GB 9", "reason": "empty_std_file_path"}],
            },
        )
        r = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/5/compare",
            data={},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 422, r.content)
        mock_dify_cls.assert_not_called()

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.compliance.services.evaluation_flow.ensure_step4_indicators")
    @patch("apps.compliance.services.evaluation_flow.DifyClient")
    def test_post_compare_with_pairs_calls_ensure_then_wf3(self, mock_dify_cls, mock_ensure):
        from apps.compliance.schemas.api_schemas import Step4IndicatorsEnsureOut, Step4IndicatorsOut

        task = ComplianceEvaluationTask.objects.create(
            current_step=5,
            step4_indicators_confirmed=True,
            subject_code="Q/T 1",
            indicator_bundle_json={
                "subject_code": "Q/T 1",
                "enterprise_indicators": [],
                "national_by_std_code": {"GB/T 4472-2025": [{"id": 1}]},
                "missing_gb_files": [],
                "publication_std_codes": ["GB/T 4472-2011"],
                "latest_std_codes": ["GB/T 4472-2025"],
            },
        )
        mock_ensure.return_value = Step4IndicatorsEnsureOut(
            **Step4IndicatorsOut(
                subject_code="Q/T 1",
                enterprise_indicators=[],
                national_by_std_code={"GB/T 4472-2025": [{"id": 1}]},
                missing_gb_files=[],
            ).model_dump(),
            all_ready=True,
            publication_std_codes=["GB/T 4472-2011"],
            latest_std_codes=["GB/T 4472-2025"],
        )
        inst = mock_dify_cls.return_value
        inst.is_workflow3_configured.return_value = True
        inst.run_workflow_3_index_compare.return_value = (
            {"summary": "ok", "markdown": "|a|b|", "details": []},
            {"workflow_run_id": "wf3-test"},
        )

        r = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/5/compare",
            data={
                "compare_pairs": [
                    {"publication_std_code": "GB/T 4472-2011", "latest_std_code": "GB/T 4472-2025"},
                ]
            },
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        mock_ensure.assert_called_once()
        inst.run_workflow_3_index_compare.assert_called_once()
        call_kw = inst.run_workflow_3_index_compare.call_args.kwargs
        ent_obj = json.loads(call_kw["enterprise_data"])
        ref_obj = json.loads(call_kw["reference_data"])
        self.assertIn("publication_side", ent_obj)
        self.assertNotIn("publication_side", ref_obj)
        self.assertIn("latest_side", ref_obj)


class Step5CompareResultHttpTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.compliance.services.evaluation_flow.DifyClient")
    def test_compare_result_404_without_data(self, mock_dify_cls):
        task = ComplianceEvaluationTask.objects.create(current_step=5, step4_indicators_confirmed=True)
        r = self.client.get(
            f"/api/v1/compliance/evaluations/{task.id}/step/5/compare/result",
        )
        self.assertEqual(r.status_code, 404, r.content)
        mock_dify_cls.assert_not_called()

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.compliance.services.evaluation_flow.DifyClient")
    def test_compare_result_200_at_step6_no_dify(self, mock_dify_cls):
        payload = {"summary": "cached", "markdown": "|x|", "details": []}
        task = ComplianceEvaluationTask.objects.create(
            current_step=6,
            step4_indicators_confirmed=True,
            step5_compare_confirmed=True,
            compare_result_json=payload,
        )
        r = self.client.get(
            f"/api/v1/compliance/evaluations/{task.id}/step/5/compare/result",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["compare_result"], payload)
        mock_dify_cls.assert_not_called()

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.compliance.services.evaluation_flow.DifyClient")
    def test_post_compare_then_result_matches(self, mock_dify_cls):
        task = ComplianceEvaluationTask.objects.create(
            current_step=5,
            step4_indicators_confirmed=True,
            indicator_bundle_json={
                "publication_std_codes": ["GB 1"],
                "latest_std_codes": ["GB 2"],
                "missing_gb_files": [],
                "enterprise_indicators": [],
                "national_by_std_code": {},
            },
        )
        inst = mock_dify_cls.return_value
        inst.is_workflow3_configured.return_value = False
        post_r = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/5/compare",
            data={},
            content_type="application/json",
        )
        self.assertEqual(post_r.status_code, 200, post_r.content)
        expected = post_r.json()["compare_result"]

        get_r = self.client.get(
            f"/api/v1/compliance/evaluations/{task.id}/step/5/compare/result",
        )
        self.assertEqual(get_r.status_code, 200, get_r.content)
        self.assertEqual(get_r.json()["compare_result"], expected)
        self.assertEqual(mock_dify_cls.call_count, 1)


class ComplianceTaskOutHttpTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_task_detail_has_compare_flags(self):
        task = ComplianceEvaluationTask.objects.create(
            current_step=5,
            compare_result_json={"summary": "x"},
            step4_indicators_confirmed=True,
            parse_result_json={"company_name": "测试公司"},
        )
        r = self.client.get(f"/api/v1/compliance/evaluations/{task.id}")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertTrue(body["has_compare_result"])
        self.assertIsNotNone(body["compare_result_updated_at"])
        self.assertTrue(body["step4_indicators_confirmed"])
        self.assertEqual(body["company_name"], "测试公司")
        self.assertEqual(body["display_status"], "in_progress")


class EvaluationDeleteHttpTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_delete_in_progress_returns_204(self):
        task = ComplianceEvaluationTask.objects.create(current_step=3, parse_status="completed")
        r = self.client.delete(f"/api/v1/compliance/evaluations/{task.id}")
        self.assertEqual(r.status_code, 204, r.content)
        self.assertFalse(ComplianceEvaluationTask.objects.filter(pk=task.id).exists())

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_delete_completed_returns_204(self):
        task = ComplianceEvaluationTask.objects.create(
            current_step=6,
            step5_compare_confirmed=True,
            parse_status="completed",
        )
        r = self.client.delete(f"/api/v1/compliance/evaluations/{task.id}")
        self.assertEqual(r.status_code, 204, r.content)
        self.assertFalse(ComplianceEvaluationTask.objects.filter(pk=task.id).exists())

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_delete_while_parse_pending_409(self):
        task = ComplianceEvaluationTask.objects.create(current_step=1, parse_status="pending")
        r = self.client.delete(f"/api/v1/compliance/evaluations/{task.id}")
        self.assertEqual(r.status_code, 409, r.content)
        self.assertTrue(ComplianceEvaluationTask.objects.filter(pk=task.id).exists())

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_delete_not_found_404(self):
        r = self.client.delete("/api/v1/compliance/evaluations/999999")
        self.assertEqual(r.status_code, 404, r.content)

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_delete_removes_snapshots(self):
        from apps.compliance.models import ComplianceEvaluationSnapshot

        task = ComplianceEvaluationTask.objects.create(current_step=2, parse_status="completed")
        ComplianceEvaluationSnapshot.objects.create(task=task, step=1, payload_json={"x": 1})
        r = self.client.delete(f"/api/v1/compliance/evaluations/{task.id}")
        self.assertEqual(r.status_code, 204, r.content)
        self.assertEqual(ComplianceEvaluationSnapshot.objects.filter(task_id=task.id).count(), 0)


class EvaluationListPagedTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_list_without_query_returns_array(self):
        ComplianceEvaluationTask.objects.create(subject_code="Q/A 1", current_step=1)
        r = self.client.get("/api/v1/compliance/evaluations")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsInstance(r.json(), list)

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_list_with_status_returns_paged_object(self):
        ComplianceEvaluationTask.objects.create(subject_code="Q/B 2", current_step=2)
        r = self.client.get("/api/v1/compliance/evaluations?status=in_progress&page=1&page_size=10")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertIn("items", body)
        self.assertIn("total", body)
        self.assertGreaterEqual(body["total"], 1)


class DisplayStatusUnitTests(SimpleTestCase):
    def test_display_status_mapping(self):
        draft = ComplianceEvaluationTask(current_step=1, parse_status="completed")
        self.assertEqual(compute_display_status(draft), "draft")
        failed = ComplianceEvaluationTask(current_step=3, parse_status="failed")
        self.assertEqual(compute_display_status(failed), "failed")
        done = ComplianceEvaluationTask(
            current_step=6, step5_compare_confirmed=True, parse_status="completed"
        )
        self.assertEqual(compute_display_status(done), "completed")


class Step3ReconfirmInvalidateTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.novelty.services.baseline_service.record_baseline_from_compliance_task")
    @patch("apps.compliance.services.evaluation_flow.is_mysql", return_value=True)
    @patch("apps.compliance.services.evaluation_flow.connection")
    @patch("apps.compliance.services.certificate_service.write_reference_certificate_placeholder", return_value=None)
    def test_reconfirm_step3_clears_compare(self, _cert, mock_conn, _mysql, _baseline):
        cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        task = ComplianceEvaluationTask.objects.create(
            current_step=6,
            subject_code="Q/T RE",
            step4_indicators_confirmed=True,
            step5_compare_confirmed=True,
            compare_result_json={"summary": "old"},
        )
        r = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/3/confirm",
            data={"rows": []},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertFalse(body["has_compare_result"])
        self.assertEqual(body["current_step"], 4)
        task.refresh_from_db()
        self.assertIsNone(task.compare_result_json)
        self.assertFalse(task.step4_indicators_confirmed)


class ArtifactsUploadTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_list_artifacts_includes_uploaded_qb(self):
        import tempfile

        from django.test import override_settings

        from apps.compliance.services.evaluation_flow import list_artifacts

        media = Path(tempfile.mkdtemp())
        with override_settings(MEDIA_ROOT=str(media)):
            task = ComplianceEvaluationTask.objects.create(current_step=1)
            upload_dir = media / "compliance_uploads" / str(task.id)
            upload_dir.mkdir(parents=True, exist_ok=True)
            pdf = upload_dir / "企标.pdf"
            pdf.write_bytes(b"%PDF-1.4 test")
            task.uploaded_file_path = str(pdf)
            task.uploaded_file_name = "企标.pdf"
            task.save(update_fields=["uploaded_file_path", "uploaded_file_name"])
            items = list_artifacts(task=task)
        self.assertIn("uploaded_qb", [a.kind for a in items])

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_artifact_download_allows_uploads_dir(self):
        import tempfile

        from django.test import override_settings

        from apps.compliance.services.evaluation_flow import artifact_file_path_for_task

        media = Path(tempfile.mkdtemp())
        with override_settings(MEDIA_ROOT=str(media)):
            task = ComplianceEvaluationTask.objects.create(current_step=1)
            upload_dir = media / "compliance_uploads" / str(task.id)
            upload_dir.mkdir(parents=True)
            pdf = upload_dir / "a.pdf"
            pdf.write_bytes(b"x")
            rel = str(pdf.relative_to(media))
            resolved = artifact_file_path_for_task(task.id, rel)
        self.assertTrue(resolved.is_file())


_ENSURE_TEST_STD = "ZZ-TEST-ENSURE-001"


def _mysql_available() -> bool:
    return connection.vendor == "mysql"


def _table_exists(cursor, table_name: str) -> bool:
    cursor.execute("SHOW TABLES LIKE %s", [table_name])
    return cursor.fetchone() is not None


def _ensure_national_standard_basic_table(cursor) -> None:
    if _table_exists(cursor, "national_standard_basic"):
        return
    cursor.execute(
        """
        CREATE TABLE national_standard_basic (
            id BIGINT NOT NULL AUTO_INCREMENT,
            std_code VARCHAR(128) NOT NULL,
            std_name TEXT,
            std_file_path TEXT,
            PRIMARY KEY (id),
            UNIQUE KEY uq_national_standard_basic_std_code (std_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )


def _ensure_regulation_standard_indicator_table(cursor) -> None:
    if _table_exists(cursor, "regulation_standard_indicator"):
        return
    _ensure_national_standard_basic_table(cursor)
    # 不加 FK：Django migrate 建的 national_standard_basic.std_code 列类型/排序规则可能与 v1.0-sql 不一致，避免 3780
    cursor.execute(
        """
        CREATE TABLE regulation_standard_indicator (
            id BIGINT NOT NULL AUTO_INCREMENT,
            catalog_std_type_no VARCHAR(8) NOT NULL DEFAULT '00',
            subject_code VARCHAR(128) NOT NULL,
            specific_indicator_value LONGTEXT,
            manual_review_status ENUM('pending','approved','rejected') DEFAULT NULL,
            PRIMARY KEY (id),
            KEY idx_rsi_subject (catalog_std_type_no, subject_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )


def _v1sql_national_tables_ready() -> bool:
    """测试库仅有 Django migrate 时会有 basic 无 indicator；此处补齐 v1.0-sql 业务表。"""
    if not _mysql_available():
        return False
    with connection.cursor() as c:
        _ensure_national_standard_basic_table(c)
        _ensure_regulation_standard_indicator_table(c)
        return _table_exists(c, "national_standard_basic") and _table_exists(
            c, "regulation_standard_indicator"
        )


def _cleanup_ensure_test_std(std_code: str = _ENSURE_TEST_STD) -> None:
    if not _mysql_available():
        return
    if not _v1sql_national_tables_ready():
        return
    with connection.cursor() as c:
        c.execute(
            "DELETE FROM regulation_standard_indicator WHERE subject_code = %s AND catalog_std_type_no = '00'",
            [std_code],
        )
        c.execute("DELETE FROM national_standard_basic WHERE std_code = %s", [std_code])


def _seed_ensure_test_std(
    *,
    std_code: str = _ENSURE_TEST_STD,
    std_file_path: str | None = None,
    with_indicator: bool = False,
) -> None:
    _cleanup_ensure_test_std(std_code)
    with connection.cursor() as c:
        c.execute(
            """
            INSERT INTO national_standard_basic (std_code, std_name, std_file_path)
            VALUES (%s, %s, %s)
            """,
            [std_code, "ensure 集成测试标准", std_file_path],
        )
        if with_indicator:
            indexes_json = json.dumps(
                [
                    {
                        "index_name": "集成测试",
                        "index_type": "其他",
                        "index_content": {"指标": "集成测试指标"},
                    }
                ],
                ensure_ascii=False,
            )
            c.execute(
                """
                INSERT INTO regulation_standard_indicator (catalog_std_type_no, subject_code, specific_indicator_value, manual_review_status)
                VALUES ('00', %s, %s, 'approved')
                """,
                [std_code, indexes_json],
            )


@unittest.skipUnless(_mysql_available(), "requires MySQL")
@override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
class Step4IndicatorsEnsureMysqlIntegrationTests(TestCase):
    """依赖 national_standard_basic 业务表；仅在 MySQL 测试库运行。"""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not _v1sql_national_tables_ready():
            raise unittest.SkipTest("national_standard_* tables unavailable")

    def setUp(self):
        _cleanup_ensure_test_std()

    def tearDown(self):
        _cleanup_ensure_test_std()

    def _ensure_url(self, task_id: int) -> str:
        return f"/api/v1/compliance/evaluations/{task_id}/step/4/indicators/ensure"

    def _compare_pairs_body(
        self,
        std_code: str = _ENSURE_TEST_STD,
        *,
        target_std_codes: list[str] | None = None,
    ) -> dict:
        body: dict = {
            "compare_pairs": [{"publication_std_code": std_code, "latest_std_code": std_code}],
        }
        if target_std_codes is not None:
            body["target_std_codes"] = target_std_codes
        return body

    def test_ensure_ready_when_indicators_exist_no_dify2(self):
        _seed_ensure_test_std(with_indicator=True)
        task = ComplianceEvaluationTask.objects.create(current_step=4, subject_code="Q/T ENSURE")
        with patch("apps.compliance.services.evaluation_flow._dify2_fill_from_gb_file") as mock_dify2:
            r = self.client.post(
                self._ensure_url(task.id),
                data=self._compare_pairs_body(target_std_codes=[_ENSURE_TEST_STD]),
                content_type="application/json",
            )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertTrue(data["all_ready"])
        self.assertEqual(data["std_statuses"][0]["status"], "ready")
        self.assertEqual(data["std_statuses"][0]["indicator_count"], 1)
        mock_dify2.assert_not_called()
        task.refresh_from_db()
        self.assertEqual(task.indicator_bundle_json.get("missing_gb_files"), [])

    def test_ensure_parsed_via_dify2_when_file_exists_without_indicators(self):
        gb_path = Path(os.environ.get("TEMP", "/tmp")) / "ensure-test-gb.pdf"
        gb_path.write_bytes(b"%PDF-1.4 ensure integration test")
        self.addCleanup(lambda: gb_path.unlink(missing_ok=True))
        _seed_ensure_test_std(std_file_path=str(gb_path))
        task = ComplianceEvaluationTask.objects.create(current_step=4)
        with patch("apps.compliance.services.evaluation_flow.DifyClient") as mock_client_cls:
            mock_client_cls.return_value.is_workflow2_configured.return_value = False
            r = self.client.post(
                self._ensure_url(task.id),
                data=self._compare_pairs_body(target_std_codes=[_ENSURE_TEST_STD]),
                content_type="application/json",
            )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertTrue(data["all_ready"])
        self.assertEqual(data["std_statuses"][0]["status"], "parsed_via_dify2")
        self.assertIn(_ENSURE_TEST_STD, data["dify2_invoked_std_codes"])

    def test_ensure_missing_file_then_upload_then_all_ready(self):
        _seed_ensure_test_std(std_file_path=None)
        task = ComplianceEvaluationTask.objects.create(current_step=4, subject_code="Q/T UPLOAD")
        r1 = self.client.post(
            self._ensure_url(task.id),
            data=self._compare_pairs_body(),
            content_type="application/json",
        )
        self.assertEqual(r1.status_code, 200, r1.content)
        self.assertFalse(r1.json()["all_ready"])
        self.assertEqual(r1.json()["std_statuses"][0]["status"], "missing_file")

        upload = SimpleUploadedFile("ensure-test.pdf", b"%PDF-1.4 upload repair", content_type="application/pdf")
        r_upload = self.client.post(
            f"/api/v1/compliance/national-standards/upload?std_code={_ENSURE_TEST_STD}",
            data={"file": upload},
        )
        self.assertEqual(r_upload.status_code, 200, r_upload.content)

        with patch("apps.compliance.services.evaluation_flow.DifyClient") as mock_client_cls:
            mock_client_cls.return_value.is_workflow2_configured.return_value = False
            r2 = self.client.post(
                self._ensure_url(task.id),
                data=self._compare_pairs_body(target_std_codes=[_ENSURE_TEST_STD]),
                content_type="application/json",
            )
        self.assertEqual(r2.status_code, 200, r2.content)
        data2 = r2.json()
        self.assertTrue(data2["all_ready"])
        self.assertEqual(data2["missing_gb_files"], [])
        self.assertEqual(data2["std_statuses"][0]["status"], "parsed_via_dify2")
        task.refresh_from_db()
        self.assertEqual(task.indicator_bundle_json.get("missing_gb_files"), [])


@unittest.skipUnless(_mysql_available(), "requires MySQL")
@override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
class NationalIndicatorReviewHttpTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not _v1sql_national_tables_ready():
            raise unittest.SkipTest("national_standard_* tables unavailable")

    def setUp(self):
        _cleanup_ensure_test_std()

    def tearDown(self):
        _cleanup_ensure_test_std()

    def test_get_and_review_national_indicators(self):
        indexes_json = json.dumps(
            [
                {
                    "index_name": "感官和理化指标",
                    "index_type": "其他",
                    "index_content": {"外观": "均匀液体"},
                }
            ],
            ensure_ascii=False,
        )
        _seed_ensure_test_std(with_indicator=True)
        with connection.cursor() as c:
            c.execute(
                "UPDATE regulation_standard_indicator SET specific_indicator_value = %s, manual_review_status = 'pending' WHERE subject_code = %s AND catalog_std_type_no = '00'",
                [indexes_json, _ENSURE_TEST_STD],
            )
        task = ComplianceEvaluationTask.objects.create(current_step=4)
        get_url = f"/api/v1/compliance/evaluations/{task.id}/step/4/national-indicators?std_code={_ENSURE_TEST_STD}"
        r_get = self.client.get(get_url)
        self.assertEqual(r_get.status_code, 200, r_get.content)
        data = r_get.json()
        self.assertEqual(data["std_code"], _ENSURE_TEST_STD)
        self.assertEqual(len(data["rows"]), 1)
        self.assertEqual(data["rows"][0]["manual_review_status"], "pending")

        r_review = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/national-indicators/review",
            data={"std_code": _ENSURE_TEST_STD, "manual_review_status": "approved"},
            content_type="application/json",
        )
        self.assertEqual(r_review.status_code, 200, r_review.content)
        self.assertEqual(r_review.json()["manual_review_status"], "approved")

        r_ensure = self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/indicators/ensure",
            data={
                "compare_pairs": [{"publication_std_code": _ENSURE_TEST_STD, "latest_std_code": _ENSURE_TEST_STD}],
                "target_std_codes": [_ENSURE_TEST_STD],
            },
            content_type="application/json",
        )
        self.assertEqual(r_ensure.status_code, 200, r_ensure.content)
        rows = r_ensure.json()["national_by_std_code"][_ENSURE_TEST_STD]
        self.assertEqual(rows[0]["manual_review_status"], "approved")
        self.assertTrue(r_ensure.json()["all_ready"])

    def test_put_save_keeps_pending_then_review(self):
        original = json.dumps(
            [{"index_name": "外观", "index_type": "定性", "index_content": "原内容"}],
            ensure_ascii=False,
        )
        edited = json.dumps(
            [{"index_name": "外观", "index_type": "定性", "index_content": "编辑后内容"}],
            ensure_ascii=False,
        )
        _seed_ensure_test_std(with_indicator=True)
        with connection.cursor() as c:
            c.execute(
                "UPDATE regulation_standard_indicator SET specific_indicator_value = %s, manual_review_status = 'pending' WHERE subject_code = %s AND catalog_std_type_no = '00'",
                [original, _ENSURE_TEST_STD],
            )
        task = ComplianceEvaluationTask.objects.create(current_step=4)
        put_url = f"/api/v1/compliance/evaluations/{task.id}/step/4/national-indicators"
        r_put = self.client.put(
            put_url,
            data={"std_code": _ENSURE_TEST_STD, "specific_indicator_value": edited},
            content_type="application/json",
        )
        self.assertEqual(r_put.status_code, 200, r_put.content)
        self.assertEqual(r_put.json()["manual_review_status"], "pending")
        self.assertIn("编辑后内容", r_put.json()["specific_indicator_value"])

        r_get = self.client.get(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/national-indicators?std_code={_ENSURE_TEST_STD}",
        )
        self.assertEqual(r_get.status_code, 200, r_get.content)
        saved = json.loads(r_get.json()["rows"][0]["specific_indicator_value"])
        self.assertEqual(saved[0]["index_content"], "编辑后内容")

        self.client.post(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/national-indicators/review",
            data={"std_code": _ENSURE_TEST_STD, "manual_review_status": "approved"},
            content_type="application/json",
        )
        r_get2 = self.client.get(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/national-indicators?std_code={_ENSURE_TEST_STD}",
        )
        self.assertEqual(r_get2.json()["rows"][0]["manual_review_status"], "approved")
        saved2 = json.loads(r_get2.json()["rows"][0]["specific_indicator_value"])
        self.assertEqual(saved2[0]["index_content"], "编辑后内容")

    def test_put_invalid_json_422(self):
        _seed_ensure_test_std(with_indicator=True)
        task = ComplianceEvaluationTask.objects.create(current_step=4)
        r = self.client.put(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/national-indicators",
            data={"std_code": _ENSURE_TEST_STD, "specific_indicator_value": "not-json"},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 422, r.content)

    def test_get_national_indicators_404_when_missing(self):
        task = ComplianceEvaluationTask.objects.create(current_step=4)
        r = self.client.get(
            f"/api/v1/compliance/evaluations/{task.id}/step/4/national-indicators?std_code=NO-SUCH-STD",
        )
        self.assertEqual(r.status_code, 404, r.content)
