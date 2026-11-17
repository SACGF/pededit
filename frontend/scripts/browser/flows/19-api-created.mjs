import fs from "node:fs";

// A pedigree made by a script (#201): the curl example of
// docs/pedigree-json-format.md is posted as written, with no account, and its
// /p/<id> link opens in the editor, laid out there. A pedigree whose
// references are broken is refused with the path instead of becoming a link
// the editor cannot draw.
export default {
  name: "api-created",
  about: "The documented API example, posted with no account, opens at /p/<id> drawn in NSGC 2022 and can be edited and saved; a pedigree with a broken reference is refused with its path",
  async run(t) {
    const doc = fs.readFileSync(t.file("docs/pedigree-json-format.md"), "utf8");
    const section = doc.slice(doc.indexOf("## Creating a pedigree through the API"));
    const start = section.indexOf("-d '") + 4;
    const body = JSON.parse(section.slice(start, section.indexOf("\n'", start)));
    const post = payload => fetch(new URL("/api/pedigrees/", t.base), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });

    const res = await post(body);
    t.equal(res.status, 201, "the documented example is accepted with no account");
    const { id } = await res.json();
    t.created.push(id);

    await t.open(`/p/${id}`);
    await t.waitFor('[data-individual-id="i3"]');
    t.equal((await t.drawn()).sort(), ["i1", "i2", "i3", "i4"], "its link draws all four people, though no positions were sent");
    t.equal(await t.count('[data-partnership-id="p1"]') > 0, true, "with the couple line");
    t.equal((await t.pedigree()).canvasSettings.notation, "nsgc2022", "in the NSGC 2022 style it asked for");

    // The editor fills in what the caller left out and saves as usual.
    await t.click('[data-individual-id="i4"]');
    await t.fill('input[aria-label="Name"]', "Edited");
    await t.press("Tab");
    await t.saved();
    const stored = (await t.stored(id)).data;
    t.equal(stored.individuals.find(i => i.id === "i4").name, "Edited", "an edit in the editor is saved to the same pedigree");
    t.equal(stored.individuals.length, 4, "with everyone still there");

    const broken = structuredClone(body);
    broken.data.partnerships[0].individual2 = "nobody";
    const refused = await post(broken);
    t.equal(refused.status, 400, "a partnership naming someone who does not exist is refused");
    t.match((await refused.json()).data.join(" "), /^partnerships\[0\]\.individual2: /, "with a reason that starts with the path");
  },
};
