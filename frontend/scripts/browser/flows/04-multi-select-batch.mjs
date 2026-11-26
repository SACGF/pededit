// Shift+click and rubber band selection, then a batch change from the
// "N selected" menu, as one undo step.
export default {
  name: "multi-select-batch",
  about: "Select several people by Shift+click and by rubber band, change them all from the menu, undo in one step",
  async run(t) {
    await t.openFixture("example:Three generations");
    const selected = () => t.eval(() => [...window.__pededit.usePedigreeStore.getState().selectedIds].sort());
    const node = id => `[data-individual-id="${id}"]`;

    await t.click(node("g3a"));
    t.equal(await selected(), ["g3a"], "a click selects one person");
    await t.holding("Shift", () => t.click(node("g3b")));
    t.equal(await selected(), ["g3a", "g3b"], "Shift+click adds a second");
    await t.holding("Shift", () => t.click(node("g3a")));
    t.equal(await selected(), ["g3b"], "Shift+click on a selected person takes them out");

    // Rubber band: Shift+drag on the background from above-left of the top
    // couple to below-right of them.
    await t.press("Escape");
    t.equal(await selected(), [], "Escape clears the selection");
    const box = await t.eval(() => {
      const r = id => document.querySelector(`[data-individual-id="${id}"]`).getBoundingClientRect();
      const a = r("g1f"), b = r("g1m");
      return { x1: Math.min(a.left, b.left) - 30, y1: a.top - 30, x2: Math.max(a.right, b.right) + 30, y2: a.bottom + 14 };
    });
    await t.page.keyboard.down("Shift");
    await t.page.mouse.move(box.x1, box.y1);
    await t.page.mouse.down();
    await t.page.mouse.move((box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2, { steps: 5 });
    await t.page.mouse.move(box.x2, box.y2, { steps: 5 });
    await t.page.mouse.up();
    await t.page.keyboard.up("Shift");
    await t.sleep(300);
    t.equal(await selected(), ["g1f", "g1m"], "Shift+drag selects the two people inside the box");

    const depth = await t.undoDepth();
    const affected = async () => (await t.pedigree()).individuals.filter(i => i.affected).map(i => i.id).sort();
    const was = await affected();
    await t.rightClick(node("g1m"));
    t.match(await t.text("[data-context-menu]"), /2 selected/i, "the menu on a selected person is about both");
    await t.click('[data-context-menu] button:text-is("Mark 2 affected")');
    t.equal(await affected(), [...new Set([...was, "g1f", "g1m"])].sort(), "the batch item marks them both affected");
    t.equal(await t.undoDepth(), depth + 1, "as one undo step");
    await t.press("Control+z");
    t.equal(await affected(), was, "and one undo puts both back");

    await t.click(node("g3a"));
    await t.holding("Shift", () => t.click(node("g3c")));
    await t.press("d");
    const p = await t.pedigree();
    t.equal(p.individuals.filter(i => ["g3a", "g3c"].includes(i.id)).map(i => !!i.deceased), [true, true], "the D key marks every selected person deceased");

    const wasAffected = await affected();
    await t.press("a");
    t.equal(await affected(), [...new Set([...wasAffected, "g3a", "g3c"])].sort(), "the A key marks every selected person affected");
    const people = await t.people();
    const steps = await t.undoDepth();
    await t.press("Delete");
    const left = (await t.pedigree()).individuals.map(i => i.id);
    t.ok(!left.includes("g3a") && !left.includes("g3c"), "the Delete key removes every selected person");
    t.equal(left.length, people - 2, "and nobody else");
    t.equal(await selected(), [], "nobody is left selected");
    t.equal(await t.undoDepth(), steps + 1, "as one undo step");
    await t.press("Control+z");
    t.equal(await t.people(), people, "and one undo brings them back");
  },
};
