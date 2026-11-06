import json
from pathlib import Path

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from .models import Pedigree, TagPreset

FULL_PEDIGREE = {
    "individuals": [
        {
            "id": "f", "sex": "male", "affected": False, "deceased": True,
            "carrier": False, "proband": False, "sibOrder": 0,
            "name": "John Smith", "dob": "1950-03-01",
            "notes": "Line one\nLine two ", "hpoTerms": ["HP:0001250"],
            "tags": ["t1", "t2"],
        },
        {
            "id": "m", "sex": "female", "affected": False, "deceased": False,
            "carrier": True, "proband": False, "sibOrder": 0, "name": "Jane Smith",
        },
        {
            "id": "c1", "sex": "unknown", "affected": True, "deceased": False,
            "carrier": False, "proband": True, "sibOrder": 1, "name": "",
        },
    ],
    "partnerships": [
        {"id": "p1", "individual1": "f", "individual2": "m", "consanguineous": True},
    ],
    "parentOf": {"p1": ["c1"]},
    "siblingOrder": {"mode": "manual", "affectedFirst": True},
    "pinnedPositions": {"c1": {"x": 12.5, "y": -40.0}},
    "canvasSettings": {"nodesMoveable": True, "snapToGrid": True, "snapGridSize": 20},
    "unlockedIndividuals": ["f"],
    "tags": [
        {"id": "t1", "label": "Tremor", "color": "#000000", "style": "quadrant"},
        {"id": "t2", "label": "Sequenced", "color": "#1f77b4", "style": "dot", "abbrev": "WGS"},
    ],
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
            {**base, "individuals": [{"id": "a", "sex": "male"}]},
            {**base, "partnerships": [{"id": "p", "individual1": "a"}]},
            {"individuals": [], "partnerships": []},
            {**base, "tags": [{"id": "t", "label": "x", "color": "#000", "style": "stripe"}]},
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
