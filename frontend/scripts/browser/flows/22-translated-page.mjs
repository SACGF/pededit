// A page the browser has translated (src/domGuard.ts): Chrome's Translate
// replaces each text node with <font><font>text</font></font>, so React's
// next removal of that node, or insert before it, throws NotFoundError and the
// error boundary takes over the app. The flow rewrites the text nodes the same
// way (this is not Chrome's translator) and then makes React do both.
const translate = () => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const text of texts) {
    if (!text.nodeValue.trim() || text.parentElement.closest("script,style,svg,font")) continue;
    const outer = document.createElement("font");
    const inner = document.createElement("font");
    inner.textContent = text.nodeValue;
    outer.appendChild(inner);
    text.parentNode.replaceChild(outer, text);
  }
};

export default {
  name: "translated-page",
  about: "with every text node replaced as browser page translation does, opening and closing Clinical details and marking a person affected keep the editor running",
  async run(t) {
    await t.openFixture("example:0");
    await t.waitFor('button[title="Add male"]');
    const fold = '[data-testid="clinical-details"] > button';
    if (!(await t.visible(fold))) await t.click("text=Pedigree");
    await t.waitFor(fold);

    // Opening swaps the chevron, which React inserts before the button's text.
    await t.eval(translate);
    await t.click(fold);
    t.equal(await t.count('[data-testid="error-boundary"]'), 0, "opening Clinical details on a translated page does not crash the app");
    t.ok(await t.count('[data-testid="clinical-details"] input') > 0, "and its fields open");

    // Filling a field adds "(1 filled)" after the text; clearing it removes that again.
    await t.eval(translate);
    await t.fill('[data-testid="clinical-details"] input >> nth=0', "Family history");
    await t.eval(translate);
    await t.fill('[data-testid="clinical-details"] input >> nth=0', "");
    await t.eval(translate);
    await t.click(fold);
    t.equal(await t.count('[data-testid="clinical-details"] input'), 0, "it closes again");

    // The Person tab is drawn and redrawn over translated text.
    const first = (await t.drawn())[0];
    await t.click(`[data-individual-id="${first}"]`);
    await t.eval(translate);
    await t.press("a");
    await t.eval(translate);
    await t.press("Escape");
    await t.click(`[data-individual-id="${(await t.drawn())[1]}"]`);
    t.equal(await t.count('[data-testid="error-boundary"]'), 0, "selecting and editing people on a translated page does not crash the app");
    t.ok((await t.pedigree()).individuals.find(i => i.id === first).affected, "and the edit was made");
  },
};
