from django.test import SimpleTestCase, override_settings
from unittest.mock import MagicMock, patch

from apps.alerting.services.conclusion import compute_warning_task_conclusion
from apps.alerting.services.forward_warning import build_forward_warning
from apps.alerting.services.monitor_service import (
    ScanAlreadyRunningError,
    ScanControlError,
    SCAN_START_MARKER,
    abandon_zombie_runs,
    build_scan_queue,
    execute_monitor_run,
    request_pause_scan,
    start_full_scan,
)
from apps.alerting.services.monitor_status import NO_EVAL_RECORD, NOT_SCANNED
from apps.alerting.services.reverse_warning import build_reverse_warning


class WarningConclusionTests(SimpleTestCase):
    def test_need_attention_when_updated(self):
        rows = [{"row_conclusion": "updated"}, {"row_conclusion": "unchanged"}]
        conclusion, summary = compute_warning_task_conclusion(rows)
        self.assertEqual(conclusion, "need_attention")
        self.assertIn("不一致", summary or "")

    def test_all_ok_when_unchanged(self):
        rows = [{"row_conclusion": "unchanged"}, {"row_conclusion": "unchanged"}]
        conclusion, _ = compute_warning_task_conclusion(rows)
        self.assertEqual(conclusion, "all_ok")

    def test_empty_history(self):
        conclusion, _ = compute_warning_task_conclusion([])
        self.assertEqual(conclusion, "empty_history")


class ForwardWarningUnitTests(SimpleTestCase):
    @patch("apps.alerting.services.forward_warning.is_mysql", return_value=True)
    @patch("apps.alerting.services.forward_warning.require_mysql")
    @patch("apps.alerting.services.forward_warning.find_history_for_qb_code", return_value=None)
    def test_empty_history(self, _hist, _req, _mysql):
        out = build_forward_warning("Q/NEW 999-2026")
        self.assertEqual(out["task_conclusion"], "empty_history")
        self.assertEqual(out["compare_rows"], [])

    @patch("apps.alerting.services.forward_warning._subject_name_for_code", return_value="测试公司")
    @patch("apps.alerting.services.forward_warning.build_warning_compare_rows")
    @patch("apps.alerting.services.forward_warning.is_mysql", return_value=True)
    @patch("apps.alerting.services.forward_warning.require_mysql")
    @patch("apps.alerting.services.forward_warning.find_history_for_qb_code")
    def test_field_mapping_and_need_attention(self, mock_hist, _req, _mysql, mock_cmp, _name):
        mock_hist.return_value = MagicMock(
            eval_reference_rows=[
                {
                    "id": "1",
                    "referenced_std_code": "GB/T 1.1",
                    "full_std_at_publication": "GB/T 1.1-2020",
                    "eval_latest_std_primary": "GB/T 1.1-2020",
                    "compliance_assessable": True,
                }
            ],
            source_evaluations=[{"source_type": "compliance", "source_id": 42, "evaluated_at": "2025-01-01T00:00:00Z"}],
        )
        mock_cmp.return_value = [
            {
                "id": "1",
                "referenced_std_code": "GB/T 1.1",
                "full_std_at_publication": "GB/T 1.1-2020",
                "baseline_latest_std_primary": "GB/T 1.1-2020",
                "current_latest_std_primary": "GB/T 1.1-2024",
                "row_conclusion": "updated",
                "row_conclusion_label": "需更新",
            }
        ]
        out = build_forward_warning("Q/T 1-2020")
        self.assertEqual(out["task_conclusion"], "need_attention")
        row = out["compare_rows"][0]
        self.assertEqual(row["baseline_latest_std"], "GB/T 1.1-2020")
        self.assertEqual(row["current_latest_std"], "GB/T 1.1-2024")
        self.assertEqual(out["source_evaluations"][0]["job_id"], 42)


