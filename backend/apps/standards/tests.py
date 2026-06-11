from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase, override_settings


class StandardsResolveLatestHttpTests(TestCase):
    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    def test_get_resolve_latest_empty_code(self):
        r = self.client.get("/api/v1/standards/resolve-latest", {"std_code": ""})
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data["resolution_path"], "empty")

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch(
        "apps.standards.services.reference_resolution.resolve_latest_for_code",
        return_value={
            "query_bz_id": "GB/T 191",
            "is_latest": True,
            "current_latest_id": "GB/T 191-2008",
            "current_latest_std_codes": ["GB/T 191-2008"],
            "pedigree_chain": "stub",
            "resolution_path": "pedigree_direct",
            "inferred_historical_std_code": None,
            "enterprise_as_of_year": None,
            "historical_full_std_code": "GB/T 191",
        },
    )
    def test_get_resolve_latest_ok(self, _mock):
        r = self.client.get("/api/v1/standards/resolve-latest", {"std_code": "GB/T 191"})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["current_latest_id"], "GB/T 191-2008")

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch(
        "apps.standards.services.reference_resolution.resolve_reference_for_parse_context",
        return_value={"query_bz_id": "GB 2762", "resolution_path": "pedigree_direct"},
    )
    def test_post_resolve_latest_batch(self, _mock):
        r = self.client.post(
            "/api/v1/standards/resolve-latest/batch",
            data={
                "items": [
                    {"referenced_std": "GB 2762", "qb_code": "Q/ABC 001-2020"},
                ]
            },
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        items = r.json()["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["referenced_std"], "GB 2762")

    @override_settings(COMPLIANCE_REQUIRE_MYSQL=False)
    @patch(
        "apps.standards.services.reference_resolution.fetch_national_standard_names_by_codes",
        return_value={"GB/T 191": "包装储运图示标志"},
    )
    def test_get_national_standard_names(self, _mock):
        r = self.client.get(
            "/api/v1/standards/national-standard-names",
            {"codes": "GB/T 191"},
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("GB/T 191", r.json()["names"])
