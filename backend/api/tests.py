import json
from pathlib import Path

from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Pedigree, TagPreset

FULL_PEDIGREE = {
    "individuals": [
        {
            "id": "f", "sex": "male", "affected": False, "deceased": True,
            "carrier": False, "proband": False, "sibOrder": 0,
            "name": "John Smith", "dob": "1950-03-01", "dod": "2022", "age": "d. 72",
            "notes": "Line one\nLine two ", "hpoTerms": ["HP:0001250"],
            "tags": ["t1", "t2"], "carrierTags": ["t3"], "onset": "40s", "tagOnset": {"t1": "52y"},
        },
        {
            "id": "m", "sex": "female", "affected": False, "deceased": False,
            "carrier": True, "proband": False, "consultand": True, "familyHistoryUnknown": True, "sibOrder": 0, "name": "Jane Smith",
            "genderIdentity": "nonbinary",
        },
        {
            "id": "c1", "sex": "unknown", "affected": True, "deceased": False,
            "carrier": False, "proband": True, "sibOrder": 1, "name": "", "adopted": "in",
        },
        {
            "id": "w2", "sex": "female", "affected": False, "sibOrder": 0, "presymptomatic": True,
            "evaluations": [
                {"result": "positive", "detail": "BRCA1 c.5266dupC", "documented": True},
                {"result": "uninformative"}, {},
            ],
        },
        {"id": "c2", "sex": "unknown", "affected": False, "sibOrder": 2},
        {"id": "c2", "sex": "unknown", "affected": False, "sibOrder": 2,
         "carriedBy": "s", "socialParents": ["w2"]},
        {"id": "d", "sex": "male", "affected": False, "sibOrder": 0, "reproductiveRole": "donor"},
        {"id": "s", "sex": "female", "affected": False, "sibOrder": 0, "reproductiveRole": "surrogate"},
    ],
    "partnerships": [
        {"id": "p1", "individual1": "f", "individual2": "m", "consanguineous": True,
         "leftPartner": "m",
         "consanguinityLabel": "third cousins",
         "twins": [{"members": ["c1", "c2"], "zygosity": "monozygotic"}]},
        {"id": "p2", "individual1": "f", "individual2": "w2", "childless": "infertility",
         "childlessReason": "azoospermia", "ended": True},
        {"id": "p3", "individual1": "m", "individual2": "d", "donorConception": True},
    ],
    "parentOf": {"p1": ["c1", "c2"]},
    "siblingOrder": {"mode": "manual", "affectedFirst": True},
    "pinnedPositions": {"c1": {"x": 12.5, "y": -40.0}},
    "canvasSettings": {"nodesMoveable": True, "snapToGrid": True, "snapGridSize": 20,
                       "nameLabels": "truncate", "layoutWidth": "relaxed",
                       "relationshipLabels": True, "symbolsShow": "sex", "notation": "nsgc2008",
                       "tagFills": "monochrome"},
    "unlockedIndividuals": ["f"],
    "tags": [
        {"id": "t1", "label": "Tremor", "color": "#000000", "style": "quadrant", "fill": "diagonal"},
        {"id": "t2", "label": "Sequenced", "color": "#1f77b4", "style": "dot", "abbrev": "WGS"},
    ],
    "chartTitle": "Smith family",
    "clinicalDetails": {"referralReason": "Breast cancer", "recordedOn": "2026-11-12"},
    "filters": {"affectedOnly": True},
}


