// Hide descendants and turn on each view filter: fewer people are drawn,
// nobody is deleted.
export default {
  name: "hide-and-filter",
  about: "Hidden descendants and each view filter change who is drawn and delete nobody",
  async run(t) {
    const id = await t.openFixture("fixture:filter-paternal");
    const total = await t.people();
    const drawn = async () => (await t.drawn()).filter(x => !x.startsWith("collapsed-branch:")).length;
    const filterOff = async () => {
      await t.click('[data-testid="filter-menu"]');
      await t.click('[data-radix-popper-content-wrapper] label:has-text("Both")');
      await t.press("Escape");
    };
    t.ok((await drawn()) < total, "Father's side only draws fewer people than there are");
    t.match(await t.text('[data-testid="filter-banner"]'), /Father's side only: \d+ people not drawn/, "a chip over the canvas says which filter is on and how many it leaves out");
    await filterOff();
    t.equal(await drawn(), total, "with the filter off everyone is drawn");
    t.equal((await t.pedigree()).filters?.side, undefined, "and the pedigree has no side filter");

    // Hide descendants from More options, then show them again from the group symbol.
    await t.menu("pa1", "Hide descendants");
    t.equal((await t.pedigree()).individuals.find(i => i.id === "pa1").descendantsHidden, true, "Hide descendants sets the flag");
    t.equal(await drawn(), total - 3, "her three children are no longer drawn");
    t.equal(await t.count('[data-collapsed-branch]'), 1, "a group symbol stands for them");
    t.match(await t.text('[data-collapsed-branch]'), /3/, "with their number inside");
    t.equal(await t.people(), total, "nobody is deleted");
    await t.click('[data-collapsed-branch]');
    t.equal(await drawn(), total, "clicking the group symbol shows them again");

    const turnOn = async label => {
      await t.click('[data-testid="filter-menu"]');
      await t.click(`[data-radix-popper-content-wrapper] label:has-text("${label}")`);
      await t.press("Escape");
    };
    await turnOn("Affected only");
    const affectedOnly = await drawn();
    t.ok(affectedOnly < total, `Affected only draws fewer people (${affectedOnly} of ${total})`);
    t.ok((await t.drawn()).includes("pro"), "the proband is still drawn");
    t.ok(!(await t.drawn()).includes("b1"), "an unaffected sibling is not");
    t.equal(await t.eval(() => window.__pededit.check().map(f => f.code)), [], "the filtered drawing passes the render lint");
    await turnOn("Affected only");
    t.equal(await drawn(), total, "turning it off draws everyone");

    await turnOn("Blood relatives only");
    t.ok((await t.drawn()).includes("c8h"), "Blood relatives only still draws partners, so nobody here is left out who married in");
    t.equal(await t.people(), total, "nobody is deleted by a filter");
    await turnOn("Mother's");
    t.equal((await t.pedigree()).filters, { bloodRelativesOnly: true, side: "maternal" }, "two filters can be on at once");
    t.ok(!(await t.drawn()).includes("pa2"), "Mother's side leaves out the father's brother");

    await t.reload();
    t.equal((await t.stored(id)).data.filters, { bloodRelativesOnly: true, side: "maternal" }, "the filters are saved with the pedigree");
    t.equal((await t.stored(id)).data.individuals.length, total, "with everyone still in it");
  },
};
