// Create while signed out, come back by the /p/<id> link, find the
// pedigree under "Recent on this device", and delete it.
export default {
  name: "anonymous-link",
  about: "A pedigree made while signed out is reached again by its link, listed under Recent on this device and deleted from Settings",
  async run(t) {
    await t.open("/");
    t.equal(await t.eval(() => localStorage.getItem("access_token")), null, "nobody is signed in");
    await t.click('button:has-text("Create blank pedigree")');
    await t.waitFor('button[title="Add female"]');
    const id = t.currentId();
    await t.click('button[title="Add female"]');
    await t.fill('input[aria-label="Name"]', "Linnea");
    await t.press("Tab");
    await t.saved();
    const stored = await t.stored(id);
    t.equal(stored.data?.individuals?.map(i => i.name), ["Linnea"], "the server holds the pedigree with no account");

    // The link is the only key: a new tab that knows nothing else opens it.
    await t.newTab();
    await t.open(`/p/${id}`);
    t.equal((await t.pedigree()).individuals.map(i => i.name), ["Linnea"], "the link opens the same pedigree");

    await t.open("/");
    await t.waitFor('[data-testid="recent-on-this-device"]');
    t.equal(await t.count(`[data-testid="recent-on-this-device"] button[title="/p/${id}"]`), 1, "it is listed under Recent on this device");
    await t.click(`[data-testid="recent-on-this-device"] button[title="/p/${id}"]`);
    await t.waitFor('button[title="Add female"]');
    t.equal(t.currentId(), id, "and the list opens it");
    t.equal(await t.people(), 1, "with the person in it");

    // Deleting needs no account either, as /your-data says (#178).
    await t.click('button[title="Pedigree settings"]');
    await t.click('button:has-text("Delete this pedigree")');
    await t.click('button:text-is("Delete permanently")');
    await t.sleep(500);
    t.equal((await fetch(new URL(`/api/pedigrees/${id}/`, t.base))).status, 404, "deleting it from Settings while signed out removes it from the server");
    await t.open("/");
    await t.sleep(500);
    t.equal(await t.count(`[data-testid="recent-on-this-device"] button[title="/p/${id}"]`), 0, "and from Recent on this device");
    await t.open("/your-data");
    await t.sleep(500);
    t.match(await t.text('[data-testid="your-data"]'), /No account is needed/, "/your-data says how to delete it");
  },
};
