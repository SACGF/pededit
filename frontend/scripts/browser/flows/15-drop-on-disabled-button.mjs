// A drag let go over a disabled hover pill button still ends (#185).
// Browsers send no mouseup to a disabled button, only pointerup, and React
// Flow ends a drag on mouseup, so the person stayed stuck to the mouse and
// was never pinned. The pill moves with the person, so the mouse is over it
// only when the release comes before React has drawn the last move; the
// move and the release are sent together through CDP to make that certain.
export default {
  name: "drop-on-disabled-button",
  about: "A dragged person let go over a disabled hover pill button is dropped and pinned (#185)",
  async run(t) {
    await t.openFixture("example:Three generations");
    const node = '[data-individual-id="g3c"]';
    await t.hover(node);
    await t.click('button[title="Unlock to drag"]');
    const where = () => t.eval(() => {
      const n = window.__pededit.layout().people.find(n => n.individual.id === "g3c");
      return { x: Math.round(n.position.x), y: Math.round(n.position.y), pinned: n.isPinned };
    });
    const start = await where();

    const box = await t.page.locator(node).boundingBox();
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await t.page.mouse.move(from.x, from.y);
    await t.sleep(300);
    const addParents = 'button[title="Add parents"]';
    t.ok(await t.page.locator(addParents).isDisabled(), "Add parents on the hover pill is disabled (they have parents)");
    const btn = await t.page.locator(addParents).boundingBox();
    const to = { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 };

    const cdp = await t.page.context().newCDPSession(t.page);
    const send = (type, p, buttons) => cdp.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons, clickCount: 1 });
    await send("mousePressed", from, 1);
    await send("mouseMoved", { x: from.x + 2, y: from.y + 2 }, 1);
    await t.sleep(300);
    t.equal(await t.count(".react-flow__node.dragging"), 1, "pressing and moving starts a drag");
    // The jump onto the button and the release together: the release is handled before React draws the jump.
    await Promise.all([send("mouseMoved", to, 1), send("mouseReleased", to, 0)]);
    await t.sleep(500);

    t.equal(await t.count(".react-flow__node.dragging"), 0, "letting go over the disabled button ends the drag");
    const dropped = await where();
    t.ok(dropped.pinned && (dropped.x !== start.x || dropped.y !== start.y), "and pins the person where they were dropped");
    await t.page.mouse.move(from.x + 120, from.y + 60, { steps: 5 });
    await t.sleep(300);
    t.equal(await where(), dropped, "moving the mouse afterwards leaves them there");
    t.ok(!!(await t.pedigree()).pinnedPositions?.g3c, "the pin is in the pedigree");
  },
};
