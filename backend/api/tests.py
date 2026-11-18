import json
from pathlib import Path

from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Pedigree, TagPreset
from .serializers import structure_errors

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
        {"id": "c3", "sex": "unknown", "affected": False, "sibOrder": 2,
         "carriedBy": "s", "socialParents": ["w2"]},
        {"id": "d", "sex": "male", "affected": False, "sibOrder": 0, "reproductiveRole": "donor"},
        {"id": "s", "sex": "female", "affected": False, "sibOrder": 0, "reproductiveRole": "surrogate"},
    ],
    "partnerships": [
        {"id": "p1", "individual1": "f", "individual2": "m", "consanguineous": True,
         "leftPartner": "m", "drawnBeside": "m",
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
                       "relationshipLabels": True, "showCoefficients": True, "symbolsShow": "sex", "notation": "nsgc2008",
                       "tagFills": "monochrome"},
    "unlockedIndividuals": ["f"],
    "tags": [
        {"id": "t1", "label": "Tremor", "color": "#000000", "style": "quadrant", "fill": "diagonal"},
        {"id": "t3", "label": "Cohort", "color": "#2ca02c", "style": "quadrant", "kind": "trait"},
        {"id": "t2", "label": "Sequenced", "color": "#1f77b4", "style": "dot", "abbrev": "WGS"},
    ],
    "chartTitle": "Smith family",
    "clinicalDetails": {"referralReason": "Breast cancer", "recordedOn": "2026-11-12"},
    "filters": {"affectedOnly": True, "affectedCondition": "t1", "bloodRelativesOnly": True, "side": "maternal"},
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
            {**base, "tags": [{"id": "t", "label": "x", "color": "#000", "style": "quadrant", "kind": "maybe"}]},
            {**base, "canvasSettings": {"nodesMoveable": False, "snapToGrid": False, "snapGridSize": 20,
                                        "tagFills": "sepia"}},
            {**base, "canvasSettings": {"nodesMoveable": False, "snapToGrid": False,
                                        "snapGridSize": 20, "nameLabels": "widen"}},
            {**base, "canvasSettings": {"nodesMoveable": False, "snapToGrid": False,
                                        "snapGridSize": 20, "layoutWidth": "wide"}},
            {**base, "filters": {"affectedOnly": "maybe"}},
            {**base, "filters": {"side": "both"}},
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


class PedigreeAccessTests(APITestCase):
    """
    Who can read, change and delete a pedigree. The /your-data page states these
    rules to users (#178, `YourData` in frontend/src/pages/YourDataPage.tsx):
    change that text with any change here.
    """

    DATA = {"individuals": [], "partnerships": [], "parentOf": {}}

    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", email="owner@example.com")
        self.other = User.objects.create_user("other@example.com", email="other@example.com")

    def _create(self, user=None):
        self.client.force_authenticate(user)
        resp = self.client.post("/api/pedigrees/", {"title": "T", "data": self.DATA}, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        self.client.force_authenticate(None)
        return resp.data["id"]

    def test_anonymous_pedigree_is_open_to_anyone_with_the_link(self):
        pid = self._create()
        self.assertIsNone(Pedigree.objects.get(pk=pid).owner)
        url = f"/api/pedigrees/{pid}/"
        for user in (None, self.other):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, 200)
            self.assertEqual(self.client.patch(url, {"title": "Renamed"}, format="json").status_code, 200)
        # Opening or editing it signed in does not make it that user's.
        self.assertIsNone(Pedigree.objects.get(pk=pid).owner)

    def test_anonymous_pedigree_is_deleted_without_an_account(self):
        pid = self._create()
        self.assertEqual(self.client.delete(f"/api/pedigrees/{pid}/").status_code, 204)
        self.assertFalse(Pedigree.objects.filter(pk=pid).exists())
        self.assertEqual(self.client.get(f"/api/pedigrees/{pid}/").status_code, 404)

    def test_owned_pedigree_link_works_for_the_owner_only(self):
        pid = self._create(self.owner)
        url = f"/api/pedigrees/{pid}/"
        for user in (None, self.other):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, 404)
            self.assertEqual(self.client.patch(url, {"title": "Taken"}, format="json").status_code, 404)
            self.assertEqual(self.client.delete(url).status_code, 404)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(Pedigree.objects.filter(pk=pid).exists())

    def test_nothing_lists_anonymous_pedigrees(self):
        self._create()
        self.assertEqual(self.client.get("/api/pedigrees/").status_code, 401)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/pedigrees/").data, [])


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


