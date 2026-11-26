// Signed in: a hatched trait saved to My library comes back hatched and a
// trait when added to another pedigree (#131).
const LABEL = "Flow library trait";

export default {
  name: "tag-library",
  asAgent: true,
  about: "Signed in, a hatched trait saved to My library from the Conditions and tags dialog is added to another pedigree still hatched and still a trait",
  async run(t) {
    await t.open("/");
    const token = await t.eval(() => localStorage.getItem("access_token"));
    const api = (path, init = {}) => fetch(new URL(path, t.base), { ...init, headers: { Authorization: `Bearer ${token}` } });
    const clearLibrary = async () => {
      for (const p of await (await api("/api/tag-presets/")).json()) {
        if (p.label === LABEL) await api(`/api/tag-presets/${p.id}/`, { method: "DELETE" });
      }
    };
    await clearLibrary();

    const openDialog = async () => {
      await t.click('[data-testid="panel-tab-pedigree"]');
      await t.click('[data-testid="panel-pedigree"] button:has-text("Add / edit")');
      await t.waitFor('[role="dialog"]');
    };

    await t.openFixture("test-data/pedigrees/structure/cousin-couple.json");
    await openDialog();
    await t.click('[role="dialog"] button:has-text("Add condition or tag")');
    await t.fill('[role="dialog"] input[placeholder="Label"]', LABEL);
    await t.select('[role="dialog"] select[aria-label="Fill"]', "diagonal");
    await t.select('[role="dialog"] select[aria-label="Meaning"]', "trait");
    await t.click('[role="dialog"] button[title="Save to my library"]');
    await t.sleep(500);
    t.equal(await t.count('[role="dialog"] button[title="Already in your library"]'), 1, "the bookmark then says it is in the library");
    const saved = (await (await api("/api/tag-presets/")).json()).filter(p => p.label === LABEL);
    t.equal(saved.map(p => [p.style, p.fill, p.kind]), [["quadrant", "diagonal", "trait"]], "the library keeps its fill and that it is a trait");

    await t.openFixture("test-data/pedigrees/structure/cousin-couple.json");
    await openDialog();
    await t.click(`[role="dialog"] li:has-text("${LABEL}") button:text-is("Add")`);
    const added = (await t.pedigree()).tags.filter(x => x.label === LABEL);
    t.equal(added.map(x => [x.style, x.fill, x.kind]), [["quadrant", "diagonal", "trait"]], "added to another pedigree it is still hatched and still a trait");
    t.equal(await t.count('[role="dialog"] button[title="Already in your library"]'), 1, "and the dialog knows it is already in the library");

    await clearLibrary();
  },
};
