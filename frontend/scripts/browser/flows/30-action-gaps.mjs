// The actions the inventory found missing (#243), each pressed in the
// editor and checked in the pedigree; those that change saved data are
// checked again after a reload of /p/<id>.
export default {
  name: "action-gaps",
  about: "Make partners, a couple's Add children, twins for selected siblings, Remove donor and surrogate, batch consultand / family history / adoption / set parents / detach / unpin, Select with ancestors, brother and sister, the pill's partner button, Add existing child, the Person tab's More buttons and Move left disabled with its reason",
  async run(t) {
    const id = await t.openFixture("example:Three generations");
    const ped = () => t.pedigree();
    const parentsOf = async (child, p) => Object.entries((p ?? await ped()).parentOf).find(([, kids]) => kids.includes(child))?.[0];
    const couple = async (a, b, p) => ((p ?? await ped()).partnerships).find(x => !x.donorConception && [x.individual1, x.individual2].sort().join() === [a, b].sort().join());
    const select = async ids => {
      await t.press("Escape");
      await t.click(t.person(ids[0]));
      for (const x of ids.slice(1)) await t.holding("Shift", () => t.click(t.person(x)));
    };
    const item = async (on, text) => {
      await t.rightClick(t.person(on));
      await t.click(`[data-context-menu] button:text-is("${text}")`);
      await t.sleep(200);
    };
    const disabledTitle = (text) => t.eval(text => {
      const b = [...document.querySelectorAll("[data-context-menu] button")].find(x => x.textContent.trim() === text);
      return b?.disabled ? b.getAttribute("title") : null;
    }, text);

    // Row 1: two people who are not partners.
    await select(["g2b", "g2d"]);
    await item("g2b", "Make partners");
    t.ok(!!(await couple("g2b", "g2d")), "row 1: Make partners joins two selected people with a couple line");
    await t.press("Control+z");

    // Row 2: a couple of opposite sexes adds children from its own items.
    await select(["g2a", "g2b"]);
    await t.rightClick(t.person("g2a"));
    await t.click('[data-context-menu] button:text-is("Add children...")');
    const kidsBefore = (await ped()).parentOf.pp2.length;
    await t.click('[data-context-menu] button:has-text("daughters")');
    await t.sleep(200);
    t.equal((await ped()).parentOf.pp2.length, kidsBefore + 2, "row 2: the couple's Add children adds to that couple");
    await t.press("Control+z");

    // Row 3: twins from two selected siblings.
    await select(["g3a", "g3b"]);
    await item("g3a", "Dizygotic (fraternal)");
    t.equal((await ped()).partnerships.find(p => p.id === "pp2").twins?.[0]?.members?.sort(), ["g3a", "g3b"], "row 3: two selected siblings become twins");
    await select(["g3a", "g3b"]);
    await item("g3a", "Not twins");
    t.equal((await ped()).partnerships.find(p => p.id === "pp2").twins, undefined, "and Not twins takes them out");

    // Row 6: consultand, family history not known and adoption for several.
    await select(["g3a", "g3b"]);
    await item("g3a", "Mark 2 as consultands");
    await select(["g3a", "g3b"]);
    await item("g3a", "Family history not known for 2");
    await select(["g3a", "g3b"]);
    await t.rightClick(t.person("g3a"));
    await t.click('[data-context-menu] button:text-is("In")');
    const six = (await ped()).individuals.filter(i => ["g3a", "g3b"].includes(i.id));
    t.ok(six.every(i => i.consultand && i.familyHistoryUnknown && i.adopted === "in"), "row 6: consultand, family history not known and adoption apply to both");

    // Row 7: Select with ancestors.
    await t.press("Escape");
    await item("g3a", "Select with ancestors");
    const sel = await t.eval(() => [...window.__pededit.usePedigreeStore.getState().selectedIds].sort());
    t.ok(["g1f", "g1m", "g2a", "g3a"].every(x => sel.includes(x)) && !sel.includes("g3c"), "row 7: Select with ancestors selects the person and those above");

    // Rows 8 and 15: brother and sister, and disabled items with their reasons.
    await t.press("Escape");
    const kids3 = (await ped()).parentOf.pp3.length;
    await item("g3c", "Brother");
    const added = (await ped()).parentOf.pp3.filter(x => x !== "g3c");
    t.equal((await ped()).parentOf.pp3.length, kids3 + 1, "row 8: Add sibling: Brother adds to the sibship");
    t.equal((await t.individual(added[added.length - 1])).sex, "male", "a male sibling");
    await t.rightClick(t.person("g2b"));
    t.match(await disabledTitle("Sister"), /Add parents first/, "row 8: on a founder it is disabled and says why");
    t.match(await disabledTitle("Move left"), /No parents/, "row 15: Move left on a founder is disabled with its reason");
    await t.press("Escape");

    // Row 9: the pill's partner button.
    const couplesOfG2d = async () => (await ped()).partnerships.filter(p => [p.individual1, p.individual2].includes("g2d")).length;
    const before9 = await couplesOfG2d();
    await t.pill("g2d", "Add partner");
    t.equal(await couplesOfG2d(), before9 + 1, "row 9: the hover pill's Add partner adds a partner");
    await t.press("Control+z");

    // Row 10: Add existing child on someone with no partner.
    await t.click('button[title="Add male"]');
    const lone = (await t.eval(() => window.__pededit.usePedigreeStore.getState().selectedId));
    await t.press("Escape");
    await item(lone, "Add existing child...");
    t.match(await t.text('[data-testid="picking-banner"]'), /to be a child of/, "the banner asks for the child");
    await t.click(t.person("g3c"));
    await t.sleep(200);
    const pcId = await parentsOf("g3c");
    const pc = (await ped()).partnerships.find(p => p.id === pcId);
    t.ok(!!pc && [pc.individual1, pc.individual2].includes(lone), "row 10: Add existing child makes them this person's child, with a placeholder partner");
    await t.press("Control+z");
    await t.press("Control+z");

    // Row 4: Remove donor, saved.
    await item("g3c", "Add sperm donor");
    t.ok((await parentsOf("g3c")) !== "pp3", "a sperm donor replaces the father");
    await item("g3c", "Remove donor");
    t.equal(await parentsOf("g3c"), "pp3", "row 4: Remove donor makes the father the genetic parent again");
    t.equal((await t.individual("g3c")).socialParents, undefined, "and drops his social parent link");
    // Row 5: Remove surrogate.
    await item("g3c", "Add surrogate");
    t.ok(!!(await t.individual("g3c")).carriedBy, "a surrogate carries the child");
    await item("g3c", "Remove surrogate");
    t.equal((await t.individual("g3c")).carriedBy, undefined, "row 5: Remove surrogate clears it");

    // Row 13: Set parents for several, then detach them.
    await select(["g3a", "g3b"]);
    await item("g3a", "Set parents of 2...");
    t.match(await t.text('[data-testid="picking-banner"]'), /parents of the 2 selected/, "the banner says the parents are for both");
    await t.click(t.person("g2c"));
    await t.click(t.person("g2d"));
    await t.sleep(300);
    t.equal([await parentsOf("g3a"), await parentsOf("g3b")], ["pp3", "pp3"], "row 13: Set parents of 2 gives both the parents picked");
    await t.saved();
    await t.reload();
    const stored = (await t.stored(id)).data;
    t.equal([await parentsOf("g3a", stored), await parentsOf("g3b", stored), await parentsOf("g3c", stored)], ["pp3", "pp3", "pp3"], "rows 4 and 13 are saved");
    t.equal((await t.individual("g3c", stored)).carriedBy, undefined, "row 5 is saved");
    await select(["g3a", "g3b"]);
    await item("g3a", "Detach 2 from parents");
    t.equal([await parentsOf("g3a"), await parentsOf("g3b")], [undefined, undefined], "row 13: Detach 2 from parents");
    await t.press("Control+z");

    // Row 14: Unpin several.
    await t.eval(() => window.__pededit.usePedigreeStore.getState().pinIndividuals({ g1f: { x: 0, y: 0 }, g1m: { x: 120, y: 0 } }));
    await select(["g1f", "g1m"]);
    await item("g1f", "Unpin 2");
    t.equal(Object.keys((await ped()).pinnedPositions ?? {}), [], "row 14: Unpin 2 unpins both");

    // Row 11: the Person tab with several selected.
    await select(["g1f", "g1m"]);
    t.equal(await t.count('[data-selection-panel] [data-partner-row="pp1"]'), 1, "row 11: both partners selected, the panel shows the couple's fields");
    await t.click('[data-selection-panel] button:has-text("More for the 2")');
    t.match(await t.text('[role="dialog"], [data-radix-popper-content-wrapper]'), /2 selected/i, "and its More button opens the batch menu");
    await t.press("Escape");

    // Row 12: a couple block on one person's Person tab opens the couple's menu.
    await t.press("Escape");
    await t.click(t.person("g2a"));
    await t.click('[data-testid="partners-form"] [data-couple-more="pp2"]');
    t.match(await t.text("[data-radix-popper-content-wrapper]"), /Swap sides/, "row 12: the couple block's More opens the couple's menu");
    await t.press("Escape");
  },
};