class DeleteAccountTests(APITestCase):
    """DELETE /api/auth/me/ (#183), stated on /your-data ("Signing in", `YourData`)."""

    DATA = {"individuals": [], "partnerships": [], "parentOf": {}}

    def setUp(self):
        self.user = User.objects.create_user("leaver@example.com", email="leaver@example.com", first_name="Lee")
        self.other = User.objects.create_user("stayer@example.com", email="stayer@example.com")

    def _token(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken

        return RefreshToken.for_user(user)

    def test_deletes_the_account_its_pedigrees_and_library_only(self):
        mine = Pedigree.objects.create(owner=self.user, title="Mine", data=self.DATA)
        theirs = Pedigree.objects.create(owner=self.other, title="Theirs", data=self.DATA)
        anonymous = Pedigree.objects.create(owner=None, title="Anon", data=self.DATA)
        TagPreset.objects.create(owner=self.user, label="Mine", color="#000", style="dot")
        TagPreset.objects.create(owner=self.other, label="Theirs", color="#000", style="dot")

        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.delete("/api/auth/me/").status_code, 204)

        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertFalse(User.objects.filter(email="leaver@example.com").exists())
        self.assertFalse(Pedigree.objects.filter(pk=mine.pk).exists())
        self.assertFalse(TagPreset.objects.filter(label="Mine").exists())
        # Nobody else's data, and no anonymous pedigree, is touched.
        self.assertTrue(Pedigree.objects.filter(pk=theirs.pk).exists())
        self.assertTrue(Pedigree.objects.filter(pk=anonymous.pk).exists())
        self.assertTrue(TagPreset.objects.filter(label="Theirs").exists())

    def test_needs_sign_in(self):
        self.assertEqual(self.client.delete("/api/auth/me/").status_code, 401)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_tokens_stop_working(self):
        refresh = self._token(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.assertEqual(self.client.delete("/api/auth/me/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        self.client.credentials()
        resp = self.client.post("/api/auth/token/refresh/", {"refresh": str(refresh)}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_signing_in_again_makes_a_new_empty_account(self):
        Pedigree.objects.create(owner=self.user, title="Mine", data=self.DATA)
        self.client.force_authenticate(self.user)
        self.client.delete("/api/auth/me/")
        again = User.objects.create_user("leaver@example.com", email="leaver@example.com")
        self.client.force_authenticate(again)
        self.assertEqual(self.client.get("/api/pedigrees/").data, [])

    def test_refuses_an_admin_account(self):
        admin = User.objects.create_user("admin@example.com", is_staff=True)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.delete("/api/auth/me/").status_code, 403)
        self.assertTrue(User.objects.filter(pk=admin.pk).exists())


class AgentTokenCommandTests(APITestCase):
    def _mint(self, *args):
        import json
        from io import StringIO
        from django.core.management import call_command

        out = StringIO()
        call_command("agent_token", *args, stdout=out)
        return json.loads(out.getvalue())

    def test_throwaway_agent_is_a_separate_account(self):
        from django.contrib.auth import get_user_model

        tokens = self._mint("--throwaway")
        self.assertEqual(tokens["username"], "claude_agent_throwaway")
        self.assertFalse(get_user_model().objects.filter(username="claude_agent").exists())
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.client.get("/api/auth/me/").json()["username"], "claude_agent_throwaway")

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
        throwaway = User.objects.create_user("claude_agent_throwaway")

        self._pedigree(alice)                                         # created this week
        self._pedigree(bob, created_days_ago=30, updated_days_ago=2)  # old, edited this week
        self._pedigree(bob, created_days_ago=30)                      # old, untouched
        self._pedigree(None)                                          # anon, created this week
        self._pedigree(None)
        self._pedigree(None, created_days_ago=20, updated_days_ago=1)
        self._pedigree(None, created_days_ago=20)
        self._pedigree(agent)                                         # ignored
        self._pedigree(throwaway)                                     # ignored

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


class PedigreeDataSetTests(APITestCase):
    """The shared test data set (#167, test-data/pedigrees/): the same files
    the frontend sweeps and the page checks read. manifest.json says what the
    server should do with each file's pedigree."""

    DATA_DIR = Path(__file__).resolve().parents[2] / "test-data" / "pedigrees"

    @classmethod
    def cases(cls):
        manifest = json.loads((cls.DATA_DIR / "manifest.json").read_text())
        for entry in manifest["files"]:
            if entry["server"] == "not-sent":
                continue
            doc = json.loads((cls.DATA_DIR / entry["file"]).read_text())
            # An envelope carries the pedigree; a bare document is the pedigree.
            data = doc["pedigree"] if "format" in doc or "pedigree" in doc else doc
            yield entry, data

    def test_every_valid_file_is_stored_unchanged(self):
        seen = 0
        for entry, data in self.cases():
            if entry["server"] != "accepted":
                continue
            seen += 1
            with self.subTest(entry["file"]):
                resp = self.client.post("/api/pedigrees/", {"title": entry["file"], "data": data}, format="json")
                self.assertEqual(resp.status_code, 201, resp.data)
                pk = resp.data["id"]
                self.assertEqual(self.client.get(f"/api/pedigrees/{pk}/").json()["data"], data)
                # A save of what was loaded (the editor's auto-save) keeps it too.
                resp = self.client.patch(f"/api/pedigrees/{pk}/", {"data": data}, format="json")
                self.assertEqual(resp.status_code, 200, resp.data)
                self.assertEqual(Pedigree.objects.get(pk=pk).data, data)
        self.assertGreater(seen, 40)

    def test_every_refused_file_is_refused(self):
        seen = 0
        for entry, data in self.cases():
            if entry["server"] != "refused":
                continue
            seen += 1
            with self.subTest(entry["file"]):
                resp = self.client.post("/api/pedigrees/", {"title": entry["file"], "data": data}, format="json")
                self.assertEqual(resp.status_code, 400, entry["file"])
        self.assertGreater(seen, 1)

    def test_broken_structure_is_refused_on_create_with_the_path(self):
        """What the JSON importer refuses for its structure (an id that does
        not exist, a cycle), the server refuses on create, naming the path so
        a caller can fix its JSON (#201). The editor cannot lay these out."""
        expected = {
            "refused/duplicate-id.json": "individuals[",
            "refused/unknown-individual.json": "partnerships[",
            "refused/unknown-partnership.json": 'parentOf["',
            "refused/self-partnership.json": "with itself",
            "refused/child-of-own-partnership.json": "child of its own partnership",
            "refused/two-sets-of-parents.json": "child of two partnerships",
            "refused/circular-ancestry.json": "parentOf: circular ancestry",
        }
        seen = set()
        for entry, data in self.cases():
            if entry["file"] not in expected:
                continue
            seen.add(entry["file"])
            with self.subTest(entry["file"]):
                self.assertEqual(entry["server"], "refused")
                resp = self.client.post("/api/pedigrees/", {"title": "T", "data": data}, format="json")
                self.assertEqual(resp.status_code, 400)
                self.assertIn(expected[entry["file"]], " ".join(resp.json()["data"]))
        self.assertEqual(seen, set(expected))

    def test_broken_structure_is_stored_on_update(self):
        """The editor auto-saves the whole pedigree, so an update is never
        refused for its structure: a 400 there would lose every later edit
        (#170)."""
        broken = next(data for entry, data in self.cases() if entry["file"] == "refused/circular-ancestry.json")
        resp = self.client.post(
            "/api/pedigrees/", {"title": "T", "data": {"individuals": [], "partnerships": [], "parentOf": {}}}, format="json"
        )
        url = f"/api/pedigrees/{resp.data['id']}/"
        for method in (self.client.patch, self.client.put):
            with self.assertLogs("api.serializers", level="WARNING") as logs:
                resp = method(url, {"title": "T", "data": broken}, format="json")
            self.assertEqual(resp.status_code, 200, resp.content)
            self.assertEqual(Pedigree.objects.get(pk=resp.data["id"]).data, broken)
            # The log line carries a count, never the ids.
            self.assertEqual([r.getMessage() for r in logs.records], ["Pedigree updated with 1 structure errors"])

    def test_a_long_line_of_descent_is_not_a_cycle(self):
        n = 3000
        data = {
            "individuals": [{"id": f"i{k}", "sex": "male", "affected": False} for k in range(n)]
            + [{"id": f"s{k}", "sex": "female", "affected": False} for k in range(n)],
            "partnerships": [{"id": f"p{k}", "individual1": f"i{k}", "individual2": f"s{k}"} for k in range(n)],
            "parentOf": {f"p{k}": [f"i{k + 1}"] for k in range(n - 1)},
        }
        self.assertEqual(structure_errors(data), [])
        data["parentOf"][f"p{n - 1}"] = ["i0"]
        self.assertIn("circular ancestry", structure_errors(data)[0])

    def test_the_documented_api_example_is_accepted(self):
        """The curl example of docs/pedigree-json-format.md ("Creating a
        pedigree through the API") is posted as written."""
        doc = (self.DATA_DIR.parents[1] / "docs" / "pedigree-json-format.md").read_text()
        section = doc[doc.index("## Creating a pedigree through the API"):]
        body = section[section.index("-d '") + 4:]
        body = json.loads(body[:body.index("\n'")])
        self.assertEqual(body["data"]["canvasSettings"]["notation"], "nsgc2022")
        resp = self.client.post("/api/pedigrees/", body, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(self.client.get(f"/api/pedigrees/{resp.data['id']}/").json()["data"], body["data"])


class NoPasswordSignInTests(APITestCase):
    """Sign-in is by Google or GitHub only (#51): no registration and no
    token for a username and password, while a token can still be renewed."""

    def test_register_and_password_token_are_gone(self):
        User.objects.create_user("alice", password="pw12345678")
        for url, body in [
            ("/api/auth/register/", {"username": "new", "email": "n@example.com", "password": "pw12345678"}),
            ("/api/auth/token/", {"username": "alice", "password": "pw12345678"}),
            ("/api/auth/token/verify/", {"token": "x"}),
        ]:
            with self.subTest(url):
                self.assertEqual(self.client.post(url, body, format="json").status_code, 404)
        self.assertFalse(User.objects.filter(username="new").exists())

    def test_a_token_can_still_be_renewed(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        user = User.objects.create_user("bob")
        refresh = RefreshToken.for_user(user)
        resp = self.client.post("/api/auth/token/refresh/", {"refresh": str(refresh)}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
        self.assertEqual(self.client.get("/api/auth/me/").json()["username"], "bob")


HTTPS_ON = dict(
    DEBUG=False,
    ALLOWED_HOSTS=["testserver", "pededit.example"],
    SECRET_KEY="k9!vX2#pQ7mZ4@tR8wL1$eN6bH3^yU5&cJ0*fG-aS+dD=oI_test-only-key",
)


class HttpsSettingsTests(APITestCase):
    """The site config's "https" switch (#47, peded/security.py)."""

    def on(self, **kwargs):
        from peded.security import security_settings

        args = {"https": True, "hsts_seconds": 3600, "hsts_include_subdomains": True, **kwargs}
        return self.settings(**HTTPS_ON, **security_settings(**args))

    def deploy_check(self):
        from io import StringIO
        from django.core.management import call_command

        call_command("check", deploy=True, fail_level="WARNING", stdout=StringIO(), stderr=StringIO())

    def test_off_sets_nothing(self):
        from peded.security import security_settings

        self.assertEqual(security_settings(False, 3600, True), {})

    def test_on_passes_the_deploy_check_and_off_fails_it(self):
        from django.core.management.base import SystemCheckError

        with self.on():
            self.deploy_check()
        # Subdomains left out by an explicit config value: still passes.
        with self.on(hsts_include_subdomains=False):
            self.deploy_check()
        # What deploy.sh sees on a server that has not set "https": true.
        with self.settings(**HTTPS_ON):
            with self.assertRaises(SystemCheckError) as ctx:
                self.deploy_check()
        for check_id in ("security.W004", "security.W008", "security.W012", "security.W016"):
            self.assertIn(check_id, str(ctx.exception))

    def test_preload_is_never_set(self):
        from django.conf import settings
        from peded.security import security_settings

        on = security_settings(True, 31536000, True)
        self.assertNotIn("SECURE_HSTS_PRELOAD", on)
        self.assertEqual(on["SILENCED_SYSTEM_CHECKS"], ["security.W021"])
        with self.on():
            self.assertFalse(settings.SECURE_HSTS_PRELOAD)

    def test_redirect_follows_x_forwarded_proto(self):
        with self.on():
            # Plain HTTP reaching Django: sent to https.
            resp = self.client.get("/api/pedigrees/")
            self.assertEqual(resp.status_code, 301)
            self.assertEqual(resp["Location"], "https://testserver/api/pedigrees/")
            # What Nginx sends for an https request: served, no loop, HSTS on.
            resp = self.client.get("/api/pedigrees/", HTTP_X_FORWARDED_PROTO="https")
            self.assertEqual(resp.status_code, 401)
            self.assertEqual(resp["Strict-Transport-Security"], "max-age=3600; includeSubDomains")
            # Nginx saying the request was plain HTTP: redirected.
            resp = self.client.get("/api/pedigrees/", HTTP_X_FORWARDED_PROTO="http")
            self.assertEqual(resp.status_code, 301)

    def test_health_check_on_loopback_is_not_redirected(self):
        # deploy.sh asks http://127.0.0.1:8000/api/health/ with no proxy headers.
        with self.on():
            resp = self.client.get("/api/health/")
            self.assertEqual(resp.status_code, 200, resp.content)
            self.assertIn("version", resp.json())
            self.assertEqual(self.client.head("/api/health/").status_code, 200)

    def test_cookies_are_secure(self):
        with self.on():
            resp = self.client.get("/admin/login/", HTTP_X_FORWARDED_PROTO="https")
            self.assertEqual(resp.status_code, 200)
            self.assertTrue(resp.cookies["csrftoken"]["secure"])

    def test_development_is_left_alone(self):
        # No "https" in the config: no redirect, no HSTS, on plain HTTP.
        from peded.security import security_settings

        with self.settings(**security_settings(False, 3600, True)):
            resp = self.client.get("/api/pedigrees/")
            self.assertEqual(resp.status_code, 401)
            self.assertNotIn("Strict-Transport-Security", resp)


def _rates(**rates):
    import site_config

    return override_settings(THROTTLE_RATES={**site_config.DEFAULT_THROTTLE_RATES, **rates})


def _num_proxies(n):
    from django.conf import settings

    return override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "NUM_PROXIES": n})


@_num_proxies(1)
class ThrottleTests(APITestCase):
    """Rate limits (#47, api/throttling.py). A request counts only when it
    came through the proxy, so every limited request here carries
    X-Forwarded-For the way Nginx sends it."""

    CLIENT = {"HTTP_X_FORWARDED_FOR": "203.0.113.5", "HTTP_X_FORWARDED_PROTO": "https"}
    BODY = {"title": "T", "data": {"individuals": [], "partnerships": [], "parentOf": {}}}

    def setUp(self):
        from django.core.cache import caches

        caches["throttle"].clear()

    def create(self, **extra):
        return self.client.post("/api/pedigrees/", self.BODY, format="json", **{**self.CLIENT, **extra})

    @_rates(anon_create_burst="3/min")
    def test_anonymous_create_is_limited_per_address(self):
        for _ in range(3):
            self.assertEqual(self.create().status_code, 201)
        resp = self.create()
        self.assertEqual(resp.status_code, 429)
        self.assertIn("Retry-After", resp)
        self.assertEqual(Pedigree.objects.count(), 3)
        # Another address has its own bucket.
        self.assertEqual(self.create(HTTP_X_FORWARDED_FOR="198.51.100.7").status_code, 201)

    @_rates(anon_create_burst=None, anon_create_sustained="2/day")
    def test_the_daily_limit_applies_too_and_null_turns_a_scope_off(self):
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.create().status_code, 429)

    @_rates(anon_create_burst="2/min")
    def test_client_cannot_choose_its_bucket(self):
        # Nginx appends the address it saw; whatever the client put in front
        # of it is ignored with one proxy.
        codes = [
            self.create(HTTP_X_FORWARDED_FOR=f"{forged}, 203.0.113.5").status_code
            for forged in ("10.0.0.1", "10.0.0.2", "10.0.0.3")
        ]
        self.assertEqual(codes, [201, 201, 429])

    @_rates(anon_create_burst="2/min")
    def test_two_proxies_count_the_address_before_the_cdn(self):
        # Behind a CDN, Nginx appends the CDN's address, which changes from
        # request to request. With "num_proxies": 2 the client is counted.
        with _num_proxies(2):
            codes = [
                self.create(HTTP_X_FORWARDED_FOR=f"203.0.113.5, 172.68.0.{i}").status_code
                for i in range(3)
            ]
            self.assertEqual(codes, [201, 201, 429])
            self.assertEqual(self.create(HTTP_X_FORWARDED_FOR="198.51.100.7, 172.68.0.1").status_code, 201)

    @_rates(anon_create_burst="1/min", anon_create_sustained="1/day")
    def test_a_caller_on_the_box_is_not_limited(self):
        # Tests, local development, the page checks and the flows: no proxy.
        for _ in range(5):
            self.assertEqual(self.client.post("/api/pedigrees/", self.BODY, format="json").status_code, 201)

    @_rates(anon_create_burst="1/min", anon_create_sustained="1/day")
    def test_signed_in_create_is_not_limited(self):
        self.client.force_authenticate(User.objects.create_user("carol"))
        for _ in range(5):
            self.assertEqual(self.create().status_code, 201)

    @_rates(anon_create_burst="1/min", anon_create_sustained="1/day", auth_login="1/min", auth_refresh="1/min")
    def test_reading_and_saving_are_never_limited(self):
        pid = self.create().json()["id"]
        for i in range(30):
            resp = self.client.patch(f"/api/pedigrees/{pid}/", {"title": f"T{i}"}, format="json", **self.CLIENT)
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(self.client.get(f"/api/pedigrees/{pid}/", **self.CLIENT).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/pedigrees/{pid}/", **self.CLIENT).status_code, 204)

    @_rates()
    def test_a_normal_session_stays_under_the_default_rates(self):
        # A morning's work from one address: a handful of new pedigrees, each
        # auto-saved many times, a sign-in and its token refreshes.
        from rest_framework_simplejwt.tokens import RefreshToken

        for _ in range(10):
            resp = self.create()
            self.assertEqual(resp.status_code, 201)
            pid = resp.json()["id"]
            for i in range(20):
                resp = self.client.patch(f"/api/pedigrees/{pid}/", {"title": f"T{i}"}, format="json", **self.CLIENT)
                self.assertEqual(resp.status_code, 200)
        refresh = str(RefreshToken.for_user(User.objects.create_user("dave")))
        for _ in range(10):
            resp = self.client.post("/api/auth/token/refresh/", {"refresh": refresh}, format="json", **self.CLIENT)
            self.assertEqual(resp.status_code, 200)
            refresh = resp.data["refresh"]

    @_rates()
    def test_the_default_burst_rate_is_hit(self):
        codes = [self.create().status_code for _ in range(21)]
        self.assertEqual(codes, [201] * 20 + [429])

    @_rates(auth_login="3/min", auth_refresh="2/min")
    def test_auth_endpoints_are_limited(self):
        # An empty body is refused before Google or GitHub is asked, and
        # still counts.
        for url in ("/api/auth/google/", "/api/auth/github/"):
            self.setUp()
            codes = [self.client.post(url, {}, format="json", **self.CLIENT).status_code for _ in range(4)]
            self.assertEqual(codes, [400, 400, 400, 429], url)
        codes = [
            self.client.post("/api/auth/token/refresh/", {"refresh": "x"}, format="json", **self.CLIENT).status_code
            for _ in range(3)
        ]
        self.assertEqual(codes, [401, 401, 429])
        # The health check is never limited.
        for _ in range(10):
            self.assertEqual(self.client.get("/api/health/", **self.CLIENT).status_code, 200)

    @_rates(anon_create_burst="1/min")
    def test_a_broken_cache_lets_requests_through(self):
        from unittest import mock
        from django.db import DatabaseError
        from rest_framework.throttling import SimpleRateThrottle

        with mock.patch.object(SimpleRateThrottle, "allow_request", side_effect=DatabaseError("no such table")):
            with self.assertLogs("api.throttling", level="ERROR"):
                self.assertEqual(self.create().status_code, 201)
                self.assertEqual(self.create().status_code, 201)
