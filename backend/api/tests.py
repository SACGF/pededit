from rest_framework.test import APITestCase

from .models import Pedigree

FULL_PEDIGREE = {
    "individuals": [
        {
            "id": "f", "sex": "male", "affected": False, "deceased": True,
            "carrier": False, "proband": False, "sibOrder": 0,
            "name": "John Smith", "dob": "1950-03-01",
            "notes": "Line one\nLine two ", "hpoTerms": ["HP:0001250"],
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
