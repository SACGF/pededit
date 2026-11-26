// Import a PED file, a Phenopackets family and a JSON file by upload and land on the canvas with the
// right people.
import { readFileSync } from "node:fs";

export default {
  name: "imports",
  about: "A PED file, a Phenopackets family and a JSON file imported by upload open on the canvas with the right number of people; a bad file is refused",
  async run(t) {
    const importFile = async file => {
      await t.open("/");
      await t.click('button:has-text("Import from PED or JSON file")');
      await t.upload('[role="dialog"] input[type="file"]', file);
    };

    await importFile(t.file("test-data/ped/simple/three_generation.ped"));
    const lines = readFileSync(t.file("test-data/ped/simple/three_generation.ped"), "utf8").split("\n").filter(l => l.trim() && !l.startsWith("#")).length;
    await t.click('[role="dialog"] button:has-text("Import")');
    await t.waitFor('button[title="Add male"]');
    t.currentId();
    let p = await t.pedigree();
    t.equal(p.individuals.length, lines, "PED: one person for each line of the file");
    t.equal(p.canvasSettings?.notation, "nsgc2022", "PED: an import is drawn in the current notation");
    t.equal((await t.drawn()).length, lines, "PED: everyone is drawn");
    t.equal(await t.eval(() => window.__pededit.check().map(f => f.code)), [], "PED: the drawing passes the render lint");
    t.ok(p.individuals.every(i => !!i.name), "PED: the file's ids become the names");

    // A Phenopackets Family: only its pedigree is read, recognised by content.
    await importFile(t.file("test-data/phenopackets/family.json"));
    t.match(await t.text('[role="dialog"]'), /Only the family's pedigree is read/, "Phenopackets: says the rest of the Family is not read");
    await t.click('[role="dialog"] button:has-text("Import")');
    await t.waitFor('button[title="Add male"]');
    t.currentId();
    p = await t.pedigree();
    const persons = JSON.parse(readFileSync(t.file("test-data/phenopackets/family.json"), "utf8")).pedigree.persons;
    const named = p.individuals.filter(i => i.name);
    t.equal(named.map(i => i.name).sort(), persons.map(x => x.individualId).sort(), "Phenopackets: one named person for each person in the file");
    t.equal(named.find(i => i.name === "Ines")?.sex, "female", "Phenopackets: FEMALE is female");
    t.equal(named.find(i => i.name === "Kit")?.sex, "unknown", "Phenopackets: UNKNOWN_SEX is unknown");
    t.ok(named.find(i => i.name === "Greta")?.affected, "Phenopackets: AFFECTED is affected");
    t.equal((await t.drawn()).length, p.individuals.length, "Phenopackets: everyone is drawn");
    t.equal(await t.eval(() => window.__pededit.check().map(f => f.code)), [], "Phenopackets: the drawing passes the render lint");

    // The lossless format: what comes in is exactly what the file holds.
    const file = t.file("test-data/pedigrees/drawn/couples.json");
    const want = JSON.parse(readFileSync(file, "utf8"));
    await importFile(file);
    await t.click('[role="dialog"] button:has-text("Import")');
    await t.waitFor('button[title="Add male"]');
    const id = t.currentId();
    p = await t.pedigree();
    t.equal(p, want.pedigree, "JSON: the pedigree in the editor is the one in the file");
    t.equal((await t.stored(id)).title, want.title, "JSON: with the file's title");
    t.equal((await t.stored(id)).data, want.pedigree, "JSON: and the server holds the same");
    t.ok((await t.count("[data-adopted]")) > 0, "JSON: what PED cannot carry is drawn (adoption brackets)");

    // A file that must not import says why and offers nothing to import.
    await importFile(t.file("test-data/pedigrees/refused/circular-ancestry.json"));
    t.match(await t.text('[role="dialog"]'), /Circular ancestry/, "a refused file says what is wrong with it");
    t.ok(await t.eval(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === "Import")?.disabled ?? true), "and cannot be imported");
  },
};
