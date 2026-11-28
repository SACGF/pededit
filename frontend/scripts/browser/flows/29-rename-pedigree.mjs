// Rename a pedigree from the Pedigree tab (#247), signed out: the name is
// saved, kept after a reload, listed under "Recent on this device", drawn
// as the chart title until that is edited and used for export file names.
// On an example the rename is the first edit and saves the visitor's copy.
export default {
  name: "rename-pedigree",
  about: "Signed out, the Pedigree tab's Name renames the pedigree: saved, kept after a reload, shown under Recent on this device, as the chart title and in export file names; renaming an example saves the copy under the new name",
  async run(t) {
    await t.open("/");
    t.equal(await t.eval(() => localStorage.getItem("access_token")), null, "nobody is signed in");
    const id = await t.createBlank();
    await t.click('button[title="Add female"]');
    await t.press("Escape");
    const nameBox = 'input[aria-label="Pedigree name"]';
    t.equal(await t.eval(sel => document.querySelector(sel)?.value, nameBox), "Untitled pedigree", "the Pedigree tab shows the name");
    await t.fill(nameBox, "Okafor family");
    await t.press("Enter");
    await t.sleep(500);
    t.equal((await t.stored(id)).title, "Okafor family", "the server has the new name");
    t.equal(await t.eval(() => document.querySelector('input[aria-label="Chart title"]')?.value), "Okafor family", "the chart title follows the name");
    await t.click('button[title="Export as SVG, PNG or PDF"]');
    const file = await t.download('[role="dialog"] button:has-text("Download")');
    if (await t.visible('[role="dialog"]')) await t.click('[role="dialog"] button:has-text("Cancel")');
    t.match(file, /Okafor family\.svg$/, "the export file is named after it");

    await t.reload();
    await t.press("Escape");
    t.equal(await t.eval(sel => document.querySelector(sel)?.value, nameBox), "Okafor family", "after a reload the name is kept");
    await t.open("/");
    await t.waitFor('[data-testid="recent-on-this-device"]');
    t.match(await t.text(`[data-testid="recent-on-this-device"] button[title="/p/${id}"]`), /Okafor family/, "Recent on this device lists the new name");

    // A blank name changes nothing.
    await t.open(`/p/${id}`);
    await t.waitFor(nameBox);
    await t.fill(nameBox, "  ");
    await t.press("Enter");
    await t.sleep(300);
    t.equal(await t.eval(sel => document.querySelector(sel)?.value, nameBox), "Okafor family", "a blank name goes back");
    t.equal((await t.stored(id)).title, "Okafor family", "and is not saved");

    // An example: the rename saves the copy, under the new name.
    await t.open("/example/simple-family");
    await t.waitFor(nameBox);
    await t.fill(nameBox, "My practice family");
    await t.press("Enter");
    await t.page.waitForURL(/\/p\/[0-9a-f-]+$/, { timeout: 5000 });
    const copy = t.currentId();
    t.ok(!!copy, "renaming an example saves the copy and the URL becomes its link");
    t.equal((await t.stored(copy)).title, "My practice family", "under the new name");
  },
};
