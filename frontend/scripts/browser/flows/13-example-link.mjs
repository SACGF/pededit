// /example/<slug> (#150): the link opens an example as the visitor's own
// copy, one new pedigree per visit, and the landing page's examples are
// links to the same URLs.
export default {
  name: "example-link",
  about: "/example/targaryen opens the example as a new pedigree on each visit, Back makes no extra copy, an unknown slug goes to the landing page",
  async run(t) {
    await t.open("/");
    // Every pedigree the browser asks the server to create, whichever page asks.
    let creates = 0;
    t.page.on("request", r => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/pedigrees/") creates++; });

    const examples = await t.eval(() => window.__pededit.EXAMPLES.map(e => ({ slug: e.slug, label: e.label, people: e.data.individuals.length })));
    const hrefs = await t.eval(() => [...document.querySelectorAll('a[href^="/example/"]')].map(a => a.getAttribute("href")));
    t.equal(hrefs, examples.map(e => `/example/${e.slug}`), "each example on the landing page is a link to /example/<slug>");
    const targaryen = examples.find(e => e.slug === "targaryen");
    t.match(await t.text('a[href="/example/targaryen"]'), /House Targaryen/, "and /example/targaryen is the House Targaryen one");

    await t.click('a[href="/example/targaryen"]');
    await t.waitFor('button[title="Add male"]');
    const first = t.currentId();
    t.equal(creates, 1, "following the link creates one pedigree");
    t.equal(await t.people(), targaryen.people, "the editor opens with the example's people");
    const stored = await t.stored(first);
    t.equal([stored.title, stored.data?.individuals?.length], [targaryen.label, targaryen.people], "and the server holds it under the example's name");

    await t.page.goBack();
    await t.sleep(1500);
    t.equal(new URL(t.page.url()).pathname, "/", "Back from the editor returns to the landing page, not the example link");
    t.equal(creates, 1, "and creates nothing");

    // A second visit, this time by the URL itself, as from a link in a post.
    await t.open("/example/targaryen");
    await t.waitFor('button[title="Add male"]');
    const second = t.currentId();
    t.ok(second !== first, "a second visit opens a different pedigree");
    t.equal(creates, 2, "having created one more");
    t.equal(await t.people(), targaryen.people, "with the example's people");
    t.equal((await t.stored(first)).data?.individuals?.length, targaryen.people, "and the first copy is untouched");

    await t.page.goBack();
    await t.sleep(1500);
    t.equal(new URL(t.page.url()).pathname, "/", "Back from that one skips the example link too");
    t.equal(creates, 2, "so there is no third copy");

    await t.open("/example/no-such-example");
    t.equal(new URL(t.page.url()).pathname, "/", "an unknown slug goes to the landing page");
    t.equal(await t.count('a[href="/example/targaryen"]'), 1, "which is drawn");
    t.equal(creates, 2, "and nothing is created");
  },
};
