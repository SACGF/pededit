// Type in the Person tab's fields, tab away, reload: saved.
export default {
  name: "person-tab-saves",
  about: "Text typed on the Person tab is saved by auto-save and is there after a reload",
  async run(t) {
    const id = await t.openFixture("test-data/pedigrees/structure/cousin-couple.json");
    await t.click('[data-individual-id="k1"]');
    t.match(await t.text('[data-testid="panel-person"]'), /Affected/, "clicking a person opens the Person tab");
    const name = "Élodie O'Brien <Jr> & co";
    const notes = "Line one\nLine two";
    await t.fill('input[aria-label="Name"]', name);
    await t.fill('input[aria-label="Date of birth"]', "1984-02");
    await t.fill('textarea[aria-label="Notes"]', notes);
    await t.press("Tab");
    await t.click('[data-testid="panel-person"] label:has-text("Deceased") input');
    await t.fill('input[aria-label="Date of death"]', "2020");
    await t.press("Tab");
    const want = { name, dob: "1984-02", notes, deceased: true, dod: "2020" };
    const pick = i => ({ name: i.name, dob: i.dob, notes: i.notes, deceased: i.deceased, dod: i.dod });
    t.equal(pick(await t.individual("k1")), want, "the store has what was typed");
    t.match(await t.text('[data-individual-id="k1"]'), /lodie/, "the name is drawn under the symbol");
    t.match(await t.text('[data-individual-id="k1"]'), /b\. 1984/, "with the year of birth, not the full date");

    await t.reload();
    t.equal(pick(await t.individual("k1")), want, "after a reload it is all still there");
    t.equal(pick(await t.individual("k1", (await t.stored(id)).data)), want, "and it is what the server holds");
    await t.click('[data-individual-id="k1"]');
    t.equal(await t.eval(() => document.querySelector('input[aria-label="Name"]').value), name, "the Person tab shows the saved name");
    t.equal(await t.eval(() => document.querySelector('textarea[aria-label="Notes"]').value), notes, "and the notes, line break kept");
  },
};
