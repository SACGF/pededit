// Text mode (#218): PED typed into the import dialog's box is drawn as it is
// typed, a bad row keeps the last good drawing and says why, and the result
// opens in the editor. "View PED as text" in the Export menu shows the PED
// the export writes, with Copy.
export default {
  name: "ped-text",
  about: "Type PED with mixed spaces and tabs: the preview draws it, a bad row shows its error and keeps the drawing, Open in editor; View PED as text shows the exported PED and copies it",
  async run(t) {
    const box = '[role="dialog"] [data-testid="ped-text-input"]';
    const symbols = () => t.count('[data-testid="ped-text-preview"] g.symbols > g');
    // The box reads the text after a pause.
    const typed = async text => { await t.fill(box, text); await t.sleep(600); };

    await t.open("/");
    await t.click('button:has-text("Import from PED or JSON file")');
    await t.click('[data-testid="ped-text-link"]');
    t.ok(await t.visible(box), "the link opens the text box");

    const good = "fam1 dad\t0  0 1 1\nfam1\tmum 0 0\t2 1\nfam1  kid dad\tmum 2   2\n";
    await typed(good);
    t.equal(await symbols(), 3, "mixed spaces and tabs: the preview draws three people");
    t.equal(await t.count('[data-testid="ped-text-errors"]'), 0, "and shows no error");

    await typed(good + "fam1 son dad");
    t.match(await t.text('[data-testid="ped-text-errors"]'), /column|cell|row/i, "a half-typed row shows its error beside the box");
    t.equal(await symbols(), 3, "and the last good drawing stays");
    t.ok(await t.eval(() => document.querySelector('[data-testid="ped-text-open"]').disabled), "and the text cannot be opened in the editor");

    await typed(good + "fam1 son dad mum 1 1\n");
    t.equal(await symbols(), 4, "the finished row is drawn");

    await t.click('[data-testid="ped-text-open"]');
    await t.waitFor('button[title="Add male"]');
    t.currentId();
    const p = await t.pedigree();
    t.equal(p.individuals.map(i => i.name).sort(), ["dad", "kid", "mum", "son"], "Open in editor: the typed people, named by their ids");
    t.equal(p.individuals.find(i => i.name === "kid")?.affected, true, "with the affected column read");
    t.equal((await t.drawn()).length, 4, "and all drawn on the canvas");

    // View PED as text: what the PED export writes, read-only, with Copy.
    await t.click(await t.exportMenu("View the PLINK PED as text"));
    const shown = await t.eval(sel => ({ value: document.querySelector(sel).value, readOnly: document.querySelector(sel).readOnly }), box);
    const exported = await t.eval(() => window.__pededit.exportPed(window.__pededit.pedigree(), { familyId: "1" }));
    t.equal(shown.value, exported, "View PED as text shows what the PED export writes");
    t.ok(shown.readOnly, "read-only");
    await t.sleep(300);
    t.equal(await symbols(), 4, "with the chart the PED draws");
    await t.page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: t.base });
    await t.click('[data-testid="ped-text-copy"]');
    t.equal(await t.text('[data-testid="ped-text-copy"]'), "Copied", "Copy says it copied");
    t.equal(await t.eval(() => navigator.clipboard.readText()), exported, "and the clipboard holds the PED");
  },
};