class WarningCompareUnitTests(SimpleTestCase):
    @patch("apps.alerting.services.warning_compare.get_baseline_map", return_value={})
    @patch("apps.alerting.services.warning_compare.resolve_latest_for_code")
    def test_uses_eval_snapshot_not_qb_gate(self, mock_latest, _baseline):
        from apps.alerting.services.warning_compare import build_warning_compare_rows

        mock_latest.return_value = {"current_latest_id": "GB/T 1.1-2024", "pedigree_chain": "ok"}
        rows = build_warning_compare_rows(
            [
                {
                    "id": "1",
                    "referenced_std_code": "GB/T 1.1",
                    "full_std_at_publication": "GB/T 1.1-2020",
                    "eval_latest_std_primary": "GB/T 1.1-2020",
                    "compliance_assessable": True,
                }
            ],
            "CPJ.207.003-2024",
        )
        self.assertEqual(rows[0]["full_std_at_publication"], "GB/T 1.1-2020")
        self.assertEqual(rows[0]["baseline_latest_std_primary"], "GB/T 1.1-2020")
        self.assertEqual(rows[0]["current_latest_std_primary"], "GB/T 1.1-2024")
        self.assertEqual(rows[0]["row_conclusion"], "updated")
        mock_latest.assert_called_once()