class PedigreeRoundTripTests(APITestCase):
    def test_create_and_update_preserve_every_field(self):
        resp = self.client.post(
            "/api/pedigrees/", {"title": "t", "data": FULL_PEDIGREE}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        pk = resp.data["id"]
        self.assertEqual(Pedigree.objects.get(pk=pk).data, FULL_PEDIGREE)

        resp = self.client.patch(
            f"/api/pedigrees/{pk}/", {"data": FULL_PEDIGREE}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(Pedigree.objects.get(pk=pk).data, FULL_PEDIGREE)

        resp = self.client.get(f"/api/pedigrees/{pk}/")
        self.assertEqual(resp.json()["data"], FULL_PEDIGREE)

    def test_minimal_legacy_pedigree_still_accepted(self):
        data = {
            "individuals": [{"id": "a", "sex": "male", "affected": False}],
            "partnerships": [],
            "parentOf": {},
        }
        resp = self.client.post("/api/pedigrees/", {"data": data}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        saved = Pedigree.objects.get(pk=resp.data["id"]).data
        self.assertNotIn("siblingOrder", saved)
        self.assertNotIn("name", saved["individuals"][0])


    def test_life_status_and_unknown_fields_preserved_exactly(self):
        data = {
            "individuals": [
                {"id": "a", "sex": "unknown", "affected": False, "sibOrder": 0,
                 "lifeStatus": "miscarriage", "futureField": {"nested": [1, 2]}},
                {"id": "b", "sex": "male", "affected": False, "sibOrder": 0,
                 "deceased": None, "x-ext": "kept"},
                {"id": "c", "sex": "female", "affected": True, "sibOrder": 1,
                 "lifeStatus": "pregnancy", "carrier": True},
            ],
            "partnerships": [
                {"id": "p1", "individual1": "b", "individual2": "c", "since": "2001"},
            ],
            "parentOf": {},
            "siblingOrder": {"mode": "insertion", "affectedFirst": False},
            "newTopLevel": {"anything": True},
        }
        resp = self.client.post("/api/pedigrees/", {"title": "x", "data": data}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        pk = resp.data["id"]
        self.assertEqual(resp.json()["data"], data)
        self.assertEqual(Pedigree.objects.get(pk=pk).data, data)

        resp = self.client.put(f"/api/pedigrees/{pk}/", {"title": "x", "data": data}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self.client.get(f"/api/pedigrees/{pk}/").json()["data"], data)

    def test_no_defaults_injected(self):
        data = {
            "individuals": [{"id": "a", "sex": "male", "affected": False, "sibOrder": 0}],
            "partnerships": [],
            "parentOf": {},
        }
        resp = self.client.post("/api/pedigrees/", {"data": data}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        saved = Pedigree.objects.get(pk=resp.data["id"]).data
        self.assertEqual(saved, data)

    def test_known_fields_still_validated(self):
        base = {"individuals": [], "partnerships": [], "parentOf": {}}
        bad_cases = [
            {**base, "individuals": [{"id": "a", "sex": "male", "affected": False,
                                      "lifeStatus": "reborn"}]},
            {**base, "individuals": [{"id": "a", "sex": "robot", "affected": False}]},
            {**base, "individuals": [{"id": "a", "sex": "male", "affected": False,
                                      "evaluations": [{"result": "maybe"}]}]},
            {**base, "individuals": [{"id": "a", "sex": "male", "affected": False,
                                      "genderIdentity": "robot"}]},
            {**base, "canvasSettings": {"nodesMoveable": False, "snapToGrid": False,
                                        "snapGridSize": 20, "symbolsShow": "both"}},
            {**base, "individuals": [{"id": "a", "sex": "male"}]},
            {**base, "partnerships": [{"id": "p", "individual1": "a"}]},
            {"individuals": [], "partnerships": []},
            {**base, "tags": [{"id": "t", "label": "x", "color": "#000", "style": "stripe"}]},
            {**base, "tags": [{"id": "t", "label": "x", "color": "#000", "style": "quadrant", "fill": "plaid"}]},
            {**base, "canvasSettings": {"nodesMoveable": False, "snapToGrid": False, "snapGridSize": 20,
                                        "tagFills": "sepia"}},
            {**base, "canvasSettings": {"nodesMoveable": False, "snapToGrid": False,
                                        "snapGridSize": 20, "nameLabels": "widen"}},
            {**base, "canvasSettings": {"nodesMoveable": False, "snapToGrid": False,
                                        "snapGridSize": 20, "layoutWidth": "wide"}},
            {**base, "filters": {"affectedOnly": "maybe"}},
            {**base, "individuals": [{"id": "a", "sex": "male", "affected": False,
                                      "reproductiveRole": "father"}]},
            {**base, "individuals": [{"id": "a", "sex": "male", "affected": False,
                                      "socialParents": "b"}]},
            [],
        ]
        for data in bad_cases:
            resp = self.client.post("/api/pedigrees/", {"data": data}, format="json")
            self.assertEqual(resp.status_code, 400, data)



class SerializerMatchesSchemaTests(APITestCase):
    """The validating serializers must know every field in the JSON schema
    (which a frontend test keeps in step with types.ts), with the same
    required fields, or a new field goes unvalidated."""

    def test_fields_and_required_match_schema(self):
        from . import serializers as s

        schema_path = Path(__file__).resolve().parents[2] / "docs" / "pedigree-json-schema.json"
        defs = json.loads(schema_path.read_text())["$defs"]
        pairs = {
            "Pedigree": s.PedigreeDataSerializer,
            "Individual": s.IndividualSerializer,
            "Partnership": s.PartnershipSerializer,
            "Tag": s.TagSerializer,
            "SiblingOrderSettings": s.SiblingOrderSettingsSerializer,
            "CanvasSettings": s.CanvasSettingsSerializer,
            "ClinicalDetails": s.ClinicalDetailsSerializer,
            "Evaluation": s.EvaluationSerializer,
            "ViewFilters": s.ViewFiltersSerializer,
        }
        # sibOrder is required by the format but optional here so that
        # pedigrees saved before it existed still load.
        lenient = {("Individual", "sibOrder")}
        for name, cls in pairs.items():
            fields = cls().fields
            self.assertEqual(set(fields), set(defs[name]["properties"]), name)
            required = {k for k, f in fields.items() if f.required}
            expected = {k for k in defs[name].get("required", []) if (name, k) not in lenient}
            self.assertEqual(required, expected, name)


class TagPresetTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user("alice", password="pw12345678")
        self.bob = User.objects.create_user("bob", password="pw12345678")
        TagPreset.objects.create(owner=self.bob, label="Bob's", color="#000", style="dot")

    def test_requires_auth(self):
        self.assertEqual(self.client.get("/api/tag-presets/").status_code, 401)

    def test_create_list_delete_scoped_to_owner(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/tag-presets/",
            {"label": "Sequenced", "color": "#1f77b4", "style": "dot", "abbrev": "WGS"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        preset_id = resp.data["id"]

        resp = self.client.get("/api/tag-presets/")
        self.assertEqual([p["label"] for p in resp.json()], ["Sequenced"])

        resp = self.client.delete(f"/api/tag-presets/{preset_id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(TagPreset.objects.filter(owner=self.alice).count(), 0)
        self.assertEqual(TagPreset.objects.filter(owner=self.bob).count(), 1)

    def test_rejects_unknown_style(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/tag-presets/", {"label": "x", "color": "#000", "style": "stripe"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)


class AgentTokenCommandTests(APITestCase):
    def _mint(self):
        import json
        from io import StringIO
        from django.core.management import call_command

        out = StringIO()
        call_command("agent_token", stdout=out)
        return json.loads(out.getvalue())

    def test_creates_passwordless_agent_and_tokens_work(self):
        from django.contrib.auth import get_user_model

        tokens = self._mint()
        user = get_user_model().objects.get(username="claude_agent")
        self.assertFalse(user.has_usable_password())
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["username"], "claude_agent")
        # Second call reuses the same account.
        self._mint()
        self.assertEqual(get_user_model().objects.filter(username="claude_agent").count(), 1)

    def test_refuses_an_account_with_a_password(self):
        from django.contrib.auth import get_user_model
        from django.core.management.base import CommandError

        get_user_model().objects.create_user("claude_agent", password="hunter22")
        with self.assertRaises(CommandError):
            self._mint()


class HealthCheckTests(APITestCase):
    def test_health_is_public(self):
        # A request that came through the proxy: no token needed, no version.
        resp = self.client.get("/api/health/", HTTP_X_FORWARDED_PROTO="https")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json(), {"status": "ok", "database": "ok", "disk": "ok"})

    def test_version_only_for_a_caller_on_the_box(self):
        from peded.version import VERSION

        # deploy.sh: loopback, straight to Gunicorn, no proxy headers.
        body = self.client.get("/api/health/").json()
        self.assertEqual(body["version"], VERSION)
        # A git checkout reports its commit; an exported tree reports "unknown".
        self.assertTrue(VERSION == "unknown" or len(VERSION) == 40, VERSION)

        proxied = [
            {"HTTP_X_FORWARDED_PROTO": "https"},
            {"HTTP_X_FORWARDED_FOR": "203.0.113.5"},
            {"HTTP_X_REAL_IP": "203.0.113.5"},
            {"HTTP_FORWARDED": "for=203.0.113.5"},
            {"REMOTE_ADDR": "203.0.113.5"},
            {"REMOTE_ADDR": ""},
        ]
        for extra in proxied:
            with self.subTest(extra=extra):
                resp = self.client.get("/api/health/", **extra)
                self.assertEqual(resp.status_code, 200)
                self.assertNotIn("version", resp.json())
                self.assertNotIn(VERSION, resp.content.decode())

    def test_head_answers_like_get(self):
        # UptimeRobot's HTTP monitor sends HEAD by default.
        resp = self.client.head("/api/health/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content, b"")
        with override_settings(HEALTH_DISK_MIN_FREE_MB=10**12):
            with self.assertLogs("api.health", level="ERROR"):
                self.assertEqual(self.client.head("/api/health/").status_code, 503)

    def test_bad_token_does_not_break_health(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
        self.assertEqual(self.client.get("/api/health/").status_code, 200)

    def test_database_failure_is_503(self):
        from unittest.mock import patch

        with patch("api.health.connection") as conn:
            conn.cursor.side_effect = RuntimeError("down")
            with self.assertLogs("api.health", level="ERROR"):
                resp = self.client.get("/api/health/")
        self.assertEqual(resp.status_code, 503)
        body = resp.json()
        self.assertEqual(body["status"], "error")
        self.assertEqual(body["database"], "unavailable")
        self.assertEqual(body["disk"], "ok")
        self.assertNotIn("down", resp.content.decode())

    def test_low_disk_is_503(self):
        from collections import namedtuple
        from unittest.mock import patch

        Usage = namedtuple("Usage", "total used free")
        mb = 1024 * 1024

        def usage(free_mb):
            return Usage(100_000 * mb, (100_000 - free_mb) * mb, free_mb * mb)

        with override_settings(HEALTH_DISK_PATHS=["/", "/data"], HEALTH_DISK_MIN_FREE_MB=1024):
            # Every filesystem above the floor.
            with patch("api.health.shutil.disk_usage", return_value=usage(1024)):
                self.assertEqual(self.client.get("/api/health/").status_code, 200)

            # One of them below it. The figures are logged, not returned.
            free = {"/": usage(50_000), "/data": usage(1023)}
            with patch("api.health.shutil.disk_usage", side_effect=lambda p: free[p]):
                with self.assertLogs("api.health", level="ERROR") as logs:
                    resp = self.client.get("/api/health/")
            self.assertEqual(resp.status_code, 503)
            self.assertEqual(resp.json(), {
                "status": "error", "database": "ok", "disk": "low",
                "version": resp.json()["version"],
            })
            self.assertIn("/data has 1023 MB free", logs.output[0])
            self.assertNotIn("1023", resp.content.decode())

    def test_unmeasurable_disk_paths_do_not_fail_the_check(self):
        from unittest.mock import patch

        with override_settings(HEALTH_DISK_PATHS=["/no/such/path/pededit"]):
            self.assertEqual(self.client.get("/api/health/").status_code, 200)

        with override_settings(HEALTH_DISK_PATHS=["/"]):
            with patch("api.health.shutil.disk_usage", side_effect=PermissionError("denied")):
                with self.assertLogs("api.health", level="WARNING"):
                    resp = self.client.get("/api/health/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["disk"], "ok")

    def test_version_env_override(self):
        import os
        from unittest.mock import patch

        from peded.version import get_version

        with patch.dict(os.environ, {"PEDEDIT_VERSION": "v1.2.3"}):
            self.assertEqual(get_version(), "v1.2.3")


class UsageStatsCommandTests(APITestCase):
    def _stats(self, *args):
        from io import StringIO
        from django.core.management import call_command

        out = StringIO()
        call_command("usage_stats", "--json", *args, stdout=out)
        return json.loads(out.getvalue())

    def _pedigree(self, owner=None, created_days_ago=0, updated_days_ago=None):
        from datetime import timedelta
        from django.utils import timezone

        p = Pedigree.objects.create(owner=owner, data={})
        now = timezone.now()
        created = now - timedelta(days=created_days_ago)
        updated = now - timedelta(days=created_days_ago if updated_days_ago is None else updated_days_ago)
        # .update() skips auto_now, so the backdated times stick.
        Pedigree.objects.filter(pk=p.pk).update(created=created, updated=updated)
        return p

    def test_counts_signed_in_and_anonymous_separately(self):
        from datetime import timedelta
        from django.utils import timezone

        alice = User.objects.create_user("alice")
        bob = User.objects.create_user("bob")
        User.objects.filter(pk=bob.pk).update(date_joined=timezone.now() - timedelta(days=30))
        agent = User.objects.create_user("claude_agent")

        self._pedigree(alice)                                         # created this week
        self._pedigree(bob, created_days_ago=30, updated_days_ago=2)  # old, edited this week
        self._pedigree(bob, created_days_ago=30)                      # old, untouched
        self._pedigree(None)                                          # anon, created this week
        self._pedigree(None)
        self._pedigree(None, created_days_ago=20, updated_days_ago=1)
        self._pedigree(None, created_days_ago=20)
        self._pedigree(agent)                                         # ignored

        s = self._stats()
        self.assertEqual(s["days"], 7)
        self.assertEqual(s["users"], {"total": 2, "new": 1, "active": 2})
        self.assertEqual(s["pedigrees"]["signed_in"], {"total": 3, "created": 1, "edited": 1})
        self.assertEqual(s["pedigrees"]["anonymous"], {"total": 4, "created": 2, "edited": 1})

        s30 = self._stats("--days", "40")
        self.assertEqual(s30["pedigrees"]["signed_in"], {"total": 3, "created": 3, "edited": 0})

    def test_text_output(self):
        from io import StringIO
        from django.core.management import call_command

        self._pedigree(None)
        out = StringIO()
        call_command("usage_stats", stdout=out)
        text = out.getvalue()
        self.assertIn("last 7 days", text)
        self.assertIn("anonymous pedigrees", text)
