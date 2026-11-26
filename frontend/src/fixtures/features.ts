/**
 * Feature fixtures: small, dense, artificial pedigrees that between
 * them draw every symbol, line and label the renderers can draw. The built-in
 * examples (`data/examples.ts`) are real families for users and draw only a
 * part of it; these are the safety net for changes to the canvas and the
 * exporters. Invented names only.
 *
 * `__tests__/featureFixtures.test.ts` fails when a drawn field of the data
 * model (`docs/pedigree-json-schema.json`) is set by none of them, so a new
 * field needs a fixture person before it can land. The page checks take them
 * as `--fixture fixture:SLUG` and `--all-fixtures`.
 */
import type { CanvasSettings, Individual, Partnership, Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { F, M, U, couple, family as familyOf } from "../data/pedigreeBuilder";

export interface FeatureFixture {
  /** Stable name: `--fixture fixture:<slug>`, snapshot file names. */
  slug: string;
  label: string;
  /** What it is there to draw. */
  covers: string;
  data: Pedigree;
}

export const SETTINGS_2022: CanvasSettings = { nodesMoveable: false, snapToGrid: false, snapGridSize: 5, notation: "nsgc2022" };

export { person, M, F, U, couple } from "../data/pedigreeBuilder";

/** `family` drawn in NSGC 2022, as a new pedigree is. */
export const build = (
  individuals: Individual[],
  partnerships: Partnership[],
  parentOf: Record<string, string[]>,
  rest: Partial<Pedigree> = {},
): Pedigree => familyOf(individuals, partnerships, parentOf, { canvasSettings: SETTINGS_2022, ...rest });

const withSettings = (p: Pedigree, patch: Partial<CanvasSettings>): Pedigree =>
  ({ ...p, canvasSettings: { ...SETTINGS_2022, ...p.canvasSettings, ...patch } });

// ── Status and conditions ────────────────────────────────────────────────────

const statusTags: Tag[] = [
  { id: "hcm", label: "Hypertrophic cardiomyopathy", color: "#d62728", style: "quadrant", abbrev: "HCM" },
  { id: "bc", label: "Breast cancer", color: "#1f77b4", style: "quadrant", abbrev: "BC", fill: "diagonal", kind: "condition" },
  { id: "lh", label: "Left-handed", color: "#2ca02c", style: "quadrant", kind: "trait", fill: "dots" },
  { id: "dna", label: "DNA sample stored", color: "#9467bd", style: "dot" },
  { id: "apoe", label: "APOE e4 carrier", color: "#000000", style: "text", abbrev: "e4" },
];

const status = build(
  [
    M("gf", { name: "Alder", affected: true, deceased: true, onset: "60s" }),
    F("gm", { name: "Briar", carrier: true }),
    M("s1", { name: "Cedar", tags: ["hcm"], tagOnset: { hcm: "45y" } }),
    F("w1", { name: "Dahlia", familyHistoryUnknown: true }),
    F("s2", { name: "Elm", carrierTags: ["bc"] }),
    M("s3", { name: "Fern", presymptomatic: true }),
    F("s4", { name: "Gorse", affected: true, tags: ["hcm", "bc"], tagOnset: { bc: "38y" } }),
    U("s5", { name: "Hazel", tags: ["lh", "dna", "apoe"] }),
    M("s6", { name: "Iris", tags: ["bc"], carrierTags: ["hcm"], deceased: true }),
    F("p", { name: "Juniper", proband: true, tags: ["bc"], evaluations: [{ result: "positive", detail: "BRCA1", documented: true }] }),
    M("c", { name: "Kale", consultand: true, evaluations: [{ result: "negative", detail: "BRCA1" }] }),
    F("u", { name: "Larch", carrier: true, deceased: true, evaluations: [{ result: "uninformative", detail: "BRCA1 VUS" }] }),
    M("n", { name: "Maple", affected: true, carrier: true, tags: ["dna"] }),
    F("d", { name: "Nettle", tags: ["hcm", "lh"], carrierTags: ["bc"], proband: true, consultand: true }),
  ],
  [couple("p0", "gf", "gm"), couple("p1", "s1", "w1")],
  { p0: ["s1", "s2", "s3", "s4", "s5", "s6"], p1: ["p", "c", "u", "n", "d"] },
  { tags: statusTags },
);

// ── Pattern fills and more than four sections ────────────────────────────────

const fillTags: Tag[] = [
  { id: "f1", label: "Solid", color: "#d62728", style: "quadrant", fill: "solid" },
  { id: "f2", label: "Horizontal", color: "#1f77b4", style: "quadrant", fill: "horizontal" },
  { id: "f3", label: "Vertical", color: "#2ca02c", style: "quadrant", fill: "vertical" },
  { id: "f4", label: "Diagonal", color: "#9467bd", style: "quadrant", fill: "diagonal" },
  { id: "f5", label: "Cross-hatched", color: "#ff7f0e", style: "quadrant", fill: "crosshatch" },
  { id: "f6", label: "Dotted", color: "#8c564b", style: "quadrant", fill: "dots", kind: "trait" },
  { id: "f7", label: "Shaded", color: "#e377c2", style: "quadrant", fill: "shade" },
];

const fills = build(
  [
    M("a", { tags: ["f1", "f2", "f3", "f4"] }),
    F("b", { carrierTags: ["f1", "f2", "f3", "f4"] }),
    M("k1", { tags: ["f5"] }),
    F("k2", { tags: ["f6"] }),
    U("k3", { tags: ["f7"] }),
    M("k4", { tags: ["f1", "f5", "f6", "f7"], affected: true }),
    F("k5", { carrierTags: ["f5", "f7"], tags: ["f2"] }),
    M("k6", { tags: ["f3"], carrierTags: ["f4"], lifeStatus: "miscarriage" }),
  ],
  [couple("p0", "a", "b")],
  { p0: ["k1", "k2", "k3", "k4", "k5", "k6"] },
  { tags: fillTags },
);

// ── Text under the symbol ────────────────────────────────────────────────────

const textTags: Tag[] = [
  { id: "ms", label: "Multiple sclerosis", color: "#d62728", style: "quadrant", abbrev: "MS" },
  { id: "gt", label: "Genotype", color: "#000000", style: "text", abbrev: "+/-" },
];

const text = build(
  [
    M("gf", { name: "Bartholomew Featherstonehaugh-Wetherby", dob: "1931-04-02", dod: "2009-11-17", deceased: true, notes: "Notes are never drawn." }),
    F("gm", { name: "Ottoline", dob: "1934", age: "92y" }),
    F("m", { name: "Persephone Quillfeather", dob: "1958-06", genderIdentity: "woman", tags: ["ms"], tagOnset: { ms: "childhood" }, hpoTerms: ["HP:0001250"] }),
    M("f", { name: "Rupert", age: "d. 60s", deceased: true, affected: true, onset: "40s" }),
    M("u1", { name: "Sorrel", dob: "1961-01-30", genderIdentity: "woman" }),
    F("u2", { name: "Tamsin", dob: "1963-09-09", genderIdentity: "man", tags: ["gt"] }),
    U("u3", { name: "Umber", genderIdentity: "nonbinary", age: "50s" }),
    M("u4", { name: "Vesper", genderIdentity: "nonbinary" }),
    F("u5", { genderIdentity: "nonbinary", age: "44y" }),
    F("k1", {
      name: "Wilhelmina", dob: "1985-12-01", proband: true, tags: ["ms", "gt"], tagOnset: { ms: "27y" },
      evaluations: [
        { result: "positive", detail: "HLA-DRB1*15:01", documented: true },
        { result: "negative", detail: "NOTCH3 c.1672C>T p.(Arg558Cys)" },
        { result: "uninformative" },
      ],
    }),
    M("k2", { name: "Xavier", dob: "1988", affected: true, onset: "birth", evaluations: [{ detail: "MRI pending" }] }),
    F("k3", { name: "Yolanda", age: "3 wk", lifeStatus: "stillbirth" }),
    M("k4", { name: "Zebedee", dob: "1995-02-14", adopted: "in" }),
  ],
  [couple("p0", "gf", "gm"), couple("p1", "f", "m")],
  { p0: ["m", "u1", "u2", "u3", "u4", "u5"], p1: ["k1", "k2", "k3", "k4"] },
  {
    tags: textTags,
    siblingOrder: { mode: "birthDate", affectedFirst: false },
    chartTitle: "Featherstonehaugh-Wetherby family",
    clinicalDetails: {
      referralReason: "Family history of multiple sclerosis",
      maternalAncestry: "Cornish",
      paternalAncestry: "Not known",
      historian: "Proband",
      recordedBy: "A. Counsellor",
      recordedOn: "2026-11-16",
    },
    canvasSettings: { ...SETTINGS_2022, showNumbers: true, nameLabels: "wrap", symbolsShow: "gender" },
  },
);

// ── Couples and lines ────────────────────────────────────────────────────────

const couples = build(
  [
    M("gf"), F("gm"),
    M("s1"), F("x1"),
    F("s2"), M("x2"),
    M("t1"), M("t2"), F("y1"),
    F("t3"), M("t4"), M("y3"),
    U("t5"), F("t6", { affected: true }),
    M("y6a"), M("y6b"),
    M("k1", { name: "Aspen" }), F("k2", { name: "Bryony" }),
    F("z1", { adopted: "out" }), M("z2", { adopted: "in" }), F("z3"),
    F("h1"), M("h2"),
  ],
  [
    couple("p0", "gf", "gm"),
    couple("p1", "s1", "x1"),
    couple("p2", "x2", "s2", { leftPartner: "s2" }),
    couple("p3", "t1", "y1", { ended: true, childless: "byChoice" }),
    couple("p4", "y3", "t3", { childless: "infertility", childlessReason: "azoospermia" }),
    couple("p5", "y6a", "t6", { ended: true }),
    couple("p6", "y6b", "t6", { consanguineous: true, consanguinityLabel: "distant cousins" }),
    couple("p7", "k1", "k2", { consanguinityLabel: "first cousins" }),
  ],
  {
    p0: ["s1", "s2", "t1", "t2", "t3", "t4", "t5", "t6"],
    p1: ["k1"],
    p2: ["k2"],
    p5: ["h1"],
    p6: ["h2"],
    p7: ["z1", "z2", "z3"],
  },
  { siblingOrder: { mode: "manual", affectedFirst: false } },
);
couples.partnerships.find(p => p.id === "p0")!.twins = [
  { members: ["t1", "t2"], zygosity: "monozygotic" },
  { members: ["t3", "t4"], zygosity: "dizygotic" },
  { members: ["t5", "t6"], zygosity: "unknown" },
];
couples.partnerships.find(p => p.id === "p7")!.twins = [{ members: ["z2", "z3"], zygosity: "unknown" }];

// ── Three or more partners ───────────────────────────────────────────────────

const partners = build(
  [
    // Five partners: two lines hop from one side of a circle.
    F("a"), M("a1"), M("a2"), M("a3"), M("a4"), M("a5"),
    M("ak1"), F("ak2"), M("ak3"), F("ak4"), M("ak5"),
    // A diamond, one couple ended.
    M("b", { genderIdentity: "nonbinary" }), F("b1"), F("b2"), F("b3"),
    F("bk1"), M("bk2"), F("bk3"),
    // Related to every partner: two double lines on one side of a symbol.
    M("c"), F("c1"), F("c2"), F("c3"),
    M("ck1"), F("ck2"),
  ],
  [
    ...[1, 2, 3, 4, 5].map(i => couple(`pa${i}`, `a${i}`, "a")),
    couple("pb1", "b", "b1"), couple("pb2", "b", "b2"), couple("pb3", "b", "b3", { ended: true }),
    couple("pc1", "c", "c1", { consanguineous: true }),
    couple("pc2", "c", "c2", { consanguineous: true }),
    couple("pc3", "c", "c3", { consanguineous: true, ended: true, childless: "byChoice" }),
  ],
  {
    pa1: ["ak1"], pa2: ["ak2"], pa3: ["ak3"], pa4: ["ak4"], pa5: ["ak5"],
    pb1: ["bk1"], pb2: ["bk2"], pb3: ["bk3"],
    pc1: ["ck1"], pc2: ["ck2"],
  },
);

// ── Pregnancies, losses and assisted reproduction ────────────────────────────

const reproduction = build(
  [
    // A couple's pregnancies and losses, every life status.
    M("h0"), F("w0"),
    U("l1", { lifeStatus: "pregnancy", age: "20 wk" }),
    F("l2", { lifeStatus: "pregnancy", affected: true }),
    U("l3", { lifeStatus: "miscarriage", age: "8 wk" }),
    M("l4", { lifeStatus: "termination", affected: true }),
    F("l5", { lifeStatus: "stillbirth", age: "32 wk" }),
    U("l6", { lifeStatus: "ectopic" }),
    M("l7", { lifeStatus: "miscarriage", carrier: true }),
    // A single known parent: the editor's placeholder partner.
    F("w9"), U("ph", { placeholder: true }), M("c9"),
    // 1. Sperm donor, the partner a social parent.
    M("h1", { name: "Partner" }), F("w1"), M("d1", { reproductiveRole: "donor" }),
    U("c1", { lifeStatus: "pregnancy", socialParents: ["h1"] }),
    // 2. Egg donor, the partner carries.
    M("h2"), F("w2", { name: "Partner" }), F("d2", { reproductiveRole: "donor" }),
    M("c2", { affected: true, carriedBy: "w2" }),
    // 3. Surrogate only.
    M("gf3"), F("gm3"), M("h3"), F("w3"), F("s3", { reproductiveRole: "surrogate" }),
    F("c3", { carriedBy: "s3" }),
    // 4a. The egg donor also carries.
    F("d4", { reproductiveRole: "donor" }), M("h4"), F("w4"),
    U("c4", { lifeStatus: "pregnancy", carriedBy: "d4", socialParents: ["w4"] }),
    // 5. Same-sex couple, donor sperm.
    F("m5"), F("p5", { name: "Partner" }), M("d5", { reproductiveRole: "donor" }),
    F("c5", { socialParents: ["p5"] }),
  ],
  [
    couple("pp0", "h0", "w0"),
    couple("pp9", "ph", "w9"),
    couple("pp1", "h1", "w1"),
    couple("pd1", "d1", "w1", { donorConception: true }),
    couple("pp2", "h2", "w2"),
    couple("pd2", "h2", "d2", { donorConception: true }),
    couple("pg3", "gf3", "gm3"),
    couple("pp3", "h3", "w3"),
    couple("pp4", "h4", "w4"),
    couple("pd4", "h4", "d4", { donorConception: true }),
    couple("pp5", "m5", "p5"),
    couple("pd5", "d5", "m5", { donorConception: true }),
  ],
  {
    pp0: ["l1", "l2", "l3", "l4", "l5", "l6", "l7"],
    pp9: ["c9"],
    pd1: ["c1"],
    pd2: ["c2"],
    pg3: ["w3"],
    pp3: ["c3"],
    pd4: ["c4"],
    pd5: ["c5"],
  },
);

// ── Hidden descendants and view filters ──────────────────────────────────────

const familyTags: Tag[] = [
  { id: "hcm", label: "Hypertrophic cardiomyopathy", color: "#d62728", style: "quadrant", abbrev: "HCM" },
  { id: "dm", label: "Type 2 diabetes", color: "#1f77b4", style: "quadrant", abbrev: "T2D" },
];

/** Three generations with a married-in family on each side of the proband. */
const family = (rest: Partial<Pedigree> = {}): Pedigree => build(
  [
    // Father's parents, and the father's siblings.
    M("pgf", { tags: ["hcm"], deceased: true }), F("pgm"),
    M("fa", { tags: ["hcm"] }),
    F("pa1"), M("pa1h"),
    M("pa2", { tags: ["dm"] }), F("pa2w"),
    // Mother's parents, and the mother's siblings.
    M("mgf"), F("mgm", { tags: ["dm"] }),
    F("mo", { carrierTags: ["hcm"] }),
    M("ma1"), F("ma1w"),
    // The proband's sibship.
    F("pro", { proband: true, tags: ["hcm"], name: "Proband" }),
    M("b1"), F("b2"), M("b3", { tags: ["dm"] }),
    // Cousins on the father's side: three unaffected girls, then a mixed sibship.
    F("c1"), F("c2"), F("c3"),
    M("c4"), F("c5"), M("c6", { tags: ["dm"] }), F("c7", { carrierTags: ["hcm"] }),
    // A cousin on the mother's side with a child of her own.
    F("c8"), M("c8h"), U("g1"),
    M("c9", { affected: true }),
  ],
  [
    couple("pg", "pgf", "pgm"),
    couple("mg", "mgf", "mgm"),
    couple("par", "fa", "mo"),
    couple("a1", "pa1h", "pa1"),
    couple("a2", "pa2", "pa2w"),
    couple("a3", "ma1", "ma1w"),
    couple("a4", "c8h", "c8"),
  ],
  {
    pg: ["pa1", "pa2", "fa"],
    mg: ["mo", "ma1"],
    par: ["pro", "b1", "b2", "b3"],
    a1: ["c1", "c2", "c3"],
    a2: ["c4", "c5", "c6", "c7"],
    a3: ["c8", "c9"],
    a4: ["g1"],
  },
  { tags: familyTags, ...rest },
);

const hide = (p: Pedigree, ids: string[]): Pedigree =>
  ({ ...p, individuals: p.individuals.map(i => (ids.includes(i.id) ? { ...i, descendantsHidden: true } : i)) });

const collapsed = hide(family(), ["pa1", "pa2", "ma1"]);

// ── A loop: people drawn twice ───────────────────────────────────────────────

/**
 * Two men who each have a child with the same two women, and those children
 * marry: the four grandparents are a ring of couples, so three people are
 * drawn twice whatever the order. `drawnBeside` keeps all three in the top
 * row.
 */
const loop = build(
  [
    M("la", { name: "Larch" }), F("ma", { name: "Maple" }), M("ne", { name: "Nettle" }), F("ol", { name: "Olive" }),
    M("pr", { name: "Privet" }), F("qu", { name: "Quince" }), M("ro", { name: "Rowan" }), F("so", { name: "Sorrel" }),
    M("th", { name: "Thistle", affected: true }), F("ya", { name: "Yarrow", affected: true }),
  ],
  [
    couple("q1", "la", "ma"),
    couple("q2", "ne", "ol", { leftPartner: "ol" }),
    couple("q3", "la", "ol"),
    couple("q4", "ne", "ma", { leftPartner: "ne", drawnBeside: "ne" }),
    couple("q5", "pr", "qu"),
    couple("q6", "ro", "so"),
  ],
  { q1: ["pr"], q2: ["qu"], q3: ["ro"], q4: ["so"], q5: ["th"], q6: ["ya"] },
);

// ── The list ─────────────────────────────────────────────────────────────────

const BASE: FeatureFixture[] = [
  {
    slug: "status", label: "Status and conditions",
    covers: "affected, carrier, presymptomatic, deceased, proband and consultand, \"?\", conditions affected and carrier, a trait, dot and text tags, evaluations and the documented \"*\"",
    data: status,
  },
  {
    slug: "fills", label: "Pattern fills",
    covers: "every pattern fill, carrier fills, and a fifth to seventh section drawn as slices",
    data: fills,
  },
  {
    slug: "text", label: "Text under the symbol",
    covers: "long names, year of birth, free-text age, onset per condition, evaluations, AMAB / AFAB / UAAB, pedigree numbers, chart title, clinical details in the key",
    data: text,
  },
  {
    slug: "couples", label: "Couples and lines",
    covers: "twins of each zygosity, ended and childless couples, a second partner, a swapped couple, double lines with text above, adoption in and out",
    data: couples,
  },
  {
    slug: "partners", label: "Three or more partners",
    covers: "couple lines hopping over a partner from the side of a square, a circle and a diamond, two hops from one side, double lines that hop, ended and childless marks on a hop",
    data: partners,
  },
  {
    slug: "reproduction", label: "Pregnancies, losses and assisted reproduction",
    covers: "every pregnancy and loss symbol, a placeholder partner, donors, a surrogate, carried-by and social parent lines, a same-sex couple",
    data: reproduction,
  },
  {
    slug: "collapsed", label: "Hidden descendants",
    covers: "collapsed branches: group symbols by sex and mixed, affected and carrier children drawn beside them",
    data: collapsed,
  },
  {
    slug: "filter-affected", label: "Filter: affected only, one condition",
    covers: "the Affected only view filter narrowed to a condition",
    data: family({ filters: { affectedOnly: true, affectedCondition: "hcm" } }),
  },
  {
    slug: "filter-maternal", label: "Filter: blood relatives, mother's side",
    covers: "Blood relatives only with Mother's side only",
    data: family({ filters: { bloodRelativesOnly: true, side: "maternal" } }),
  },
  {
    slug: "filter-paternal", label: "Filter: father's side",
    covers: "Father's side only",
    data: family({ filters: { side: "paternal" } }),
  },
  {
    slug: "loop", label: "A loop: people drawn twice",
    covers: "people drawn twice with numbered copies and dashed arcs, and a couple drawn beside a chosen partner",
    data: loop,
  },
];

/** The same pedigrees where another setting changes the drawing. */
const VARIANTS: FeatureFixture[] = [
  { slug: "status-2008", label: "Status and conditions, NSGC 2008", covers: "2008: carrier dot, a quarter per condition, black base", data: withSettings(status, { notation: "nsgc2008" }) },
  { slug: "status-mono", label: "Status and conditions, black and white", covers: "black and white patterns", data: withSettings(status, { tagFills: "monochrome" }) },
  { slug: "status-2008-mono", label: "Status and conditions, NSGC 2008 in black and white", covers: "2008 with black and white patterns", data: withSettings(status, { notation: "nsgc2008", tagFills: "monochrome" }) },
  { slug: "status-affected-first", label: "Status and conditions, affected first", covers: "sibling order: affected first", data: { ...status, siblingOrder: { mode: "insertion", affectedFirst: true } } },
  { slug: "fills-mono", label: "Pattern fills, black and white", covers: "every pattern in black, more conditions than patterns", data: withSettings(fills, { tagFills: "monochrome" }) },
  { slug: "fills-2008", label: "Pattern fills, NSGC 2008", covers: "2008 quarters with pattern fills", data: withSettings(fills, { notation: "nsgc2008", tagFills: "color" }) },
  { slug: "text-2008", label: "Text under the symbol, NSGC 2008", covers: "2008 evaluations (E1+, E2-)", data: withSettings(text, { notation: "nsgc2008" }) },
  { slug: "text-sex", label: "Text under the symbol, symbols by sex", covers: "Symbols show: biological sex, names cut to one line", data: withSettings(text, { symbolsShow: "sex", nameLabels: "truncate" }) },
  { slug: "couples-named", label: "Couples and lines, relationships named", covers: "Name consanguineous relationships, kinship and inbreeding coefficients, relaxed width", data: withSettings(couples, { relationshipLabels: true, showCoefficients: true, layoutWidth: "relaxed" }) },
  {
    slug: "couples-pinned", label: "Couples and lines, pinned and snapped",
    covers: "pinned positions, an unlocked person, snap to grid, minimal width",
    data: {
      ...withSettings(couples, { snapToGrid: true, snapGridSize: 20, layoutWidth: "minimal" }),
      pinnedPositions: { z1: { x: -40, y: 400 } },
      unlockedIndividuals: ["z1"],
    },
  },
  { slug: "collapsed-mono", label: "Hidden descendants, black and white", covers: "group symbols beside patterned sections", data: withSettings(collapsed, { tagFills: "monochrome" }) },
];

export const FEATURE_FIXTURES: FeatureFixture[] = [...BASE, ...VARIANTS];
