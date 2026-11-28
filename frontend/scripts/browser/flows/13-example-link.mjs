// /example/<slug> (#150, #151): the link draws the example from the bundle
// and saves nothing until the visitor changes something. The first change
// saves one copy and the URL becomes its /p/<id>, keeping the undo history.
export default {
  name: "example-link",
  about: "/example/targaryen draws the example with no save, the first edit creates one copy at /p/<id> with undo kept, a failed create keeps the edits, an unknown slug goes home",
  async run(t) {
    await t.open("/");
    // Every write the browser sends to the pedigree API, whichever page sends it.
    let creates = 0, writes = 0;
    t.page.on("request", r => {
      const p = new URL(r.url()).pathname;
      if (!p.startsWith("/api/pedigrees/") || r.method() === "GET") return;
      writes++;
      if (r.method() === "POST" && p === "/api/pedigrees/") creates++;
    });

    const examples = await t.eval(() => window.__pededit.EXAMPLES.map(e => ({ slug: e.slug, label: e.label, people: e.data.individuals.length })));
    const hrefs = await t.eval(() => [...document.querySelectorAll('a[href^="/example/"]')].map(a => a.getAttribute("href")));
    t.equal(hrefs, examples.map(e => `/example/${e.slug}`), "each example on the landing page is a link to /example/<slug>");
    const targaryen = examples.find(e => e.slug === "targaryen");
    t.match(await t.text('a[href="/example/targaryen"]'), /House Targaryen/, "and /example/targaryen is the House Targaryen one");

    await t.click('a[href="/example/targaryen"]');
    await t.waitFor('button[title="Add male"]');
    await t.sleep(2500);
    t.equal(new URL(t.page.url()).pathname, "/example/targaryen", "following the link stays on the example's URL");
    t.equal(writes, 0, "and writes nothing to the server, even after the auto-save delay");
    t.equal(await t.people(), targaryen.people, "the editor draws the example's people");
    t.ok(await t.visible('[data-testid="example-notice"]'), "with a line saying the copy is saved on the first change");
    t.ok(await t.page.locator('button[title="Export as SVG, PNG or PDF"]').isEnabled(), "and exporting works before any save");

    await t.page.goBack();
    await t.sleep(800);
    t.equal(new URL(t.page.url()).pathname, "/", "Back returns to the landing page");
    t.equal(writes, 0, "having saved nothing");

    // The first edit makes the copy.
    await t.open("/example/targaryen");
    await t.waitFor('button[title="Add male"]');
    await t.click('button[title="Add male"]');
    await t.sleep(1500);
    const id = t.currentId();
    t.equal(creates, 1, "the first edit creates exactly one pedigree");
    t.equal(await t.count('[data-testid="example-notice"]'), 0, "and the example line goes");
    const stored = await t.stored(id);
    t.equal([stored.title, stored.data?.individuals?.length], [targaryen.label, targaryen.people + 1], "the server holds the example with the edit, under its name");
    t.equal(await t.undoDepth(), 1, "the undo history survives the change of URL");

    await t.click('button[title="Add female"]');
    await t.saved();
    t.equal(creates, 1, "a second edit saves to the same copy");
    t.equal((await t.stored(id)).data?.individuals?.length, targaryen.people + 2, "with both edits");

    await t.click('button[title="Undo"]');
    await t.click('button[title="Undo"]');
    t.equal(await t.people(), targaryen.people, "undo goes back past the first edit");
    await t.saved();
    t.equal((await t.stored(id)).data?.individuals?.length, targaryen.people, "and the undone state is saved");
    await t.click('button[title="Redo"]');
    await t.saved();

    await t.reload();
    t.equal(new URL(t.page.url()).pathname, `/p/${id}`, "a reload stays on the copy");
    t.equal(await t.people(), targaryen.people + 1, "and shows the edit");
    t.equal(creates, 1, "with no further copy");

    await t.open("/");
    await t.waitFor('[data-testid="recent-on-this-device"]');
    t.equal(await t.count(`[data-testid="recent-on-this-device"] button[title="/p/${id}"]`), 1, "the copy is listed under Recent on this device");

    // A create that fails keeps the edits on screen, stays on the example URL and is tried again.
    let refuse = true;
    await t.page.route("**/api/pedigrees/", route => {
      if (route.request().method() === "POST" && refuse) return route.fulfill({ status: 500, body: "" });
      return route.continue();
    });
    await t.open("/example/simple-family");
    await t.waitFor('button[title="Add male"]');
    const simple = examples.find(e => e.slug === "simple-family");
    await t.click('button[title="Add male"]');
    await t.waitFor('[data-testid="notice"]');
    t.match(await t.text('[data-testid="notice"]'), /Could not save your copy of the example.*tried again/, "a failed create says so");
    t.equal(new URL(t.page.url()).pathname, "/example/simple-family", "and stays on the example URL");
    t.equal(await t.people(), simple.people + 1, "with the edit still on screen");
    refuse = false;
    await t.sleep(11_000);
    t.match(new URL(t.page.url()).pathname, /^\/p\/[0-9a-f-]{36}$/, "the retry saves the copy once the server answers");
    const retried = t.currentId();
    t.equal((await t.stored(retried)).data?.individuals?.length, simple.people + 1, "with the edit");
    await t.page.unroute("**/api/pedigrees/");

    await t.open("/example/no-such-example");
    t.equal(new URL(t.page.url()).pathname, "/", "an unknown slug goes to the landing page");
    t.equal(await t.count('a[href="/example/targaryen"]'), 1, "which is drawn");
  },
};
