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
