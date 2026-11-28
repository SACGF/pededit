// Notes under the symbol (#219): drawn unless "Show notes on the chart" is
// off, in the canvas and the SVG export alike, in a de-identified one only
// with "Include notes" ticked (#242),
// in full with the next generation moved down to make room, or cut at two
// lines with Notes "Up to two lines"; the settings are saved. The text
// fixture turns the notes off, so the flow starts from the hidden state.
import { readFileSync } from "node:fs";

export default {
  name: "notes-on-chart",
  about: "With Show notes on the chart off the export dialog says notes are not drawn; turned on, a person's notes are under their symbol on the canvas and in the SVG, not in a de-identified SVG unless Include notes is ticked, with a warning; a long note is drawn in full clear of the children's symbols, and cut at two lines with Notes Up to two lines; the settings are there after a reload",
  async run(t) {
    const id = await t.openFixture("fixture:text");
    const note = "Notes are hidden here.";
    t.equal((await t.individual("gf")).notes, note, "Bartholomew has a note");
    const detail = () => t.eval(() => [...document.querySelectorAll('[data-individual-id="gf"] [data-detail-label] text')].map(e => e.textContent).join(" "));
    const exportSvg = async (options = []) => {
      await t.click(await t.exportMenu("Export as SVG, PNG or PDF"));
      for (const label of options) await t.click(`[role="dialog"] label:has-text("${label}")`);
      const svg = readFileSync(await t.download('[role="dialog"] button:has-text("Download")'), "utf8");
      if (await t.visible('[role="dialog"]')) await t.click('[role="dialog"] button:has-text("Cancel")');
      return svg;
    };

    t.notMatch(await detail(), /Notes/, "turned off: the note is not drawn on the canvas");
    await t.click(await t.exportMenu("Export as SVG, PNG or PDF"));
    t.match(await t.text('[data-testid="export-notes-hint"]'), /Notes are not drawn; turn on Show notes on the chart in Settings/, "the export dialog says how to draw them");
    await t.click('[role="dialog"] label:has-text("De-identify")');
    t.equal(await t.count('[data-testid="export-notes-hint"]'), 1, "and still does with De-identify ticked");
    t.equal(await t.count('[data-testid="deidentify-keep-notes"]'), 0, "with no Include notes box while notes are not drawn");
    await t.click('[role="dialog"] label:has-text("De-identify")');
    await t.click('[role="dialog"] button:has-text("Cancel")');
    t.notMatch(await exportSvg(), /Notes are/, "nor in the SVG");

    await t.click('button[title="Pedigree settings"]');
    await t.click('label:has(input[name="showNotes"])');
    await t.press("Escape");
    t.equal((await t.pedigree()).canvasSettings.showNotes, true, "the setting turns on");
    t.match(await detail(), /Notes are hidden/, "the note is drawn under the symbol on the canvas");
    const svg = await exportSvg();
    t.match(svg, /Notes are[\s\S]*hidden here\./, "and in the SVG");
    await t.click(await t.exportMenu("Export as SVG, PNG or PDF"));
    t.equal(await t.count('[data-testid="export-notes-hint"]'), 0, "the dialog's hint is gone");
    await t.click('[role="dialog"] button:has-text("Cancel")');
    const findings = await t.eval(async text => {
      const { lintExportSvg } = await import("/src/io/svg/exportLint.ts");
      const p = window.__pededit.pedigree();
      return lintExportSvg(p, window.__pededit.layout(p, { compact: false }), text).map(f => f.code);
    }, svg);
    t.equal(findings, [], "the SVG passes the export lint");
    t.notMatch(await exportSvg(["De-identify"]), /Notes are/, "a de-identified SVG has no notes by default");
    // The dialog keeps De-identify ticked; Include notes draws them, with a warning.
    const name = (await t.individual("gf")).name;
    await t.click(await t.exportMenu("Export as SVG, PNG or PDF"));
    t.equal(await t.eval(() => document.querySelector('[data-testid="deidentify-keep-notes"]').checked), false, "Include notes is offered, unticked");
    t.equal(await t.count('[data-testid="export-notes-warning"]'), 0, "with no warning");
    await t.click('[data-testid="deidentify-keep-notes"]');
    t.match(await t.text('[data-testid="export-notes-warning"]'), /Notes are free text: check them for names and dates before sharing/, "ticked, it warns");
    const keptSvg = readFileSync(await t.download('[role="dialog"] button:has-text("Download")'), "utf8");
    if (await t.visible('[role="dialog"]')) await t.click('[role="dialog"] button:has-text("Cancel")');
    t.match(keptSvg, /Notes are[\s\S]*hidden here\./, "the de-identified SVG has the notes");
    t.notMatch(keptSvg, new RegExp(name), "and still no names");
    await t.click(await t.exportMenu("Export as SVG, PNG or PDF"));
    t.equal(await t.eval(() => document.querySelector('[data-testid="deidentify-keep-notes"]').checked), false, "reopened, Include notes is unticked again");
    await t.click('[role="dialog"] label:has-text("De-identify")');
    await t.click('[role="dialog"] button:has-text("Cancel")');

    // A long note: in full by default, then cut at two lines.
    const long = "Records held at the regional hospital; cause of death not confirmed by post mortem";
    await t.click('[data-individual-id="gf"]');
    await t.fill('textarea[aria-label="Notes"]', long);
    await t.press("Tab");
    await t.press("Escape");
    t.match(await detail(), /confirmed[\s\S]*post mortem/, "the whole note is drawn on the canvas");
    const clear = () => t.eval(() => {
      const text = document.querySelector('[data-individual-id="gf"] [data-detail-label]').getBoundingClientRect();
      const child = document.querySelector('[data-individual-id="m"] svg').getBoundingClientRect();
      return text.bottom < child.top;
    });
    t.ok(await clear(), "and the row below has moved down clear of it");
    const full = await exportSvg();
    t.match(full, />post mortem<|>post<[\s\S]*>mortem</, "the SVG has the whole note");
    const fullFindings = await t.eval(async text => {
      const { lintExportSvg } = await import("/src/io/svg/exportLint.ts");
      const p = window.__pededit.pedigree();
      return lintExportSvg(p, window.__pededit.layout(p, { compact: false }), text).map(f => f.code);
    }, full);
    t.equal(fullFindings, [], "and passes the export lint");

    await t.click('button[title="Pedigree settings"]');
    t.equal(await t.eval(() => document.querySelector('select[name="notesLength"]').value), "full", "Notes says full text");
    await t.select('select[name="notesLength"]', "Up to two lines");
    await t.press("Escape");
    t.equal((await t.pedigree()).canvasSettings.notesLength, "twoLines", "Notes turns to up to two lines");
    t.notMatch(await exportSvg(), /post mortem/, "a long note is cut at two lines in the SVG");
    t.notMatch(await detail(), /post mortem/, "and on the canvas");

    await t.reload();
    t.equal((await t.stored(id)).data.canvasSettings.showNotes, true, "the setting is saved");
    t.equal((await t.stored(id)).data.canvasSettings.notesLength, "twoLines", "and so is Notes");
    t.match(await detail(), /Records held/, "the note is drawn after a reload");
    t.notMatch(await detail(), /post mortem/, "still cut at two lines");
  },
};
