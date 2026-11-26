// Start blank, build three generations with the toolbar, the hover pill and
// More options, undo to empty, redo to the end.
export default {
  name: "build-undo-redo",
  about: "Build three generations from a blank pedigree, undo to empty, redo to the end",
  async run(t) {
    await t.open("/");
    await t.click('button:has-text("Create blank pedigree")');
    await t.waitFor('button[title="Add male"]');
    t.match(t.page.url(), /\/p\/[0-9a-f-]{36}$/, "creating a blank pedigree opens /p/<id>");
    t.currentId();
    t.equal(await t.people(), 0, "a blank pedigree has nobody");

    await t.click('button[title="Add male"]');
    const [first] = (await t.pedigree()).individuals;
    t.equal(first?.sex, "male", "the toolbar adds a male");
    t.equal(await t.eval(() => window.__pededit.usePedigreeStore.getState().selectedId), first.id, "the new person is selected");

    await t.pill(first.id, "Add parents");
    let p = await t.pedigree();
    t.equal(p.individuals.length, 3, "Add parents adds two people");
    t.equal(Object.values(p.parentOf).flat(), [first.id], "the first person is their child");
    const parents = p.partnerships[0];
    t.equal(p.individuals.filter(i => i.id !== first.id).map(i => i.sex).sort(), ["female", "male"], "the parents are a man and a woman");

    await t.pill(first.id, "Add sibling");
    p = await t.pedigree();
    t.equal(p.parentOf[parents.id].length, 2, "Add sibling adds a second child to the same couple");

    await t.menu(first.id, "Add partner");
    p = await t.pedigree();
    t.equal(p.partnerships.length, 2, "More options > Add partner makes a second couple");
    const partner = p.individuals[p.individuals.length - 1];
    t.equal(partner.sex, "female", "a man's new partner is a woman");

    await t.pill(first.id, "Add daughter");
    await t.pill(first.id, "Add son");
    p = await t.pedigree();
    const own = p.partnerships.find(x => x.id !== parents.id);
    t.equal((p.parentOf[own.id] ?? []).length, 2, "Add daughter and Add son add two children to his couple");
    t.equal(p.individuals.length, 7, "seven people in three generations");
    t.equal((await t.drawn()).length, 7, "all seven are drawn");
    t.equal(await t.eval(() => window.__pededit.check()), [], "the drawing passes the render lint");
    const built = p;
    const steps = await t.undoDepth();
    t.equal(steps, 6, "six edits, six undo steps");

    for (let i = 0; i < steps; i++) await t.click('button[title="Undo"]');
    t.equal(await t.people(), 0, "undoing every step empties the pedigree");
    t.ok(await t.eval(() => document.querySelector('button[title="Undo"]').disabled), "Undo is disabled at the start");
    for (let i = 0; i < steps; i++) await t.press("Control+y");
    t.equal(await t.pedigree(), built, "redoing every step gives the same pedigree back");

    await t.reload();
    t.equal(await t.pedigree(), built, "and it is what was saved");
  },
};