class ForwardWarningHttpTests(SimpleTestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.alerting.api.warnings_compat.build_forward_warning")
    def test_forward_by_qb_missing_param(self, _mock):
        r = self.client.get("/api/warnings/forward-by-qb/")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["code"], 400)

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.alerting.api.warnings_compat.build_forward_warning")
    def test_forward_by_qb_success(self, mock_fwd):
        mock_fwd.return_value = {
            "subject_code": "Q/T 1",
            "subject_name": None,
            "task_conclusion": "all_ok",
            "task_summary": "ok",
            "compare_rows": [],
            "source_evaluations": [],
        }
        r = self.client.get("/api/warnings/forward-by-qb/", {"subject_code": "Q/T 1"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["code"], 200)
        self.assertEqual(r.json()["data"]["task_conclusion"], "all_ok")

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.alerting.api.warnings_compat.build_forward_warning")
    def test_monitor_detail_matches_forward(self, mock_fwd):
        payload = {
            "subject_code": "Q/T 1",
            "task_conclusion": "all_ok",
            "compare_rows": [{"id": "1"}],
            "source_evaluations": [],
        }
        mock_fwd.return_value = payload
        r_a = self.client.get("/api/warnings/forward-by-qb/", {"subject_code": "Q/T 1"})
        r_g = self.client.get("/api/warnings/monitor/enterprises/detail/", {"subject_code": "Q/T 1"})
        self.assertEqual(r_a.json()["data"], r_g.json()["data"])


class ReverseWarningTests(SimpleTestCase):
    @patch("apps.alerting.services.reverse_warning._fetch_std_status", return_value=None)
    @patch("apps.alerting.services.reverse_warning.find_enterprises_referencing_std", return_value=[])
    @patch("apps.alerting.services.reverse_warning.resolve_latest_for_code")
    @patch("apps.alerting.services.reverse_warning.require_mysql")
    def test_gb_no_update(self, _req, mock_res, _find, _status):
        mock_res.return_value = {"current_latest_id": "GB/T 1.1-2009"}
        out = build_reverse_warning("GB/T 1.1-2009")
        self.assertFalse(out["gb_novelty"]["gb_updated"])
        self.assertEqual(out["task_conclusion"], "all_ok")

    @patch("apps.alerting.services.reverse_warning._fetch_std_status", return_value=None)
    @patch("apps.alerting.services.reverse_warning.build_forward_warning")
    @patch("apps.alerting.services.reverse_warning.find_enterprises_referencing_std")
    @patch("apps.alerting.services.reverse_warning.resolve_latest_for_code")
    @patch("apps.alerting.services.reverse_warning.require_mysql")
    def test_gb_updated_enterprise_need_modify(self, _req, mock_res, mock_find, mock_fwd, _status):
        mock_res.return_value = {"current_latest_id": "GB/T 1.1-2020"}
        mock_find.return_value = [{"subject_code": "Q/ABC 001", "subject_name": "甲公司"}]
        mock_fwd.return_value = {
            "compare_rows": [
                {
                    "referenced_std_code": "GB/T 1.1-2009",
                    "row_conclusion": "updated",
                }
            ]
        }
        out = build_reverse_warning("GB/T 1.1-2009")
        self.assertTrue(out["gb_novelty"]["gb_updated"])
        self.assertEqual(out["task_conclusion"], "need_attention")
        self.assertTrue(out["affected_enterprises"][0]["enterprise_need_modify"])


class MonitorScanTests(SimpleTestCase):
    def _mock_run(self, *, queue=None, processed_count=0, status=None):
        from apps.alerting.models import WarningMonitorRun

        run_inst = MagicMock()
        run_inst.queue_json = queue or [{"subject_code": "Q/T 1", "phase": WarningMonitorRun.ScanPhase.NOT_SCANNED}]
        run_inst.processed_count = processed_count
        run_inst.status = status or WarningMonitorRun.Status.RUNNING
        run_inst.pause_requested = False
        run_inst.scan_phase = WarningMonitorRun.ScanPhase.NOT_SCANNED
        run_inst.current_subject_code = ""
        run_inst.total_evaluated = len(run_inst.queue_json)
        run_inst.refresh_from_db = MagicMock()
        return run_inst

    @patch("apps.alerting.services.monitor_service.purge_empty_history_snapshots")
    @patch("apps.alerting.services.monitor_service._scan_one_subject", return_value=(True, "need_attention"))
    @patch("apps.alerting.services.monitor_service.WarningMonitorRun.objects")
    def test_execute_monitor_run_updates_snapshot(self, mock_run_mgr, mock_scan, _purge):
        from apps.alerting.models import WarningMonitorRun

        run_inst = self._mock_run()
        mock_run_mgr.filter.return_value.first.return_value = run_inst
        result = execute_monitor_run(1)
        self.assertIn("processed=1", result)
        mock_scan.assert_called_once_with("Q/T 1")
        self.assertEqual(run_inst.status, WarningMonitorRun.Status.COMPLETED)

    @patch("apps.alerting.services.monitor_service.purge_empty_history_snapshots")
    @patch("apps.alerting.services.monitor_service._scan_one_subject")
    @patch("apps.alerting.services.monitor_service.WarningMonitorRun.objects")
    def test_execute_writes_start_marker_before_loop(self, mock_run_mgr, mock_scan, _purge):
        from apps.alerting.models import WarningMonitorRun

        run_inst = self._mock_run()
        mock_run_mgr.filter.return_value.first.return_value = run_inst
        mock_scan.return_value = (True, "all_ok")

        codes_at_save: list[str] = []
        real_save = run_inst.save

        def track_save(*args, **kwargs):
            codes_at_save.append(run_inst.current_subject_code)
            return real_save(*args, **kwargs)

        run_inst.save = MagicMock(side_effect=track_save)

        execute_monitor_run(1)

        self.assertIn(SCAN_START_MARKER, codes_at_save)
        self.assertEqual(codes_at_save[0], SCAN_START_MARKER)
        self.assertEqual(run_inst.scan_phase, WarningMonitorRun.ScanPhase.IDLE)

    @patch("apps.alerting.services.monitor_service.purge_empty_history_snapshots")
    @patch("apps.alerting.services.monitor_service._scan_one_subject")
    @patch("apps.alerting.services.monitor_service.WarningMonitorRun.objects")
    def test_execute_monitor_run_pause_mid_queue(self, mock_run_mgr, mock_scan, _purge):
        from apps.alerting.models import WarningMonitorRun

        run_inst = self._mock_run(
            queue=[
                {"subject_code": "Q/A 1", "phase": WarningMonitorRun.ScanPhase.NOT_SCANNED},
                {"subject_code": "Q/B 2", "phase": WarningMonitorRun.ScanPhase.NOT_SCANNED},
            ],
        )

        def refresh_side_effect(*_a, **_k):
            run_inst.pause_requested = run_inst.processed_count >= 1

        run_inst.refresh_from_db.side_effect = refresh_side_effect
        mock_run_mgr.filter.return_value.first.return_value = run_inst
        mock_scan.return_value = (True, "all_ok")

        result = execute_monitor_run(1)
        self.assertTrue(result.startswith("paused"))
        self.assertEqual(run_inst.status, WarningMonitorRun.Status.PAUSED)
        self.assertEqual(run_inst.processed_count, 1)

    @patch("apps.alerting.services.monitor_service.build_scan_queue")
    @patch("apps.alerting.tasks.process_warning_monitor_run.delay")
    @patch("apps.alerting.services.monitor_service.has_active_scan", return_value=False)
    @patch("apps.alerting.services.monitor_service.abandon_stale_running_runs")
    @patch("apps.alerting.services.monitor_service.WarningMonitorRun.objects")
    def test_start_full_scan_enqueues_celery(self, mock_run_mgr, _abandon, _active, mock_delay, mock_queue):
        mock_queue.return_value = [
            {"subject_code": "Q/T 1", "phase": "not_scanned"},
            {"subject_code": "Q/T 2", "phase": "all_ok"},
        ]
        run_inst = MagicMock()
        run_inst.id = 99
        mock_run_mgr.create.return_value = run_inst
        result = start_full_scan()
        self.assertTrue(result["success"])
        self.assertEqual(result["total_count"], 2)
        self.assertEqual(result["job_id"], "99")
        mock_delay.assert_called_once_with(99)

    @patch("apps.alerting.services.monitor_service.reconcile_stuck_monitor_runs")
    @patch("apps.alerting.services.monitor_service.has_active_scan", return_value=True)
    def test_start_full_scan_rejects_concurrent(self, _active, _reconcile):
        with self.assertRaises(ScanAlreadyRunningError):
            start_full_scan()

    @patch("apps.alerting.services.monitor_service.WarningMonitorRun.objects")
    def test_request_pause_scan_with_progress(self, mock_run_mgr):
        from apps.alerting.models import WarningMonitorRun

        run_inst = MagicMock()
        run_inst.status = WarningMonitorRun.Status.RUNNING
        run_inst.processed_count = 3
        mock_run_mgr.filter.return_value.first.return_value = run_inst
        out = request_pause_scan(5)
        self.assertTrue(out["success"])
        self.assertTrue(run_inst.pause_requested)

    @patch("apps.alerting.services.monitor_service.WarningMonitorRun.objects")
    def test_request_pause_scan_immediate_when_no_progress(self, mock_run_mgr):
        from apps.alerting.models import WarningMonitorRun

        run_inst = MagicMock()
        run_inst.status = WarningMonitorRun.Status.RUNNING
        run_inst.processed_count = 0
        mock_run_mgr.filter.return_value.first.return_value = run_inst
        out = request_pause_scan(5)
        self.assertEqual(out["message"], "巡检已暂停")
        self.assertEqual(run_inst.status, WarningMonitorRun.Status.PAUSED)
        self.assertFalse(run_inst.pause_requested)

    @patch("apps.alerting.services.monitor_service.WarningMonitorRun.objects")
    def test_abandon_zombie_runs(self, mock_run_mgr):
        mock_qs = MagicMock()
        mock_qs.count.return_value = 2
        mock_qs.update.return_value = 2
        mock_run_mgr.filter.return_value = mock_qs
        n = abandon_zombie_runs(max_age_minutes=10)
        self.assertEqual(n, 2)
        mock_qs.update.assert_called_once()

    @patch("apps.alerting.services.monitor_service._build_monitor_rows")
    def test_build_scan_queue_order(self, mock_rows):
        from apps.alerting.models import WarningMonitorRun
        from apps.alerting.services.monitor_status import ALL_OK, NOT_SCANNED

        mock_rows.return_value = [
            {"subject_code": "Q/Z 1", "task_conclusion": ALL_OK},
            {"subject_code": "Q/A 1", "task_conclusion": NOT_SCANNED},
            {"subject_code": "Q/M 1", "task_conclusion": "need_attention"},
        ]
        q = build_scan_queue()
        self.assertEqual(len(q), 2)
        self.assertEqual(q[0]["qb_code"], "Q/A 1")
        self.assertEqual(q[0]["phase"], WarningMonitorRun.ScanPhase.NOT_SCANNED)
        self.assertEqual(q[1]["qb_code"], "Q/Z 1")
        self.assertEqual(q[1]["phase"], WarningMonitorRun.ScanPhase.ALL_OK)

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.alerting.api.warnings_compat.start_full_scan")
    def test_warnings_scan_http_empty_body(self, mock_start):
        mock_start.return_value = {
            "success": True,
            "message": "全库巡检已启动",
            "job_id": "42",
            "processed_count": 0,
        }
        r = self.client.post("/api/warnings/scan/")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["code"], 200)
        self.assertEqual(body["data"]["job_id"], "42")
        self.assertEqual(body["data"]["message"], "全库巡检已启动")

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.alerting.api.warnings_compat.start_full_scan")
    def test_warnings_scan_http_json_body(self, mock_start):
        mock_start.return_value = {
            "success": True,
            "message": "全库巡检已启动",
            "job_id": "43",
            "processed_count": 0,
        }
        r = self.client.post(
            "/api/warnings/scan/",
            data="{}",
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["data"]["job_id"], "43")

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.alerting.api.warnings_compat.start_full_scan")
    def test_warnings_scan_http_409(self, mock_start):
        mock_start.side_effect = ScanAlreadyRunningError("已有巡检任务进行中，请稍后再试")
        r = self.client.post("/api/warnings/scan/")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["code"], 409)
        self.assertIn("进行中", body["msg"])

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.alerting.api.warnings_compat.request_pause_scan")
    def test_warnings_scan_pause_http(self, mock_pause):
        mock_pause.return_value = {"success": True, "message": "暂停请求已提交", "job_id": "7"}
        r = self.client.post("/api/warnings/scan/7/pause/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["data"]["job_id"], "7")

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch("apps.alerting.api.warnings_compat.get_monitor_summary")
    def test_monitor_summary_http(self, mock_summary):
        mock_summary.return_value = {
            "last_scan_at": None,
            "total_evaluated": 1450,
            "need_attention_count": 2,
            "all_ok_count": 660,
            "no_eval_record_count": 47,
            "not_scanned_count": 741,
            "pending_count": 741,
            "active_scan": {
                "job_id": "28",
                "status": "running",
                "processed_count": 10,
                "total_count": 700,
                "not_scanned_count": 731,
            },
        }
        r = self.client.get("/api/warnings/monitor/summary/")
        self.assertEqual(r.status_code, 200)
        data = r.json()["data"]
        self.assertEqual(data["total_evaluated"], 1450)
        self.assertEqual(data["need_attention_count"], 2)
        self.assertEqual(data["no_eval_record_count"], 47)
        self.assertIn("active_scan", data)
        self.assertEqual(data["active_scan"]["processed_count"], 10)


class MonitorCatalogTests(SimpleTestCase):
    @patch("apps.alerting.services.monitor_service.build_reference_history_norm_set", return_value=set())
    @patch("apps.alerting.services.monitor_service.build_evaluated_enterprise_catalog")
    @patch("apps.alerting.services.monitor_service._snapshot_map")
    def test_list_marks_no_reference_as_no_eval_record(self, mock_snaps, mock_catalog, _refs):
        from apps.alerting.services.monitor_service import list_monitor_enterprises

        mock_catalog.return_value = [
            {"subject_code": "Q/A 001", "subject_name": "甲公司", "subject_norm": "Q/A 001"},
        ]
        mock_snaps.return_value = {}

        data = list_monitor_enterprises(page=1, page_size=20)
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["items"][0]["task_conclusion"], NO_EVAL_RECORD)

    @patch("apps.alerting.services.monitor_service.build_reference_history_norm_set", return_value={"Q/B 002"})
    @patch("apps.alerting.services.monitor_service.build_evaluated_enterprise_catalog")
    @patch("apps.alerting.services.monitor_service._snapshot_map")
    def test_list_includes_unscanned_evaluated_qb(self, mock_snaps, mock_catalog, _refs):
        from apps.alerting.services.monitor_service import list_monitor_enterprises

        mock_catalog.return_value = [
            {"subject_code": "Q/A 001", "subject_name": "甲公司", "subject_norm": "Q/A 001"},
            {"subject_code": "Q/B 002", "subject_name": "乙公司", "subject_norm": "Q/B 002"},
        ]
        mock_snaps.return_value = {}

        data = list_monitor_enterprises(page=1, page_size=20)
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["items"][0]["task_conclusion"], NO_EVAL_RECORD)
        self.assertEqual(data["items"][1]["task_conclusion"], NOT_SCANNED)

    @patch("apps.alerting.services.monitor_service._build_monitor_rows")
    @patch("apps.alerting.services.monitor_service.WarningMonitorRun.objects")
    def test_summary_total_splits_four_categories(self, mock_run_qs, mock_rows):
        from apps.alerting.services.monitor_service import get_monitor_summary

        mock_run_qs.filter.return_value.order_by.return_value.first.return_value = None
        mock_rows.return_value = (
            [{"task_conclusion": NO_EVAL_RECORD}] * 13
            + [{"task_conclusion": NOT_SCANNED}] * 775
            + [{"task_conclusion": "need_attention"}] * 2
            + [{"task_conclusion": "all_ok"}] * 500
            + [{"task_conclusion": "partial"}] * 160
        )
        summary = get_monitor_summary()
        self.assertEqual(summary["total_evaluated"], 1450)
        self.assertEqual(summary["no_eval_record_count"], 13)
        self.assertEqual(summary["not_scanned_count"], 775)
        self.assertEqual(summary["need_attention_count"], 2)
        self.assertEqual(summary["all_ok_count"], 660)
