// Export a figure of the selected people only: the tickbox in the export
// dialog, who it adds to join them, and the file it writes.
import { readFileSync } from "node:fs";

export default {
  name: "export-selected",
  about: "With two people selected, \"Only the 2 selected people (+2 to connect them)\" exports an SVG of them and their parents only; off by default, nothing saved",
  async run(t) {
    await t.openFixture("fixture:text");
    const box = '[data-testid="export-only-selected"]';
    const openDialog = () => t.click('button[title="Export as SVG or PNG"]');
    const cancel = () => t.click('[role="dialog"] button:has-text("Cancel")');
    const before = await t.pedigree();

    await openDialog();
    t.equal(await t.count(box), 0, "with nobody selected the dialog has no tickbox");
    await cancel();
    await t.click(t.person("k2"));
    await openDialog();
    t.equal(await t.count(box), 0, "nor with one person selected");
    await cancel();

    // Xavier and Yolanda, two of Rupert and Persephone's four children.
    await t.holding("Shift", () => t.click(t.person("k3")));
    await openDialog();
    t.match(await t.text('[role="dialog"]'), /Only the 2 selected people \(\+2 to connect them\)/, "two siblings selected: the tickbox counts them and their two parents");
    t.equal(await t.eval(sel => document.querySelector(sel).checked, box), false, "it is off by default");
    const whole = readFileSync(await t.download('[role="dialog"] button:has-text("Download")'), "utf8");
    for (const name of ["Wilhelmina", "Xavier", "Ottoline", "Sorrel"]) t.ok(whole.includes(name), `unticked: the file has everyone (${name})`);

    await openDialog();
    await t.click(`label:has(${box})`);
    const svg = readFileSync(await t.download('[role="dialog"] button:has-text("Download")'), "utf8");
    for (const name of ["Xavier", "Yolanda", "Rupert", "Persephone"]) t.ok(svg.includes(name), `ticked: the file has ${name}`);
    for (const name of ["Wilhelmina", "Zebedee", "Ottoline", "Bartholomew", "Sorrel", "Tamsin"]) t.ok(!svg.includes(name), `ticked: the file has no ${name}`);
    t.match(svg, /class="pedigree-key"[\s\S]*Multiple sclerosis/, "the key lists the condition Persephone has");
    t.notMatch(svg, /Genotype/, "and not the tag only people left out have");
    const findings = await t.eval(async text => {
      const { lintExportSvg } = await import("/src/io/svg/exportLint.ts");
      const { selectionSubset, selectionPedigree } = await import("/src/pedigree/selectionSubset.ts");
      const p = window.__pededit.pedigree();
      const part = selectionPedigree(p, selectionSubset(p, ["k2", "k3"]));
      return lintExportSvg(part, window.__pededit.layout(part, { compact: false }), text).map(f => f.code);
    }, svg);
    t.equal(findings, [], "the file passes the export lint for those four people");

    await openDialog();
    t.equal(await t.eval(sel => document.querySelector(sel).checked, box), false, "opened again, the tickbox is off");
    await t.click(`label:has(${box})`);
    await t.click('[role="dialog"] label:has-text("Render in U shape")');
    const ushape = readFileSync(await t.download('[role="dialog"] button:has-text("Download")'), "utf8");
    t.match(ushape, /Yolanda/, "U-shape: the selected people");
    t.notMatch(ushape, /Wilhelmina|Ottoline/, "U-shape: nobody else");
    await openDialog();
    await t.click('[role="dialog"] label:has-text("Render in U shape")');
    await cancel();

    t.equal(await t.pedigree(), before, "the pedigree is unchanged");
    t.equal((await t.drawn()).sort(), before.individuals.map(i => i.id).sort(), "and the canvas still draws everyone");
    const csv = readFileSync(await t.download('button[title="Export as CSV file"]'), "utf8");
    t.equal(csv.trim().split("\n").length, before.individuals.length + 1, "CSV keeps everyone with people selected");
  },
};
