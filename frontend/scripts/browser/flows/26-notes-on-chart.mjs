// Notes under the symbol (#219): drawn only with "Show notes on the chart",
// then in the canvas and the SVG export alike, never in a de-identified one,
// cut at two lines unless Notes is "Full text", when the next generation
// moves down to make room; the settings are saved.
import { readFileSync } from "node:fs";

export default {
  name: "notes-on-chart",
  about: "With Show notes on the chart off the export dialog says notes are not drawn; turned on, a person's notes are under their symbol on the canvas and in the SVG, not in a de-identified SVG; a long note is cut at two lines until Notes is Full text, which draws all of it clear of the children's symbols; the settings are there after a reload",
  async run(t) {
    const id = await t.openFixture("fixture:text");
    const note = "Notes are never drawn.";
    t.equal((await t.individual("gf")).notes, note, "Bartholomew has a note");
    const detail = () => t.eval(() => [...document.querySelectorAll('[data-individual-id="gf"] [data-detail-label] text')].map(e => e.textContent).join(" "));
    const exportSvg = async (options = []) => {
      await t.click('button[title="Export as SVG or PNG"]');
      for (const label of options) await t.click(`[role="dialog"] label:has-text("${label}")`);
      const svg = readFileSync(await t.download('[role="dialog"] button:has-text("Download")'), "utf8");
      if (await t.visible('[role="dialog"]')) await t.click('[role="dialog"] button:has-text("Cancel")');
      return svg;
    };

    t.notMatch(await detail(), /Notes/, "off by default: the note is not drawn on the canvas");
    await t.click('button[title="Export as SVG or PNG"]');
    t.match(await t.text('[data-testid="export-notes-hint"]'), /Notes are not drawn; turn on Show notes on the chart in Settings/, "the export dialog says how to draw them");
    await t.click('[role="dialog"] button:has-text("Cancel")');
    t.notMatch(await exportSvg(), /Notes are/, "nor in the SVG");

    await t.click('button[title="Pedigree settings"]');
    await t.click('label:has(input[name="showNotes"])');
    await t.press("Escape");
    t.equal((await t.pedigree()).canvasSettings.showNotes, true, "the setting turns on");
    t.match(await detail(), /Notes are never/, "the note is drawn under the symbol on the canvas");
    const svg = await exportSvg();
    t.match(svg, />Notes are<[\s\S]*>never drawn\.</, "and in the SVG, wrapped to the slot width");
    await t.click('button[title="Export as SVG or PNG"]');
    t.equal(await t.count('[data-testid="export-notes-hint"]'), 0, "the dialog's hint is gone");
    await t.click('[role="dialog"] button:has-text("Cancel")');
    const findings = await t.eval(async text => {
      const { lintExportSvg } = await import("/src/io/svg/exportLint.ts");
      const p = window.__pededit.pedigree();
      return lintExportSvg(p, window.__pededit.layout(p, { compact: false }), text).map(f => f.code);
    }, svg);
    t.equal(findings, [], "the SVG passes the export lint");
    t.notMatch(await exportSvg(["De-identify"]), /Notes are/, "a de-identified SVG has no notes");
    await t.click('button[title="Export as SVG or PNG"]');
    await t.click('[role="dialog"] label:has-text("De-identify")');
    await t.click('[role="dialog"] button:has-text("Cancel")');

    // A long note: two lines, then in full.
    const long = "Records held at the regional hospital; cause of death not confirmed by post mortem";
    await t.click('[data-individual-id="gf"]');
    await t.fill('textarea[aria-label="Notes"]', long);
    await t.press("Tab");
    await t.press("Escape");
    t.notMatch(await exportSvg(), /post mortem/, "a long note is cut at two lines in the SVG");
    t.notMatch(await detail(), /post mortem/, "and on the canvas");
    await t.click('button[title="Pedigree settings"]');
    t.equal(await t.eval(() => document.querySelector('select[name="notesLength"]').value), "twoLines", "Notes says up to two lines");
    await t.select('select[name="notesLength"]', "Full text");
    await t.press("Escape");
    t.equal((await t.pedigree()).canvasSettings.notesLength, "full", "Notes turns to full text");
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

    await t.reload();
    t.equal((await t.stored(id)).data.canvasSettings.showNotes, true, "the setting is saved");
    t.equal((await t.stored(id)).data.canvasSettings.notesLength, "full", "and so is Notes");
    t.match(await detail(), /post mortem/, "the full note is drawn after a reload");
  },
};
