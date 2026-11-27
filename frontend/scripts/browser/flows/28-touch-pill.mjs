// On a touch screen too big for the phone sheet there is no hover, so a tap
// on a person opens the hover pill and it stays while they are selected.
export default {
  name: "touch-pill",
  about: "Tablet-sized touch screen: a tap opens the hover pill, a tap on the empty canvas closes it, selecting again without a tap leaves it shut",
  viewport: { width: 1180, height: 820 },
  device: { hasTouch: true },
  async run(t) {
    await t.openFixture("example:Three generations");
    const pills = () => t.eval(() => [...document.querySelectorAll('[data-testid="hover-pill"]')].filter(e => getComputedStyle(e).display !== "none").length);
    const selected = () => t.eval(() => window.__pededit.usePedigreeStore.getState().selectedIds);
    const tap = async box => { await t.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await t.sleep(400); };

    t.equal(await pills(), 0, "no pill before a tap");
    await tap(await t.page.locator('[data-individual-id="g2a"] svg').first().boundingBox());
    t.equal(await selected(), ["g2a"], "a tap selects the person");
    t.equal(await pills(), 1, "and opens their hover pill");
    const pane = await t.page.locator(".react-flow__pane").boundingBox();
    await tap({ x: pane.x + pane.width - 80, y: pane.y + 40, width: 0, height: 0 });
    t.equal(await selected(), [], "a tap on the empty canvas selects nobody");
    t.equal(await pills(), 0, "and closes the pill");
    await t.eval(() => window.__pededit.usePedigreeStore.getState().setSelectedId("g2a"));
    await t.sleep(300);
    t.equal(await pills(), 0, "selected again without a tap, the pill stays shut");
  },
};
