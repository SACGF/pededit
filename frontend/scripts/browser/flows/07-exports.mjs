// Download every export and read the file: SVG, PNG, PDF, U-shape and
// de-identified from the dialog; CSV, PED and JSON from the toolbar.
import { readFileSync } from "node:fs";

export default {
  name: "exports",
  about: "Every export downloads a non-empty file of the right type; the SVG passes the export lint; de-identified has no names, ids or childless reason",
  async run(t) {
    await t.openFixture("fixture:text");
    const dialogDownload = async options => {
      await t.click('button[title="Export as SVG or PNG"]');
      for (const label of options) await t.click(`[role="dialog"] label:has-text("${label}")`);
      const file = await t.download('[role="dialog"] button:has-text("Download")');
      if (await t.visible('[role="dialog"]')) await t.click('[role="dialog"] button:has-text("Cancel")');
      return file;
    };
    const names = (await t.pedigree()).individuals.map(i => i.name).filter(Boolean);
    t.ok(names.length > 8, "the pedigree has named people");

    const svgFile = await dialogDownload(["SVG"]);
    const svg = readFileSync(svgFile, "utf8");
    t.match(svgFile, /\.svg$/, "SVG: the file is .svg");
    t.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "SVG: it is an SVG document");
    t.match(svg, /Wilhelmina/, "SVG: it has the names");
    t.match(svg, /class="pedigree-key"/, "SVG: it has the key");
    const findings = await t.eval(async text => {
      const { lintExportSvg } = await import("/src/io/svg/exportLint.ts");
      const p = window.__pededit.pedigree();
      return lintExportSvg(p, window.__pededit.layout(p, { compact: false }), text).map(f => f.code);
    }, svg);
    t.equal(findings, [], "SVG: the downloaded file passes the export lint");

    const png = readFileSync(await dialogDownload(["PNG"]));
    t.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "PNG: the file starts with the PNG signature");
    t.ok(png.includes(Buffer.from("pHYs")), "PNG: it records its resolution (pHYs)");
    t.ok(png.length > 20_000, `PNG: it is not empty (${png.length} bytes)`);

    const pdf = readFileSync(await dialogDownload(["PDF"]));
    t.equal(pdf.subarray(0, 5).toString(), "%PDF-", "PDF: the file starts with %PDF-");
    t.ok(pdf.length > 5_000, `PDF: it is not empty (${pdf.length} bytes)`);

    const ushape = readFileSync(await dialogDownload(["SVG", "Render in U shape"]), "utf8");
    t.match(ushape, /^<svg /, "U-shape: an SVG document");
    t.ok(ushape !== svg, "U-shape: not the standard drawing");
    t.match(ushape, /rotate\(/, "U-shape: symbols turned along the track");
    await t.click('button[title="Export as SVG or PNG"]');
    await t.click('[role="dialog"] label:has-text("Render in U shape")');
    await t.click('[role="dialog"] button:has-text("Cancel")');

    const anon = readFileSync(await dialogDownload(["SVG", "De-identify"]), "utf8");
    for (const name of names) t.ok(!anon.includes(name.split(" ")[0]), `de-identified: no "${name.split(" ")[0]}"`);
    t.match(anon, />II-2</, "de-identified: pedigree numbers in place of names");
    t.notMatch(anon, /1985|1931|Cornish|Counsellor/, "de-identified: no dates of birth and no clinical details");

    // #225: a PED import makes the file's IDs the ids, so no export writes them.
    const ids = (await t.pedigree()).individuals.map(i => i.id);
    // The dialog keeps its choices while the page is open, so De-identify is still on.
    const anonU = readFileSync(await dialogDownload(["SVG", "Render in U shape"]), "utf8");
    t.match(anonU, /rotate\(/, "de-identified U-shape: the U is drawn");
    t.notMatch(anonU, /data-id=|data-dup-of=/, "de-identified U-shape: no person ids");
    t.ok(ids.every(id => !anonU.includes(`"${id}"`)), "de-identified U-shape: no id in any attribute");
    for (const name of names) t.ok(!anonU.includes(name.split(" ")[0]), `de-identified U-shape: no "${name.split(" ")[0]}"`);
    t.notMatch(readFileSync(await dialogDownload(["SVG", "De-identify"]), "utf8"), /data-id=|data-dup-of=/, "U-shape: no person ids");
    await t.click('button[title="Export as SVG or PNG"]');
    await t.click('[role="dialog"] label:has-text("Render in U shape")');
    await t.click('[role="dialog"] button:has-text("Cancel")');

    const csv = readFileSync(await t.download('button[title="Export as CSV file"]'), "utf8");
    const rows = csv.trim().split("\n");
    t.equal(rows.length, (await t.people()) + 1, "CSV: a header and one row a person");
    t.match(rows[0], /pedigree_number/, "CSV: the pedigree_number column");
    t.match(csv, /Wilhelmina/, "CSV: the names");

    const json = JSON.parse(readFileSync(await t.download('button[title^="Download as JSON"]'), "utf8"));
    t.equal(json.format, "pededit-pedigree", "JSON: the envelope");
    t.equal(json.pedigree, await t.pedigree(), "JSON: the whole pedigree, unchanged");

    // PED cannot carry the stillbirth or the adoption, so it warns first.
    await t.click('button[title^="Export as PED file"]');
    if (await t.visible('[data-radix-popper-content-wrapper]')) await t.click('[data-radix-popper-content-wrapper] button >> nth=0');
    t.match(await t.text('[role="dialog"]'), /cannot|not carr|lost|drop/i, "PED: a warning says what the format cannot carry");
    const ped = readFileSync(await t.download('[role="dialog"] button:has-text("Export PED anyway")'), "utf8");
    const lines = ped.trim().split("\n").filter(l => !l.startsWith("#"));
    t.equal(lines.length, await t.people(), "PED: one line a person");
    t.ok(lines.every(l => l.split(/\s+/).length === 6), "PED: six columns");

    // #225: a couple's childless reason is free text, dropped unless asked for.
    await t.openFixture("fixture:couples");
    t.match(readFileSync(await dialogDownload(["SVG"]), "utf8"), /azoospermia/, "childless reason: drawn in the plain export");
    t.notMatch(readFileSync(await dialogDownload(["SVG", "De-identify"]), "utf8"), /azoospermia/, "childless reason: dropped when de-identified");
    t.match(readFileSync(await dialogDownload(["Include the reason under"]), "utf8"), /azoospermia/, "childless reason: kept when ticked");
  },
};
