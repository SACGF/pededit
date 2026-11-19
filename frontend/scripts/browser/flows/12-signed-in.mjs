// Signed in (as the agent user): a new pedigree is listed under "Your
// pedigrees", can be renamed and deleted.
export default {
  name: "signed-in",
  asAgent: true,
  about: "Signed in, a new pedigree is listed under Your pedigrees, renamed from the sidebar and deleted from Settings, and signing out takes owned pedigrees off Recent",
  async run(t) {
    await t.open("/");
    t.ok(!!(await t.eval(() => localStorage.getItem("access_token"))), "the agent user is signed in");
    await t.click('button:has-text("Create blank pedigree")');
    await t.waitFor('button[title="Add male"]');
    const id = new URL(t.page.url()).pathname.split("/").pop();
    const token = await t.eval(() => localStorage.getItem("access_token"));
    const api = async (path, init = {}) => fetch(new URL(path, t.base), { ...init, headers: { Authorization: `Bearer ${token}` } });
    const listed = async () => (await (await api("/api/pedigrees/")).json()).map(p => [p.id, p.title]).filter(([pid]) => pid === id);
    t.equal((await listed()).length, 1, "the new pedigree belongs to the signed-in user");

    // The name is being edited straight after creating; type a new one.
    const name = `Flow test ${id.slice(0, 8)}`;
    if (!(await t.visible("aside input, nav input"))) await t.dblclick(`button:has-text("Untitled pedigree") >> nth=0`);
    await t.page.keyboard.press("Control+a");
    await t.page.keyboard.type(name);
    await t.press("Enter");
    t.equal(await listed(), [[id, name]], "renaming in the sidebar renames it on the server");

    await t.newTab();
    await t.open("/");
    // "Recent on this device" buttons carry the link as their title; signed in it leaves out the account's own (#210).
    const mine = `button:has-text("${name}"):not([title^="/p/"])`;
    await t.waitFor(mine);
    t.match(await t.text("body"), /Your pedigrees/i, "the home page has a Your pedigrees list");
    t.equal(await t.count(mine), 1, "with the pedigree under its new name");
    t.equal(await t.count(`[data-testid="recent-on-this-device"] button[title="/p/${id}"]`), 0, "and not under Recent on this device, which leaves out the account's own");
    t.ok(await t.eval(id => JSON.parse(localStorage.getItem("recentPedigrees") ?? "[]").some(p => p.id === id), id), "though this browser still keeps it in its recent list");
    await t.click(mine);
    await t.waitFor('button[title="Add male"]');
    t.equal(new URL(t.page.url()).pathname, `/p/${id}`, "which opens it");

    await t.click('button[title="Pedigree settings"]');
    await t.click('button:has-text("Delete this pedigree")');
    await t.click('button:text-is("Delete permanently")');
    await t.sleep(500);
    t.equal(await listed(), [], "deleting it from Settings removes it from the server");
    // It moves on to the user's next pedigree, or home when that was the last.
    t.ok(new URL(t.page.url()).pathname !== `/p/${id}`, "and leaves its page");
    await t.open("/");
    await t.sleep(500);
    t.equal(await t.count(`button:has-text("${name}")`), 0, "the home page no longer lists it, under Your pedigrees or Recent");
    t.equal((await fetch(new URL(`/api/pedigrees/${id}/`, t.base))).status, 404, "its link no longer works");

    // An example's first edit gives a signed-in visitor a copy they own (#150, #151).
    await t.open("/example/simple-family");
    await t.waitFor('button[title="Add male"]');
    await t.click('button[title="Add male"]');
    await t.sleep(1500);
    const copy = new URL(t.page.url()).pathname.split("/").pop();
    const mineNow = (await (await api("/api/pedigrees/")).json()).filter(p => p.id === copy).map(p => p.title);
    t.equal(mineNow, ["Simple family"], "an edited example is saved as a copy that belongs to the signed-in user");

    // Signed in, Recent on this device lists only what the account does not
    // own, under Your pedigrees (#210). Signing out takes the account's
    // pedigrees off it (their links no longer open) and leaves the others (#187).
    const other = "00000000-0000-4000-8000-000000000187";
    await t.eval(other => {
      const list = JSON.parse(localStorage.getItem("recentPedigrees") ?? "[]");
      localStorage.setItem("recentPedigrees", JSON.stringify([...list, { id: other, title: "Made signed out", openedAt: new Date().toISOString() }]));
    }, other);
    await t.open("/");
    const recent = pid => t.count(`[data-testid="recent-on-this-device"] button[title="/p/${pid}"]`);
    const stored = pid => t.eval(pid => JSON.parse(localStorage.getItem("recentPedigrees") ?? "[]").some(p => p.id === pid), pid);
    await t.waitFor(`[data-testid="recent-on-this-device"] button[title="/p/${other}"]`);
    t.equal([await recent(copy), await recent(other)], [0, 1], "signed in, Recent on this device lists the other pedigree and not the owned copy");
    t.ok(await t.eval(() => {
      const mineList = document.querySelector('[data-testid="your-pedigrees"]');
      const recentList = document.querySelector('[data-testid="recent-on-this-device"]');
      return !!mineList && !!recentList && !!(mineList.compareDocumentPosition(recentList) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), "Your pedigrees is above Recent on this device");
    await t.click('button:text-is("Sign out")');
    await t.sleep(800);
    t.ok(!(await t.eval(() => localStorage.getItem("access_token"))), "Sign out signs out");
    await t.open("/");
    await t.sleep(300);
    t.equal([await recent(copy), await recent(other)], [0, 1], "signed out, Recent on this device still lists the other and not the account's pedigree");
    t.equal([await stored(copy), await stored(other)], [false, true], "signing out takes the account's pedigree off this browser's recent list and keeps the other");
    await api(`/api/pedigrees/${copy}/`, { method: "DELETE" });
  },
};
