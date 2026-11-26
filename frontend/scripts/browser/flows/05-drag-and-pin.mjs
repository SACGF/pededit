// Drag a person: they are pinned where they were dropped, the pin survives a
// reload, and "Reset layout" clears it.
export default {
  name: "drag-and-pin",
  about: "A dragged person stays where they were dropped after a reload, until Reset layout",
  async run(t) {
    const id = await t.openFixture("example:Three generations");
    const node = '[data-individual-id="g3c"]';
    const where = () => t.eval(() => {
      const n = window.__pededit.layout().people.find(n => n.individual.id === "g3c");
      return { x: Math.round(n.position.x), y: Math.round(n.position.y), pinned: n.isPinned };
    });
    const start = await where();
    t.equal(start.pinned, false, "nobody is pinned to begin with");
    t.equal(await t.count('button:has-text("Reset layout")'), 0, "and there is no Reset layout button");

    // Nodes are locked until unlocked from the hover pill.
    await t.hover(node);
    await t.click('button[title="Unlock to drag"]');
    await t.mouseAway();
    t.equal((await t.pedigree()).unlockedIndividuals, ["g3c"], "the hover pill unlocks the person");

    const zoom = await t.eval(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a);
    await t.drag(node, Math.round(120 * zoom), Math.round(60 * zoom));
    const dropped = await where();
    t.ok(dropped.pinned, "after a drag the person is pinned");
    // React Flow starts a drag only after a few pixels, so a little of the movement is lost.
    t.ok(Math.abs(dropped.x - start.x - 120) <= 16 && Math.abs(dropped.y - start.y - 60) <= 16,
      `they moved by about the drag (from ${start.x},${start.y} to ${dropped.x},${dropped.y})`);
    t.ok(!!(await t.pedigree()).pinnedPositions?.g3c, "and the pin is in the pedigree");
    t.equal(await t.eval(() => window.__pededit.check().map(f => f.code)), [], "the lines still reach them (render lint)");

    await t.reload();
    t.equal(await where(), dropped, "after a reload they are still there");
    t.ok(!!(await t.stored(id)).data.pinnedPositions?.g3c, "because the server stored the pin");

    await t.click('button:has-text("Reset layout")');
    const reset = await where();
    t.equal({ x: reset.x, y: reset.y, pinned: reset.pinned }, start, "Reset layout puts them back");
    t.equal((await t.pedigree()).pinnedPositions ?? {}, {}, "and removes the pin");
    await t.press("Control+z");
    t.ok((await where()).pinned, "which undo brings back");
  },
};
