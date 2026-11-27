// The text under a symbol is SVG text on the canvas, as in the export
// (#145): a cut name still shows the full name on hover and selects on a
// click (#68), and a name that is not cut lets the mouse through. The name
// is bold, text tags are detail lines under it (#246).
export default {
  name: "text-under-symbols",
  about: "Names and details under the symbols are SVG text placed as the export places them; hovering a cut name shows it in full without the pill's buttons, clicking it selects, an uncut name lets the mouse through",
  async run(t) {
    await t.openFixture("fixture:text");
    const name = id => `[data-individual-id="${id}"] [data-name-label]`;

    // Bartholomew Featherstonehaugh-Wetherby is cut to fit his slot.
    const drawn = await t.eval(sel => [...document.querySelectorAll(`${sel} text`)].map(e => e.textContent), name("gf"));
    t.equal(drawn, ["Bartholomew", "Feathersto…"], "the cut name is drawn as two SVG text lines, cut at the bold width");
    // #246: the name is bold and nothing else under the symbol is; Tamsin's
    // "+/-" text tag is a detail line under her name, not a row above it.
    const weights = await t.eval(() => ({
      name: [...document.querySelectorAll('[data-individual-id="u2"] [data-name-label] text')].map(e => getComputedStyle(e).fontWeight),
      details: [...document.querySelectorAll('[data-individual-id="u2"] [data-detail-label] text')].map(e => [e.textContent, getComputedStyle(e).fontWeight]),
      nameY: Number(document.querySelector('[data-individual-id="u2"] [data-name-label] text').getAttribute("y")),
      tagY: Number([...document.querySelectorAll('[data-individual-id="u2"] [data-detail-label] text')].find(e => e.textContent === "+/-")?.getAttribute("y")),
    }));
    t.equal(weights.name, ["700"], "the name is bold");
    t.ok(weights.details.some(([text]) => text === "+/-"), "the text tag is among the detail lines");
    t.ok(weights.details.every(([, w]) => w === "400"), "in regular weight, like the other detail lines");
    t.ok(weights.tagY > weights.nameY, "under the name");
    t.equal(await t.eval(() => document.querySelector('[data-individual-id="gf"] [data-detail-label] text')?.textContent), "d. 78y",
      "the detail lines are SVG text too");
    // The canvas writes each line where the export does: the same baselines, from the symbol's centre.
    const baselines = await t.eval(async () => {
      const { textUnder } = await import("/src/pedigree/labelBlock.ts");
      const node = window.__pededit.layout(window.__pededit.pedigree(), { compact: false }).people.find(n => n.individual.id === "gf");
      const at = textUnder(node.glyph, node.glyph.nameLines);
      const canvas = [...document.querySelectorAll('[data-individual-id="gf"] [data-name-label] text, [data-individual-id="gf"] [data-detail-label] text')]
        .map(e => Number(e.getAttribute("y")));
      return { canvas, layout: [...at.nameY, ...at.detailY] };
    });
    t.equal(baselines.canvas, baselines.layout, "at the baselines the export uses (textUnder)");

    await t.hover(name("gf"));
    t.equal(await t.text("[data-full-name]"), "Bartholomew Featherstonehaugh-Wetherby", "hovering the cut name shows it in full");
    t.equal(await t.eval(() => getComputedStyle(document.querySelector('[data-testid="hover-pill"]')).display), "none",
      "without the pill's buttons, which would open under the cursor");
    await t.click(name("gf"));
    t.equal(await t.eval(() => window.__pededit.usePedigreeStore.getState().selectedId), "gf", "clicking the cut name selects the person");
    await t.mouseAway();

    // Ottoline's name fits: the point under it is not the label but what is behind it.
    const through = await t.eval(sel => {
      const label = document.querySelector(sel);
      const r = label.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && !hit.closest("[data-name-label]");
    }, name("gm"));
    t.ok(through, "a name that is not cut lets the mouse through");
  },
};
