// The U-shape view (#220): the toolbar's U-shape button draws the family
// bent round a U in place of the chart. People are selected on it and edited
// on the Person tab, the U redraws, and what only the chart can do (drag,
// right-click menus, rubber band, adding someone unconnected) says why not.
export default {
  name: "u-shape-view",
  about: "U-shape view: select on the U, edit on the Person tab, the U redraws; drag, menus, rubber band and Add say why not; not saved",
  async run(t) {
    const id = await t.openFixture("example:Large family");
    const total = await t.people();
    const state = () => t.eval(() => {
      const s = window.__pededit.usePedigreeStore.getState();
      return { on: s.uShapeView, selected: [...s.selectedIds].sort() };
    });
    const figure = '[data-u-shape-figure]';
    const person = pid => `${figure} g[data-id="${pid}"]`;
    const onU = () => t.eval(sel => [...new Set([...document.querySelectorAll(`${sel} [data-id]`)].map(e => e.getAttribute("data-id")))], figure);
    const notice = () => t.text('[data-testid="notice"]');

    await t.click('[data-testid="u-shape-toggle"]');
    t.equal((await state()).on, true, "the U-shape button turns the view on");
    t.equal(await t.count(".react-flow"), 0, "the chart is replaced");
    const drawn = (await onU()).filter(x => !x.startsWith("collapsed-branch:"));
    t.ok(drawn.length > 5 && drawn.length < total, `the U draws part of this family (${drawn.length} of ${total})`);
    t.match(await t.text('[data-testid="u-shape-banner"]'), new RegExp(`U-shape view: ${drawn.length} of ${total} people drawn`), "the banner says how many of the family are drawn");

    // Select on the U and edit on the Person tab.
    const pick = drawn.find(x => x.startsWith("g3")) ?? drawn[drawn.length - 1];
    await t.click(person(pick));
    t.equal((await state()).selected, [pick], "a click on the U selects that person");
    t.equal(await t.count(`${person(pick)} [data-u-highlight]`), 1, "and outlines them");
    const blackFill = () => t.eval(sel => !!document.querySelector(sel)?.querySelector('[fill="black"]:not(text)'), person(pick));
    const wasAffected = (await t.individual(pick)).affected;
    await t.click('[data-testid="panel-person"] label:has-text("Affected") input');
    t.equal((await t.individual(pick)).affected, !wasAffected, "the Person tab edits whoever is selected on the U");
    t.equal(await blackFill(), !wasAffected, "and the U redraws with the change");
    const before = new Set((await t.pedigree()).individuals.map(i => i.id));
    await t.click('[data-testid="person-actions"] [aria-label="Add son"]');
    const after = await t.pedigree();
    // With no partner, the son comes with a placeholder for his other parent.
    const son = after.individuals.find(i => !before.has(i.id) && Object.values(after.parentOf).flat().includes(i.id))?.id;
    t.ok(!!son, "Add son is on the Person tab in the U-shape view");
    t.ok((await onU()).includes(son), "and the son is drawn on the U");
    const people = after.individuals.length;

    // What only the chart does is refused with a notice saying why.
    await t.rightClick(person(pick));
    t.match(await notice(), /no menus on the chart/, "a right-click on a person says the U has no menus");
    const pinsBefore = JSON.stringify((await t.pedigree()).pinnedPositions ?? {});
    await t.drag(person(pick), 60, 40);
    t.match(await notice(), /cannot be moved in the U-shape view/, "dragging a person says nobody is moved on the U");
    t.equal(JSON.stringify((await t.pedigree()).pinnedPositions ?? {}), pinsBefore, "and nobody is pinned");
    const selectedBefore = (await state()).selected;
    const box = await t.eval(() => document.querySelector('[data-testid="u-shape-view"]').getBoundingClientRect().toJSON());
    await t.page.keyboard.down("Shift");
    // The middle of the U is empty.
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    t.equal(await t.eval(([x, y]) => !document.elementFromPoint(x, y)?.closest("[data-id]"), [cx, cy]), true, "the middle of the U is empty");
    await t.page.mouse.move(cx - 40, cy - 40);
    await t.page.mouse.down();
    await t.page.mouse.move(cx + 40, cy + 40, { steps: 5 });
    await t.page.mouse.up();
    await t.page.keyboard.up("Shift");
    t.match(await notice(), /no rubber band/, "Shift+drag says there is no rubber band");
    t.equal((await state()).selected, selectedBefore, "and the selection is unchanged");
    // aria-disabled, so Playwright will not click it unless forced; a person can, and is told why.
    await t.page.locator('button[title^="Add male"]').click({ force: true });
    await t.sleep(200);
    t.match(await notice(), /would not be drawn on the U/, "the toolbar's Add male says why not");
    t.equal(await t.people(), people, "and adds nobody");

    const other = drawn.find(x => x !== pick);
    await t.holding("Shift", () => t.click(person(other)));
    t.equal((await state()).selected, [pick, other].sort(), "Shift+click adds a second person to the selection");

    await t.click('[data-testid="u-shape-back"]');
    t.equal((await state()).on, false, "Back to standard chart turns the view off");
    t.ok((await t.count(".react-flow")) === 1, "and the chart is back");
    await t.click('[data-testid="u-shape-toggle"]');
    t.equal((await state()).on, true, "the button turns it on again");
    // Picking is done on the chart: starting it from the Person tab leaves the U.
    await t.click(person(pick));
    await t.click('[data-testid="person-actions"] button:has-text("More")');
    await t.click('text="Add existing partner..."');
    t.equal((await state()).on, false, "Add existing partner... on the Person tab goes back to the standard chart");
    t.equal(await t.eval(() => window.__pededit.usePedigreeStore.getState().picking?.kind), "partner", "to pick the partner there");
    t.match(await notice(), /U-shape view was turned off/, "and says why");
    await t.press("Escape");
    await t.reload();
    t.equal((await state()).on, false, "a reload opens the standard chart: the view is not saved");
    const stored = (await t.stored(id)).data;
    t.equal(stored.individuals.length, people, "the edits made on the U are saved");
    t.ok(!JSON.stringify(stored).includes("uShape"), "and nothing about the view is");
  },
};
