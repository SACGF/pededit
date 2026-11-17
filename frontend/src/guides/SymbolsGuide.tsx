import type { CanvasSettings, Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { F, M, U, couple, family } from "../data/pedigreeBuilder";
import { GuideFigure } from "./GuideFigure";
import { AppLink, H2, P, References } from "./GuideLayout";

const settings = (notation: CanvasSettings["notation"]): CanvasSettings =>
  ({ nodesMoveable: false, snapToGrid: false, snapGridSize: 5, notation });

/** Drawn as NSGC 2022, PedEdit's default. */
const fig = (p: Pedigree): Pedigree => ({ ...p, canvasSettings: { ...settings("nsgc2022"), ...p.canvasSettings } });
/** The same drawing in the 2008 notation. */
const as2008 = (p: Pedigree): Pedigree => ({ ...p, canvasSettings: { ...settings("nsgc2022"), ...p.canvasSettings, notation: "nsgc2008" } });

const one = (...args: Parameters<typeof family>) => fig(family(...args));

const cond: Tag[] = [{ id: "a", label: "Condition A", color: "#000000", style: "quadrant", abbrev: "A" }];
const twoConds: Tag[] = [
  { id: "a", label: "Condition A", color: "#000000", style: "quadrant", abbrev: "A", fill: "solid" },
  { id: "b", label: "Condition B", color: "#000000", style: "quadrant", abbrev: "B", fill: "horizontal" },
];
const blackAndWhite = { tagFills: "monochrome" } as const;

const parents = (kids: ReturnType<typeof M>[], extra: Parameters<typeof couple>[3] = {}) =>
  family([M("f"), F("m"), ...kids], [couple("p", "f", "m", extra)], { p: kids.map(k => k.id) });

/** Everyone below `id` collapsed: their children become one numbered symbol. */
const hideBelow = (p: Pedigree, id: string): Pedigree =>
  ({ ...p, individuals: p.individuals.map(i => (i.id === id ? { ...i, descendantsHidden: true } : i)) });

interface Entry {
  name: string;
  note: string;
  figure: Pedigree;
  /** The NSGC 2008 form, where the 2022 revision changed the drawing. */
  figure2008?: Pedigree;
  /** Figures drawn smaller than the export's pixel size. */
  scale?: number;
}

const people: Entry[] = [
  { name: "Male", note: "A square.", figure: one([M("a")]) },
  { name: "Female", note: "A circle.", figure: one([F("a")]) },
  { name: "Sex not specified", note: "A diamond: sex unknown or not stated.", figure: one([U("a")]) },
  { name: "Affected", note: "Shaded. Define the shading in the key.", figure: one([M("a", { affected: true }), F("b", { affected: true })]) },
  { name: "Deceased", note: "A slash through the symbol, longer than the symbol. Age at death below, and the cause if known. Not a cross.", figure: one([M("a", { deceased: true, age: "d. 72y" })]) },
  { name: "Proband", note: "Arrow with P at the lower left: the affected person through whom the family came to attention.", figure: one([F("a", { affected: true, proband: true })]) },
  { name: "Consultand", note: "Arrow without P: the person asking for counselling or testing, affected or not.", figure: one([M("a", { consultand: true })]) },
  { name: "Family history not known", note: "A question mark above the symbol.", figure: one([F("a", { familyHistoryUnknown: true })]) },
  {
    name: "Several siblings",
    note: "One symbol with their number inside (\"n\" when not known). Affected siblings are drawn on their own, never grouped.",
    figure: fig(hideBelow(parents([M("c1"), M("c2"), M("c3")]), "f")),
  },
  {
    name: "Gender identity (2022)",
    note: "The symbol shows gender, with sex assigned at birth below when they differ: AFAB, AMAB or UAAB. Here a trans man and a non-binary person assigned male at birth. The 2008 nomenclature had no such form.",
    figure: one([F("a", { genderIdentity: "man" }), M("b", { genderIdentity: "nonbinary" })]),
  },
];

const conditions: Entry[] = [
  {
    name: "One condition",
    note: "With one condition on the chart, the whole symbol is shaded for it and the key names it.",
    figure: one([F("a", { tags: ["a"] }), M("b", { tags: ["a"] })], [], {}, { tags: cond, canvasSettings: settings("nsgc2022") }),
  },
  {
    name: "Two conditions",
    note: "The symbol is divided, a fill for each condition, each defined in the key. Halves for two (2022); the 2008 drawing gives each condition a quarter.",
    figure: one([M("a", { tags: ["a"] }), F("b", { tags: ["b"] }), F("c", { tags: ["a", "b"] })], [], {}, { tags: twoConds, canvasSettings: { ...settings("nsgc2022"), ...blackAndWhite } }),
    figure2008: as2008(family([M("a", { tags: ["a"] }), F("b", { tags: ["b"] }), F("c", { tags: ["a", "b"] })], [], {}, { tags: twoConds, canvasSettings: { ...settings("nsgc2008"), ...blackAndWhite } })),
  },
  {
    name: "Carrier of a condition",
    note: "The condition's section in a pattern, defined in the key (\"Condition A carrier\"). 2022 replaced the carrier dot with this, because carriers can have symptoms and screening often finds several carrier results.",
    figure: one([F("a", { carrierTags: ["a"] })], [], {}, { tags: cond, canvasSettings: { ...settings("nsgc2022"), ...blackAndWhite } }),
  },
  {
    name: "Carrier, condition not recorded",
    note: "PedEdit draws half the symbol dotted (2022). In 2008 a carrier not expected to be affected is a dot in the centre.",
    figure: one([F("a", { carrier: true })]),
    figure2008: as2008(family([F("a", { carrier: true })])),
  },
  {
    name: "Presymptomatic carrier",
    note: "A vertical line through the symbol: unaffected now, but may develop the condition (typically a dominant one, after a positive test).",
    figure: one([M("a", { presymptomatic: true })]),
  },
  {
    name: "Evaluation result",
    note: "The test and its result under the symbol: + positive, - negative, u uninformative. 2022 dropped the 2008 \"E\" prefix. A * at the lower right means the result was documented (seen by your team).",
    figure: one([F("a", { evaluations: [{ result: "positive", detail: "BRCA1", documented: true }] })]),
    figure2008: as2008(family([F("a", { evaluations: [{ result: "positive", detail: "BRCA1", documented: true }] })])),
  },
];

const pregnancies: Entry[] = [
  { name: "Pregnancy", note: "P inside the symbol, with the gestational age below. Square or circle when the sex is known.", figure: one([U("a", { lifeStatus: "pregnancy", age: "20 wk" })]) },
  { name: "Miscarriage", note: "A small triangle (spontaneous abortion), gestational age below.", figure: one([U("a", { lifeStatus: "miscarriage", age: "9 wk" })]) },
  { name: "Termination", note: "A small triangle with a slash, labelled TOP.", figure: one([U("a", { lifeStatus: "termination" })]) },
  { name: "Stillbirth", note: "The symbol with the deceased slash and SB, with the gestational age.", figure: one([F("a", { lifeStatus: "stillbirth", age: "32 wk" })]) },
  { name: "Ectopic pregnancy", note: "A small triangle labelled ECT.", figure: one([U("a", { lifeStatus: "ectopic" })]) },
];

const familyLines = family(
  [M("f"), F("m"), M("c1"), F("c2"), F("c3")],
  [couple("p", "f", "m")],
  { p: ["c1", "c2", "c3"] },
);

const lines: Entry[] = [
  { name: "A couple and their children", note: "The relationship line joins the partners. The line of descent drops from it to the sibship line, and each child hangs from that by their own short line, oldest on the left.", figure: fig(familyLines) },
  { name: "Consanguinity", note: "A double relationship line: the partners are related by descent. If the relationship is not clear from the drawing, write it above the line.", figure: fig(parents([M("c")], { consanguineous: true, consanguinityLabel: "second cousins" })) },
  { name: "Relationship ended", note: "Two short strokes across the relationship line: separated or divorced.", figure: fig(parents([F("c")], { ended: true })) },
  { name: "Monozygotic twins", note: "The twins' lines leave one point, with a bar between them.", figure: fig(parents([F("t1"), F("t2")], { twins: [{ members: ["t1", "t2"], zygosity: "monozygotic" }] })) },
  { name: "Dizygotic twins", note: "One point, no bar.", figure: fig(parents([M("t1"), F("t2")], { twins: [{ members: ["t1", "t2"], zygosity: "dizygotic" }] })) },
  { name: "Twins, zygosity unknown", note: "One point, with a question mark.", figure: fig(parents([M("t1"), M("t2")], { twins: [{ members: ["t1", "t2"], zygosity: "unknown" }] })) },
  { name: "No children by choice", note: "One bar across a short line of descent.", figure: fig(family([M("a"), F("b")], [couple("p", "a", "b", { childless: "byChoice" })])) },
  { name: "Infertility", note: "Two bars, with the reason below if known.", figure: fig(family([M("a"), F("b")], [couple("p", "a", "b", { childless: "infertility", childlessReason: "azoospermia" })])) },
  { name: "Adopted in", note: "Brackets round the child, and a dashed line from the adoptive parents.", figure: fig(parents([F("c", { adopted: "in" })])) },
  { name: "Adopted out", note: "Brackets round the child, and a solid line from the birth parents.", figure: fig(parents([M("c", { adopted: "out" })])) },
];

const assisted: Entry[] = [
  {
    name: "Sperm donor",
    note: "D inside the donor's symbol. The donor's line runs to the child; there is no relationship line between the donor and the mother. Her partner is joined to her by the relationship line only.",
    figure: fig(family(
      [M("h"), F("w"), M("d", { reproductiveRole: "donor" }), F("c", { socialParents: ["h"] })],
      [couple("p", "h", "w"), couple("pd", "d", "w", { donorConception: true })],
      { pd: ["c"] },
    )),
  },
  {
    name: "Surrogate",
    note: "S inside the symbol of the woman carrying the pregnancy, with a solid line to it. The child's genetic parents are the couple.",
    figure: fig(family(
      [M("h"), F("w"), F("s", { reproductiveRole: "surrogate" }), M("c", { carriedBy: "s" })],
      [couple("p", "h", "w")],
      { p: ["c"] },
    )),
  },
];

const SECTIONS: { id: string; title: string; entries: Entry[] }[] = [
  { id: "people", title: "People", entries: people },
  { id: "conditions", title: "Conditions, carriers and results", entries: conditions },
  { id: "pregnancies", title: "Pregnancies and losses", entries: pregnancies },
  { id: "lines", title: "Lines: couples, children, twins and adoption", entries: lines },
  { id: "assisted", title: "Assisted reproduction", entries: assisted },
];

/** Every figure on the page, for the tests. */
export const SYMBOL_FIGURES: Pedigree[] = SECTIONS.flatMap(s => s.entries.flatMap(e => [e.figure, ...(e.figure2008 ? [e.figure2008] : [])]));

export function SymbolsGuide() {
  return (
    <>
      <P>
        Every figure on this page is drawn by PedEdit from the same data it saves, in NSGC 2022 notation, the
        current edition. Where the 2022 revision changed a drawing, the 2008 form is shown beside it:
        PedEdit draws either (Settings, Notation).
      </P>
      <nav className="mb-6 text-xs">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {SECTIONS.map(s => <li key={s.id}><a href={`#${s.id}`} className="underline underline-offset-2">{s.title}</a></li>)}
        </ul>
      </nav>

      {SECTIONS.map(section => (
        <section key={section.id}>
          <H2 id={section.id}>{section.title}</H2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            {section.entries.map(e => (
              <div key={e.name} className="border-t pt-3">
                <dt className="font-medium text-black">{e.name}</dt>
                <dd>
                  <div className="flex flex-wrap items-end gap-6">
                    <GuideFigure pedigree={e.figure} alt={`${e.name}: ${e.note}`} caption={e.figure2008 ? "NSGC 2022" : undefined} scale={e.scale ?? 1} />
                    {e.figure2008 && <GuideFigure pedigree={e.figure2008} alt={`${e.name}, NSGC 2008 form`} caption="NSGC 2008" scale={e.scale ?? 1} />}
                  </div>
                  <p className="text-xs text-gray-600">{e.note}</p>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <H2>Text under the symbol</H2>
      <P>
        Below each symbol, in this order: the name or initials if used, age or year of birth ("38y", "b. 1978"), age or
        year at death ("d. 72y"), test results, and last the pedigree number (I-1, II-3). Prefer ages and years to full
        dates, which identify people. Age at diagnosis is written with the condition ("BC 45y").
      </P>

      <H2>The key</H2>
      <P>
        Every shading, pattern and abbreviation used must be defined in a key beside the pedigree. A clinical pedigree
        also records who took the history and when, who gave it, the reason for referral and the ancestry of both sides
        of the family. PedEdit builds the key from what the chart uses.
      </P>

      <P>
        Next: <AppLink to="/guides/how-to-draw-a-pedigree">how to draw a pedigree</AppLink>, step by step, or try one of
        the <AppLink to="/guides/practice-families">practice families</AppLink>.
      </P>

      <References />
    </>
  );
}
