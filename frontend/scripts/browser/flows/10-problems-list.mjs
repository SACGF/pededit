// Open the problems list, apply a fix and "Fix all like this", step with F8.
export default {
  name: "problems-list",
  about: "The problems list selects the person, a fix clears its problem, Fix all like this is one undo step, F8 steps through",
  async run(t) {
    await t.openFixture("test-data/pedigrees/problems/status.json");
    const problems = () => t.eval(() => window.__pededit.problems().map(p => p.id));
    const start = await problems();
    t.match(await t.text('[data-testid="problems-menu"]'), new RegExp(`${start.length} problems`), "the toolbar counts the problems");
    t.ok((await t.count("[data-problem-marker]")) >= 8, "people with a problem carry a marker on the canvas");

    await t.click('[data-testid="problems-menu"]');
    t.equal(await t.count("[data-problem-item]"), start.length, "the list has one item a problem");
    t.match(await t.text('[data-problem-item="proband-unaffected:p"] [data-problem-subject]'), /^II-1, /, "people are named by pedigree number");
    await t.hover('[data-problem-item="consultand-deceased:q"]');
    t.equal(await t.count('[data-individual-id="q"][data-problem-highlight]'), 1, "hovering an item outlines the person on the canvas");
    await t.press("Escape");
    t.equal(await t.count("[data-problem-highlight]"), 0, "closing the list takes the outline away");
    await t.click('[data-testid="problems-menu"]');

    await t.click('[data-problem-item="proband-unaffected:p"] [data-problem-fix="Mark affected"]');
    t.ok(!(await problems()).includes("proband-unaffected:p"), "a fix clears its problem");
    t.equal((await t.individual("p")).affected, true, "by making the edit it names");

    const depth = await t.undoDepth();
    const unrecorded = (await problems()).filter(id => id.startsWith("condition-not-recorded:"));
    t.ok(unrecorded.length >= 2, "several people are affected with no condition recorded");
    if (!(await t.visible("[data-problem-item]"))) await t.click('[data-testid="problems-menu"]');
    await t.click('[data-problem-fix-all="Record as Condition one"] >> nth=0');
    const left = (await problems()).filter(id => id.startsWith("condition-not-recorded:"));
    t.ok(left.length < unrecorded.length - 1, `Fix all like this fixes several at once (${unrecorded.length} to ${left.length})`);
    t.equal(await t.undoDepth(), depth + 1, "as one undo step");
    await t.press("Escape");
    await t.press("Control+z");
    t.equal((await problems()).filter(id => id.startsWith("condition-not-recorded:")).length, unrecorded.length, "which one undo takes back");

    // F8 goes to the next problem: selects its person and focuses the field.
    await t.press("Escape");
    const selected = () => t.eval(() => window.__pededit.usePedigreeStore.getState().selectedId);
    await t.press("F8");
    const first = await selected();
    t.ok(!!first, "F8 selects a person with a problem");
    await t.press("F8");
    const second = await selected();
    t.ok(!!second && second !== first, "F8 again goes on to the next");
    await t.press("Shift+F8");
    t.equal(await selected(), first, "Shift+F8 goes back");
    t.ok(await t.eval(() => !!document.activeElement?.closest("[data-problem-field]")), "and the field with the problem has the focus");
  },
};
