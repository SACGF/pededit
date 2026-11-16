// "Set parents..." by picking two people on the canvas who are first
// cousins: they become a couple, and the couple line turns double.
export default {
  name: "set-parents-by-picking",
  about: "Set parents by picking two cousins on the canvas; their new couple line is double",
  async run(t) {
    await t.openFixture("example:Three generations");
    const before = await t.pedigree();
    t.equal(await t.eval(() => window.__pededit.kinship().kinship("g3a", "g3c")), 0.0625, "g3a and g3c are first cousins");
    t.ok(!before.partnerships.some(p => [p.individual1, p.individual2].sort().join() === "g3a,g3c"), "and not a couple yet");

    await t.click('button[title="Add unknown sex"]');
    const child = (await t.pedigree()).individuals.find(i => !before.individuals.some(b => b.id === i.id));
    await t.menu(child.id, "Set parents...");
    t.equal(await t.eval(() => window.__pededit.usePedigreeStore.getState().picking?.kind), "parents", "the canvas is picking parents");
    await t.click('[data-individual-id="g3a"]');
    t.equal(await t.eval(() => document.querySelector('[data-individual-id="g3a"]').getAttribute("data-picked")), "true", "the first pick is outlined");
    await t.click('[data-individual-id="g3c"]');
    if (await t.eval(() => !!window.__pededit.usePedigreeStore.getState().picking)) await t.click('button:has-text("Set parents")');

    const after = await t.pedigree();
    const couple = after.partnerships.find(p => [p.individual1, p.individual2].sort().join() === "g3a,g3c");
    t.ok(!!couple, "the two picked people are now a couple");
    t.equal(after.parentOf[couple.id], [child.id], "with the new person as their child");
    t.equal(couple.individual1, "g3a", "the father is first in the couple");
    t.equal(await t.eval(() => window.__pededit.usePedigreeStore.getState().picking), null, "picking is over");
    const edge = await t.eval(id => window.__pededit.layout().coupleEdges.find(e => e.data.partnershipId === id)?.type, couple.id);
    t.equal(edge, "consanguineousEdge", "their couple line is double");
    t.ok(couple.consanguineous === undefined, "from their kinship, with nothing stored on the couple");
    t.equal(await t.count(`[data-partnership-id="${couple.id}"] path[stroke="black"]`), 2, "and two lines are drawn on the canvas");

    await t.press("Control+z");
    t.equal((await t.pedigree()).partnerships.length, before.partnerships.length, "one undo takes the couple away again");
  },
};
