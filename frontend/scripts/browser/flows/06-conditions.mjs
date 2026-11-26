// Define two conditions, record affected and carrier, check the symbol, the
// legend and the Person tab.
export default {
  name: "conditions",
  about: "Define two conditions, record one person affected and another a carrier; the legend and Person tab agree",
  async run(t) {
    const id = await t.openFixture("test-data/pedigrees/structure/cousin-couple.json");
    await t.click('[data-testid="panel-tab-pedigree"]');
    t.match(await t.text('[data-testid="panel-pedigree"]'), /None defined for this pedigree yet/, "no conditions to begin with");

    await t.click('[data-testid="panel-pedigree"] button:has-text("Add / edit")');
    for (const label of ["Cystic fibrosis", "Deafness"]) {
      await t.click('[role="dialog"] button:has-text("Add condition or tag")');
      await t.eval(text => {
        const inputs = document.querySelectorAll('[role="dialog"] input[placeholder="Label"]');
        inputs[inputs.length - 1].setAttribute("data-flow-target", text);
      }, label);
      await t.fill(`[role="dialog"] input[data-flow-target="${label}"]`, label);
    }
    await t.press("Tab");
    await t.click('[role="dialog"] button:has-text("Close") >> nth=0');
    let p = await t.pedigree();
    t.equal(p.tags.map(x => [x.label, x.style]), [["Cystic fibrosis", "quadrant"], ["Deafness", "quadrant"]], "two conditions are defined");
    const [cf, deaf] = p.tags;

    await t.click('[data-individual-id="z"]');
    await t.select('select[aria-label="Cystic fibrosis status"]', "Affected");
    await t.click('[data-individual-id="k1"]');
    await t.select('select[aria-label="Cystic fibrosis status"]', "Carrier");
    await t.select('select[aria-label="Deafness status"]', "Affected");
    p = await t.pedigree();
    const of = pid => p.individuals.find(i => i.id === pid);
    t.equal(of("z").tags, [cf.id], "the child is affected with the first");
    t.equal(of("z").affected, false, "which does not set the plain affected flag");
    t.equal([of("k1").carrierTags, of("k1").tags], [[cf.id], [deaf.id]], "the father is a carrier of the first and affected with the second");
    t.equal(await t.eval(() => { const s = document.querySelector('select[aria-label="Cystic fibrosis status"]'); return s.options[s.selectedIndex].text; }), "Carrier", "the Person tab shows the state");
    t.ok((await t.count('[data-individual-id="k1"] [data-carrier-sector]')) > 0, "the carrier section is drawn on his symbol");
    t.ok((await t.count('[data-individual-id="z"] [data-carrier-sector]')) === 0, "and not on the affected child's");

    await t.click('[data-testid="panel-tab-pedigree"]');
    const legend = await t.text('[data-testid="legend"]');
    for (const row of ["Cystic fibrosis", "Cystic fibrosis carrier", "Deafness"]) t.match(legend, new RegExp(`(^|\\n)${row}(\\n|$)`), `the legend has a row "${row}"`);
    t.notMatch(legend, /Deafness carrier/, "and none for a carrier state nobody has");
    t.equal(await t.eval(() => window.__pededit.problems().map(x => x.rule)), [], "nothing is flagged as a problem");

    await t.reload();
    t.equal((await t.individual("k1", (await t.stored(id)).data)).carrierTags, [cf.id], "the carrier state is saved");
  },
};
