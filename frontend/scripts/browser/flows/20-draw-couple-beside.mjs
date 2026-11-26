// "Draw this couple beside" (#205) on the couple line's right-click menu, a
// partner's own menu and the menu of both partners selected (#207), in a
// family with a loop: it chooses who is drawn twice, shows on the canvas, is one
// undo step and is saved.
export default {
  name: "draw-couple-beside",
  about: "Draw this couple beside a partner: who is drawn twice changes on the canvas, undo, saved and reloaded",
  async run(t) {
    const id = await t.openFixture("example:Quadruple half first cousins");
    const couple = async () => (await t.pedigree()).partnerships.find(p => p.id === "C+B");
    /** How many people each row draws more than once, top row first. */
    const twicePerRow = () => t.eval(() => {
      const rows = new Map();
      for (const n of window.__pededit.layout().people) {
        const y = Math.round(n.position.y);
        if (!rows.has(y)) rows.set(y, new Set());
        if ((n.glyph.copy !== undefined)) rows.get(y).add(n.individual.id);
      }
      return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(r => r[1].size);
    });
    const copiesDrawn = sel => t.count(`[data-individual-id="${sel}"]`);
    const line = '[data-partnership-id="C+B"]';

    t.equal((await couple()).drawnBeside, "C", "the example draws C and B beside C");
    t.equal(await twicePerRow(), [3, 0, 0], "so three people are drawn twice, all in the top row");
    t.equal(await copiesDrawn("F2"), 1, "and F2 is drawn once");

    await t.rightClick(line);
    t.equal(await t.count('[data-context-menu] [role="menuitemcheckbox"][aria-checked="true"]:has-text("(male)")'), 1, "the menu ticks the partner the couple is drawn beside");
    await t.click("[data-context-menu] >> text=Automatic");
    t.ok((await couple()).drawnBeside === undefined && (await couple()).leftPartner === undefined, "Automatic hands the couple back to the layout");
    t.equal(await twicePerRow(), [2, 2, 0], "which draws four people twice, two of them in the second row");
    t.equal(await copiesDrawn("F2"), 2, "F2 is on the canvas twice");
    t.match(await t.text('[role="status"]'), /4 people are drawn twice now; 3 were before/, "and a notice says so");

    await t.menu(line, "/Partner \\d \\(male\\)/");
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

    // The same choice without the couple line: on a partner's own menu, in
    // the group of each couple, headed by the other partner, and
    // on the menu of the two partners selected together.
    // Whoever is drawn twice has two symbols; either copy will do.
    const node = id => `[data-individual-id="${id}"] >> nth=0`;
    await t.rightClick(node("B"));
    t.match(await t.text("[data-context-menu]"), /With [^\n]+\n[\s\S]*Draw this couple beside/i, "a partner's own menu offers it in the group of each of their couples");
    t.equal(await t.count('[data-context-menu] [data-draw-beside="C+B"] [aria-checked="true"]:has-text("(male)")'), 1, "with the same tick as the couple line's menu");
    t.equal(await t.count("[data-context-menu] [data-draw-beside]"), 2, "B is in two couples that have the choice");
    await t.click('[data-context-menu] [data-draw-beside="C+B"] >> text=Automatic');
    t.equal(await twicePerRow(), [2, 2, 0], "and choosing there redraws the couple");
    await t.press("Control+z");

    await t.click(node("B"));
    await t.holding("Shift", () => t.click(node("C")));
    await t.rightClick(node("C"));
    const both = await t.text("[data-context-menu]");
    t.match(both, /2 selected/i, "with both partners selected the menu is still about the two");
    t.match(both, /Draw this couple beside/i, "and offers what their couple line does");
    t.match(both, /Swap sides/, "the other couple items with it");
    await t.click("[data-context-menu] >> text=Automatic");
    t.equal((await couple()).drawnBeside, undefined, "choosing there acts on their couple");
    await t.press("Control+z");
    await t.click(node("A"));
    await t.holding("Shift", () => t.click(node("C")));
    await t.rightClick(node("C"));
    t.equal(await t.count("[data-context-menu] >> text=Swap sides"), 0, "two people who are not a couple get no couple items");
    await t.press("Escape");

    // A couple where one partner married in has nowhere else to be drawn.
    await t.openFixture("example:Three generations");
    await t.rightClick('[data-partnership-id="pp2"]');
    t.equal(await t.count('[data-context-menu] >> text=Draw this couple beside'), 0, "a couple with a partner who married in is not offered the choice");
    await t.press("Escape");
    await t.rightClick(node("g1m"));
    t.equal(await t.count('[data-context-menu] >> text=/Draw (this|the) couple/i'), 0, "nor is either of them on their own menu");
  },
};
