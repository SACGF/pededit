// "Draw this couple beside" (#205) on the couple line's right-click menu, in
// a family with a loop: it chooses who is drawn twice, shows on the canvas,
// is one undo step and is saved.
export default {
  name: "draw-couple-beside",
  about: "Draw this couple beside a partner: who is drawn twice changes on the canvas, undo, saved and reloaded",
  async run(t) {
    const id = await t.openFixture("example:Quadruple half first cousins");
    const couple = async () => (await t.pedigree()).partnerships.find(p => p.id === "C+B");
    /** How many people each row draws more than once, top row first. */
    const twicePerRow = () => t.eval(() => {
      const rows = new Map();
      for (const n of window.__pededit.layout().nodes) {
        const y = Math.round(n.position.y);
        if (!rows.has(y)) rows.set(y, new Set());
        if (n.data.isDuplicate) rows.get(y).add(n.data.individual.id);
      }
      return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(r => r[1].size);
    });
    const copiesDrawn = sel => t.count(`[data-individual-id="${sel}"]`);
    const line = '[data-partnership-id="C+B"]';

    t.equal((await couple()).drawnBeside, "C", "the example draws C and B beside C");
    t.equal(await twicePerRow(), [3, 0, 0], "so three people are drawn twice, all in the top row");
    t.equal(await copiesDrawn("F2"), 1, "and F2 is drawn once");

    await t.rightClick(line);
    t.equal(await t.count('[data-context-menu] [role="menuitemcheckbox"][aria-checked="true"]:has-text("The man")'), 1, "the menu ticks the partner the couple is drawn beside");
    await t.click("[data-context-menu] >> text=Automatic");
    t.ok((await couple()).drawnBeside === undefined && (await couple()).leftPartner === undefined, "Automatic hands the couple back to the layout");
    t.equal(await twicePerRow(), [2, 2, 0], "which draws four people twice, two of them in the second row");
    t.equal(await copiesDrawn("F2"), 2, "F2 is on the canvas twice");
    t.match(await t.text('[role="status"]'), /4 people are drawn twice now; 3 were before/, "and a notice says so");

    await t.menu(line, "The man");
    t.equal((await couple()).drawnBeside, "C", "choosing C draws the couple beside him again");
    t.equal(await twicePerRow(), [3, 0, 0], "three people drawn twice, in the top row only");
    t.equal(await copiesDrawn("F2"), 1, "F2 is drawn once again");
    t.equal(Object.keys((await t.pedigree()).pinnedPositions ?? {}), [], "and nobody is pinned");

    await t.press("Control+z");
    t.equal((await couple()).drawnBeside, undefined, "one undo takes the choice away");
    t.equal(await twicePerRow(), [2, 2, 0], "and the drawing goes back");
    await t.press("Control+y");

    await t.saved();
    const stored = (await t.stored(id)).data.partnerships.find(p => p.id === "C+B");
    t.equal([stored.drawnBeside, stored.leftPartner], ["C", "C"], "the choice is saved with the side it is drawn on");
    await t.reload();
    t.equal(await twicePerRow(), [3, 0, 0], "and the reloaded pedigree is drawn the same way");

    // A couple where one partner married in has nowhere else to be drawn.
    await t.openFixture("example:Three generations");
    await t.rightClick('[data-partnership-id="pp2"]');
    t.equal(await t.count('[data-context-menu] >> text=Draw this couple beside'), 0, "a couple with a partner who married in is not offered the choice");
  },
};
