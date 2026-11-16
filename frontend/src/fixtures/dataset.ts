/**
 * The test data set (#167): pedigree JSON documents covering the edge cases,
 * for unit sweeps, the backend tests and the end-to-end checks alike.
 *
 * This file is the source. `__tests__/dataset.test.ts` writes every case to
 * `test-data/pedigrees/<file>` and the expectations to
 * `test-data/pedigrees/manifest.json`, and fails when the committed files are
 * out of date (rerun with `-u`). Tests then read the files, not this module,
 * so the backend and the page checks test exactly what vitest tests.
 *
 * Each case is small and built round one thing. Invented names only.
 * See test-data/pedigrees/README.md for how to add one.
 */
import type { Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../data/examples";
import { JSON_FORMAT, JSON_VERSION } from "../io/json/types";
import { FEATURE_FIXTURES, SETTINGS_2022, M, F, U, couple, build } from "./features";
import { makeSyntheticFamily } from "./syntheticFamily";

export type DatasetGroup = "structure" | "reproduction" | "drawn" | "text" | "problems" | "old" | "refused" | "size";

/** What a case is there to show, checked against what the code does. */
export interface DatasetMust {
  /** Importer issue codes that must be reported (others may be too). */
  importCodes?: string[];
  /** Rules of `pedigree/validation.ts` that must report a problem. */
  rules?: string[];
  /** Kinship coefficients, [a, b, value]. */
  kinship?: [string, string, number][];
  /** `canvasSettings.notation` as drawn (`notationOf`). */
  notation?: "nsgc2008" | "nsgc2022";
  /** Dotted paths that must still be in the imported pedigree (unknown fields survive). */
  keeps?: string[];
}

export interface DatasetCase {
  /** Path under test-data/pedigrees/, also its name: "structure/one-person.json". */
  file: string;
  group: DatasetGroup;
  purpose: string;
  /** The document as the file holds it: an envelope, a bare pedigree, anything JSON. */
  document?: unknown;
  /** The file's text, for a file that is not JSON at all. */
  text?: string;
  must?: DatasetMust;
  /** Left out of the browser sweep and the slow lints (the size files). */
  timingOnly?: boolean;
}

const envelope = (title: string, pedigree: unknown, extra: Record<string, unknown> = {}) =>
  ({ format: JSON_FORMAT, version: JSON_VERSION, title, pedigree, ...extra });

const example = (label: string): Pedigree => {
  const ex = EXAMPLES.find(e => e.label === label);
  if (!ex) throw new Error(`no example "${label}"`);
  return ex.data;
};

const valid = (group: DatasetGroup, name: string, purpose: string, pedigree: Pedigree, must?: DatasetMust): DatasetCase =>
  ({ file: `${group}/${name}.json`, group, purpose, document: envelope(purpose.split(":")[0]!, pedigree), must });

// ── Structure ────────────────────────────────────────────────────────────────

/** A line of descent `generations` long, each child marrying in a new partner. */
function lineOfDescent(generations: number): Pedigree {
  const people = [M("g1m"), F("g1f")];
  const partnerships = [couple("c1", "g1m", "g1f")];
  const parentOf: Record<string, string[]> = {};
  for (let g = 2; g <= generations; g++) {
    const child = g % 2 ? M(`g${g}`) : F(`g${g}`);
    people.push(child);
    parentOf[`c${g - 1}`] = [child.id];
    if (g < generations) {
      const partner = g % 2 ? F(`g${g}p`) : M(`g${g}p`);
      people.push(partner);
      partnerships.push(g % 2 ? couple(`c${g}`, child.id, partner.id) : couple(`c${g}`, partner.id, child.id));
    }
  }
  return build(people, partnerships, parentOf);
}

const STRUCTURE: DatasetCase[] = [
  valid("structure", "one-person", "One person", build([F("a", { name: "Solo" })], [], {})),
  valid("structure", "childless-couple", "A couple with no children", build([M("a"), F("b")], [couple("p", "a", "b")], {})),
  valid("structure", "single-parent", "A single known parent: the other is the editor's placeholder partner",
    build([F("m"), U("x", { placeholder: true }), M("c")], [couple("p", "x", "m")], { p: ["c"] })),
  valid("structure", "three-partners", "One person with three partners and a child by each",
    build([M("a"), F("w1"), F("w2"), F("w3"), M("k1"), F("k2"), M("k3")],
      [couple("p1", "a", "w1"), couple("p2", "a", "w2"), couple("p3", "a", "w3")],
      { p1: ["k1"], p2: ["k2"], p3: ["k3"] })),
  valid("structure", "half-siblings", "Half siblings through the mother and through the father",
    build([M("f1"), F("m"), M("f2"), F("m2"), M("a"), F("b"), M("c")],
      [couple("p1", "f1", "m"), couple("p2", "f2", "m"), couple("p3", "f2", "m2")],
      { p1: ["a"], p2: ["b"], p3: ["c"] }),
    { kinship: [["a", "b", 0.125], ["b", "c", 0.125], ["a", "c", 0]] }),
  valid("structure", "cousin-couple", "First cousins who are a couple, with a child",
    build([M("gf"), F("gm"), M("s1"), F("x1"), F("s2"), M("x2"), M("k1"), F("k2"), F("z")],
      [couple("p0", "gf", "gm"), couple("p1", "s1", "x1"), couple("p2", "x2", "s2"), couple("p3", "k1", "k2")],
      { p0: ["s1", "s2"], p1: ["k1"], p2: ["k2"], p3: ["z"] }),
    { kinship: [["k1", "k2", 0.0625]] }),
  valid("structure", "uncle-niece", "An uncle and niece couple", example("Uncle-niece")),
  valid("structure", "double-first-cousins", "Double first cousins: two sibling pairs intermarry", example("Double first cousins"),
    { kinship: [["X", "Y", 0.125]] }),
  valid("structure", "sibling-couple", "A brother and sister couple", example("Full-sib mating")),
  valid("structure", "across-generations", "A couple across generations, so someone is drawn twice", example("Grandparent and grandchild's partner")),
  valid("structure", "joined-twice", "Two families joined by two marriages", example("Two lineages joined twice")),
  valid("structure", "unconnected", "Two unconnected families and two unconnected people",
    build([M("a1"), F("a2"), M("a3"), M("b1"), F("b2"), F("b3"), F("b4"), U("lone1"), M("lone2")],
      [couple("pa", "a1", "a2"), couple("pb", "b1", "b2")],
      { pa: ["a3"], pb: ["b3", "b4"] }),
    { rules: ["not-connected"] }),
  valid("structure", "sibship-of-12", "A sibship of twelve",
    build([M("f"), F("m"), ...Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? M : i % 3 === 1 ? F : U)(`k${i + 1}`))],
      [couple("p", "f", "m")], { p: Array.from({ length: 12 }, (_, i) => `k${i + 1}`) })),
  valid("structure", "eight-generations", "Eight generations in one line of descent", lineOfDescent(8)),
];

// ── Reproduction ─────────────────────────────────────────────────────────────

const triplets = build(
  [M("f"), F("m"), ...["a", "b", "c"].map(n => F(`mz${n}`)), ...["a", "b", "c"].map((n, i) => (i === 1 ? F : M)(`dz${n}`)), ...["a", "b", "c"].map(n => M(`uz${n}`))],
  [couple("p", "f", "m")],
  { p: ["mza", "mzb", "mzc", "dza", "dzb", "dzc", "uza", "uzb", "uzc"] },
);
triplets.partnerships[0]!.twins = [
  { members: ["mza", "mzb", "mzc"], zygosity: "monozygotic" },
  { members: ["dza", "dzb", "dzc"], zygosity: "dizygotic" },
  { members: ["uza", "uzb", "uzc"], zygosity: "unknown" },
];

const REPRODUCTION: DatasetCase[] = [
  valid("reproduction", "triplets", "Triplets of each zygosity", triplets),
  valid("reproduction", "two-fathers", "Two men with two children by one egg donor, carried by a surrogate",
    build(
      [M("a", { name: "Ash" }), M("b", { name: "Birch" }), F("d", { reproductiveRole: "donor" }), F("s", { reproductiveRole: "surrogate" }),
        F("k1", { carriedBy: "s", socialParents: ["b"] }), M("k2", { carriedBy: "s", socialParents: ["b"] })],
      [couple("pc", "a", "b"), couple("pd", "a", "d", { donorConception: true })],
      { pd: ["k1", "k2"] }),
    { kinship: [["k1", "k2", 0.25], ["b", "k1", 0]] }),
];

// ── Drawn features: the feature fixtures of #140 ─────────────────────────────

const DRAWN: DatasetCase[] = FEATURE_FIXTURES.map(f => ({
  file: `drawn/${f.slug}.json`, group: "drawn", purpose: `${f.label}: ${f.covers}`, document: envelope(f.label, f.data),
}));

// ── Text and values ──────────────────────────────────────────────────────────

const longTags: Tag[] = [{ id: "c", label: "A condition with a name long enough to wrap in the legend and the export key twice over", color: "#d62728", style: "quadrant", abbrev: "LONGABBREV" }];

const TEXT: DatasetCase[] = [
  valid("text", "markup-in-names", "Names and text with <, >, & and quotes",
    build(
      [M("a", { name: "<b>Bold</b> & \"quoted\"" }), F("b", { name: "O'Hara <script>alert(1)</script>", notes: "5 < 6 && 7 > 6" }),
        F("c", { name: "A&B", age: "<1y", onset: "\"early\"", affected: true, evaluations: [{ result: "positive", detail: "c.76A>T p.(Arg26*) <VUS>" }] })],
      [couple("p", "a", "b", { childless: undefined })], { p: ["c"] },
      { chartTitle: "Family <one> & \"two\"", clinicalDetails: { referralReason: "Risk > 50% & rising", historian: "Mother's \"sister\"" } })),
  valid("text", "scripts", "Names in Greek, Cyrillic, Chinese, Arabic and Hebrew, and an emoji",
    build(
      [M("a", { name: "Αλέξανδρος Παπαδόπουλος" }), F("b", { name: "Екатерина" }), M("c", { name: "王小明" }),
        F("d", { name: "فاطمة الزهراء" }), M("e", { name: "דוד בן־אברהם" }), U("f", { name: "Zoë 🧬 Ångström" })],
      [couple("p", "a", "b")], { p: ["c", "d", "e", "f"] })),
  valid("text", "dates-and-ages", "Partial dates and free-text ages",
    build(
      [M("gf", { dob: "1921", dod: "1999-04", deceased: true }), F("gm", { dob: "1925-06", dod: "2010-12-25", deceased: true }),
        M("a", { dob: "1950-03-14" }), F("b", { age: "70s" }), M("c", { age: "d. infancy", deceased: true }), F("d", { age: "3 mo" }),
        U("e", { age: "18 wk", lifeStatus: "pregnancy" }), M("f", { dob: "1958", age: "68" })],
      [couple("p", "gf", "gm")], { p: ["a", "b", "c", "d", "e", "f"] },
      { siblingOrder: { mode: "birthDate", affectedFirst: false } })),
  valid("text", "long-text", "Very long names, variant names, condition labels and a long title",
    build(
      [M("a", { name: "Maximilian-Alexander Bartholomew Fitzgerald-Montgomery the Third of Somewhere" }),
        F("b", { name: "Supercalifragilisticexpialidocious" }),
        F("c", { name: "Wolfeschlegelsteinhausenbergerdorff", tags: ["c"], tagOnset: { c: "between the ages of forty and fifty" },
          evaluations: [
            { result: "positive", detail: "NM_000059.4(BRCA2):c.5946delT p.(Ser1982ArgfsTer22)", documented: true },
            { result: "negative", detail: "NM_007294.4(BRCA1):c.68_69delAG p.(Glu23ValfsTer17)" },
            { result: "uninformative", detail: "chr17:g.43045712_43045802del (GRCh38)" },
          ] })],
      [couple("p", "a", "b")], { p: ["c"] },
      { tags: longTags, chartTitle: "A chart title long enough to be wider than the three people drawn underneath it, so the figure has to widen" })),
  valid("text", "ids", "Ids that are UUIDs, numbers, and text with spaces and punctuation",
    build(
      [M("3f2504e0-4f89-41d3-9a0c-0305e82c3301"), F("2"), M("II:3 (proband)"), F("a b"), U("données/é")],
      [couple("p 1", "3f2504e0-4f89-41d3-9a0c-0305e82c3301", "2")], { "p 1": ["II:3 (proband)", "a b", "données/é"] })),
];

// ── Problems: every rule of pedigree/validation.ts ───────────────────────────

const twoConditions: Tag[] = [
  { id: "c1", label: "Condition one", color: "#d62728", style: "quadrant" },
  { id: "c2", label: "Condition two", color: "#1f77b4", style: "quadrant" },
];

const problemDates = build(
  [
    M("f0", { dob: "1940" }), F("m0", { dob: "1942" }),
    M("a", { dob: "sometime" }),
    F("b", { deceased: true, dob: "1970", dod: "later" }),
    M("c", { deceased: true, dob: "1972", dod: "1962" }),
    F("d", { dob: "1974", dod: "2001" }),
    M("e", { dob: "2090" }),
    F("h", { dob: "1980", age: "20" }),
    M("g", { dob: "1900" }), F("gw", { dob: "1990" }),
    // parents and children
    M("f1", { dob: "1990" }), F("m1", { dob: "1960" }), M("k1", { dob: "1985" }),
    M("f2", { dob: "1970" }), F("m2", { dob: "1980" }), F("k2", { dob: "1988" }),
    M("f3", { dob: "1920", deceased: true }), F("m3", { dob: "1920", deceased: true }), M("k3", { dob: "1980" }),
    M("f4", { dob: "1950" }), F("m4", { dob: "1950", dod: "1980", deceased: true }), F("k4", { dob: "1985" }),
    M("f5", { dob: "1950", dod: "1980", deceased: true }), F("m5", { dob: "1952" }), M("k5", { dob: "1983" }),
    M("f6", { dob: "1970" }), F("m6", { dob: "1972" }), F("t1", { dob: "2000-01-01" }), F("t2", { dob: "2000-03-01" }),
    M("f7", { dob: "1960" }), F("m7", { dob: "1962" }), M("s1", { dob: "1990" }), F("s2", { dob: "1985" }),
  ],
  [
    couple("p0", "f0", "m0"), couple("pg", "g", "gw"), couple("p1", "f1", "m1"), couple("p2", "f2", "m2"), couple("p3", "f3", "m3"),
    couple("p4", "f4", "m4"), couple("p5", "f5", "m5"), couple("p6", "f6", "m6"), couple("p7", "f7", "m7"),
  ],
  { p0: ["a", "b", "c", "d", "e", "h"], p1: ["k1"], p2: ["k2"], p3: ["k3"], p4: ["k4"], p5: ["k5"], p6: ["t1", "t2"], p7: ["s1", "s2"] },
);
problemDates.partnerships.find(p => p.id === "p6")!.twins = [{ members: ["t1", "t2"], zygosity: "dizygotic" }];

const problemStatus = build(
  [
    M("f"), F("m"),
    F("p", { proband: true }),
    M("q", { consultand: true, deceased: true }),
    F("r", { affected: true }),
    M("r2", { carrier: true }),
    F("s", { tags: ["c1"], carrierTags: ["c1"] }),
    M("s2", { affected: true, carrier: true }),
    F("t", { affected: true, presymptomatic: true }),
    M("u", { onset: "40s", tagOnset: { c2: "50s" } }),
    F("v", { evaluations: [{}] }),
    M("w", { evaluations: [{ detail: "report seen", documented: true }] }),
  ],
  [couple("p0", "f", "m")],
  { p0: ["p", "q", "r", "r2", "s", "s2", "t", "u", "v", "w"] },
  { tags: twoConditions },
);

const problemReproduction = build(
  [
    M("f"), F("m"),
    F("preg", { lifeStatus: "pregnancy" }), M("pp"),
    M("carrierman"), F("child1", { carriedBy: "carrierman" }),
    M("surr", { reproductiveRole: "surrogate" }),
    F("donor", { reproductiveRole: "donor" }),
    U("alone"),
  ],
  [couple("p0", "f", "m"), couple("p1", "pp", "preg")],
  { p0: ["preg", "carrierman", "child1", "surr", "donor"] },
);

const PROBLEMS: DatasetCase[] = [
  valid("problems", "dates", "Dates that cannot be right, one person or family per rule", problemDates, {
    rules: ["dob-unparseable", "dod-unparseable", "death-before-birth", "dod-not-deceased", "parent-born-after-child", "parent-too-young",
      "mother-too-old", "born-after-mother-died", "born-long-after-father-died", "date-in-future", "living-over-110", "age-disagrees",
      "twins-born-apart", "siblings-out-of-order"],
  }),
  valid("problems", "status", "Statuses that contradict each other, with two conditions defined", problemStatus, {
    rules: ["proband-unaffected", "consultand-deceased", "condition-not-recorded", "affected-and-carrier", "presymptomatic-affected",
      "onset-unaffected", "evaluation-empty", "evaluation-documented-no-result"],
  }),
  valid("problems", "reproduction", "A pregnancy with a partner, a man who carried a child, roles linked to nobody, someone unconnected", problemReproduction, {
    rules: ["pregnancy-with-family", "carried-by-male", "surrogate-male", "role-not-linked", "not-connected"],
  }),
  {
    file: "problems/missing-references.json", group: "problems",
    purpose: "References to a condition and a tag that are not defined: imported with a warning, then reported as a problem",
    document: envelope("Missing references", build(
      [M("f"), F("m"), F("x", { tags: ["nope"], carrierTags: ["gone"], tagOnset: { nope: "30s" } })],
      [couple("p0", "f", "m")], { p0: ["x"] }, { tags: twoConditions })),
    must: { rules: ["missing-reference"], importCodes: ["DANGLING_REFERENCE"] },
  },
];

// ── Old and foreign data ─────────────────────────────────────────────────────

const trio = () => ({
  individuals: [
    { id: "f", sex: "male", affected: false, sibOrder: 0 },
    { id: "m", sex: "female", affected: false, sibOrder: 0 },
    { id: "c", sex: "female", affected: true, sibOrder: 0 },
  ],
  partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
  parentOf: { p: ["c"] } as Record<string, string[]>,
  siblingOrder: { mode: "insertion", affectedFirst: false },
});

const OLD: DatasetCase[] = [
  {
    file: "old/no-notation.json", group: "old", purpose: "Saved before the notation setting: no canvasSettings, drawn as NSGC 2008",
    document: envelope("No notation", { ...trio(), tags: [{ id: "c1", label: "Condition", color: "#d62728", style: "quadrant" }],
      individuals: [...trio().individuals.slice(0, 2), { id: "c", sex: "female", affected: true, carrier: false, deceased: false, proband: true, sibOrder: 0, tags: ["c1"] }] }),
    must: { notation: "nsgc2008" },
  },
  {
    file: "old/carrier-flag.json", group: "old", purpose: "The plain carrier flag with no conditions defined, as saved before carriers were per condition",
    document: envelope("Carrier flag", { ...trio(), individuals: [trio().individuals[0], { id: "m", sex: "female", affected: false, carrier: true, sibOrder: 0 }, trio().individuals[2]] }),
  },
  {
    file: "old/placeholder-without-flag.json", group: "old", purpose: "An unknown-sex partner made for a single parent before placeholders were flagged",
    document: envelope("Old placeholder", { ...trio(), individuals: [{ id: "f", sex: "unknown", affected: false, sibOrder: 0 }, ...trio().individuals.slice(1)] }),
  },
  {
    file: "old/null-optionals.json", group: "old", purpose: "null for optional fields, which the format treats as absent",
    document: envelope("Nulls", {
      ...trio(),
      individuals: [
        { id: "f", sex: "male", affected: false, sibOrder: 0, name: null, dob: null, dod: null, age: null, notes: null, deceased: null, carrier: null, proband: null,
          tags: null, carrierTags: null, evaluations: null, lifeStatus: null, adopted: null, genderIdentity: null, onset: null, tagOnset: null,
          reproductiveRole: null, carriedBy: null, socialParents: null, hpoTerms: null, descendantsHidden: null, placeholder: null,
          consultand: null, familyHistoryUnknown: null, presymptomatic: null },
        ...trio().individuals.slice(1),
      ],
      partnerships: [{ id: "p", individual1: "f", individual2: "m", consanguineous: null, consanguinityLabel: null, childless: null, childlessReason: null,
        twins: null, ended: null, donorConception: null, leftPartner: null }],
      pinnedPositions: null, canvasSettings: null, unlockedIndividuals: null, tags: null, chartTitle: null, clinicalDetails: null, filters: null,
    }),
  },
  {
    file: "old/unknown-fields.json", group: "old", purpose: "Fields this version does not know, which must survive import and a save",
    document: envelope("Unknown fields", {
      ...trio(),
      individuals: [{ id: "f", sex: "male", affected: false, sibOrder: 0, futureField: { nested: [1, 2, 3] }, karyotype: "46,XY" }, ...trio().individuals.slice(1)],
      partnerships: [{ id: "p", individual1: "f", individual2: "m", marriedOn: "1990" }],
      canvasSettings: { ...SETTINGS_2022, futureSetting: true },
      futureTopLevel: "kept",
    }, { futureEnvelopeField: 1 }),
    must: { keeps: ["individuals.0.futureField.nested.2", "individuals.0.karyotype", "partnerships.0.marriedOn", "canvasSettings.futureSetting", "futureTopLevel"] },
  },
  {
    file: "old/stale-pin.json", group: "old", purpose: "A pinned position and an unlock for someone who no longer exists",
    document: envelope("Stale pin", { ...trio(), canvasSettings: SETTINGS_2022, pinnedPositions: { gone: { x: 10, y: 20 }, c: { x: 40, y: 160 } }, unlockedIndividuals: ["gone", "c"] }),
    must: { importCodes: ["DANGLING_REFERENCE"] },
  },
  {
    file: "old/bare-pedigree.json", group: "old", purpose: "A bare pedigree with no envelope and no siblingOrder",
    document: (({ siblingOrder: _dropped, ...rest }) => rest)(trio()),
    must: { importCodes: ["BARE_PEDIGREE", "DEFAULT_APPLIED"] },
  },
  {
    file: "old/newer-version.json", group: "old", purpose: "An envelope from a newer version of the format",
    document: envelope("Newer version", { ...trio(), canvasSettings: SETTINGS_2022 }, { version: 99 }),
    must: { importCodes: ["NEWER_VERSION"] },
  },
];

// ── Refused: one file for each importer error ────────────────────────────────

const refused = (name: string, code: string, purpose: string, pedigree: unknown): DatasetCase =>
  ({ file: `refused/${name}.json`, group: "refused", purpose, document: envelope(purpose, pedigree), must: { importCodes: [code] } });

const REFUSED: DatasetCase[] = [
  { file: "refused/invalid-json.json", group: "refused", purpose: "Not JSON at all", text: "{ \"format\": \"pededit-pedigree\", \"pedigree\": { oops\n", must: { importCodes: ["INVALID_JSON"] } },
  { file: "refused/not-an-object.json", group: "refused", purpose: "A JSON list, not an object", document: [trio()], must: { importCodes: ["NOT_AN_OBJECT"] } },
  { file: "refused/unknown-format.json", group: "refused", purpose: "An envelope of some other format",
    document: { format: "someone-elses-pedigree", version: 1, pedigree: trio() }, must: { importCodes: ["UNKNOWN_FORMAT"] } },
  refused("missing-field", "MISSING_FIELD", "A person with no sex", { ...trio(), individuals: [{ id: "f", affected: false, sibOrder: 0 }, ...trio().individuals.slice(1)] }),
  refused("wrong-type", "WRONG_TYPE", "sibOrder as text, not a number", { ...trio(), individuals: [{ id: "f", sex: "male", affected: false, sibOrder: "first" }, ...trio().individuals.slice(1)] }),
  refused("duplicate-id", "DUPLICATE_ID", "Two people with one id", { ...trio(), individuals: [...trio().individuals, { id: "c", sex: "male", affected: false, sibOrder: 1 }] }),
  refused("unknown-individual", "UNKNOWN_INDIVIDUAL", "A couple naming someone who does not exist", { ...trio(), partnerships: [{ id: "p", individual1: "f", individual2: "nobody" }] }),
  refused("unknown-partnership", "UNKNOWN_PARTNERSHIP", "Children of a couple that does not exist", { ...trio(), parentOf: { nowhere: ["c"] } }),
  refused("self-partnership", "SELF_PARTNERSHIP", "Someone as their own partner", { ...trio(), partnerships: [{ id: "p", individual1: "f", individual2: "f" }] }),
  refused("child-of-own-partnership", "CHILD_OF_OWN_PARTNERSHIP", "Someone as a child of their own couple", { ...trio(), parentOf: { p: ["c", "f"] } }),
  refused("two-sets-of-parents", "MULTIPLE_PARENT_SETS", "A child with two sets of parents", {
    ...trio(),
    individuals: [...trio().individuals, { id: "f2", sex: "male", affected: false, sibOrder: 0 }, { id: "m2", sex: "female", affected: false, sibOrder: 0 }],
    partnerships: [...trio().partnerships, { id: "q", individual1: "f2", individual2: "m2" }],
    parentOf: { p: ["c"], q: ["c"] },
  }),
  refused("circular-ancestry", "CIRCULAR_ANCESTRY", "Someone who is their own grandparent", {
    ...trio(),
    individuals: [...trio().individuals, { id: "h", sex: "male", affected: false, sibOrder: 0 }],
    partnerships: [...trio().partnerships, { id: "q", individual1: "h", individual2: "c" }],
    parentOf: { p: ["c"], q: ["m"] },
  }),
];

// ── Size ─────────────────────────────────────────────────────────────────────

const sized = (name: string, generations: number, seed: number): DatasetCase => {
  const p = makeSyntheticFamily({ seed, generations, minChildren: 2, maxChildren: 4, partnerRate: 0.7 });
  return { ...valid("size", name, `A generated family of ${p.individuals.length} people, for timing`, { ...p, canvasSettings: SETTINGS_2022 }), timingOnly: true };
};

const SIZE: DatasetCase[] = [sized("family-100", 6, 4), sized("family-200", 7, 1), sized("family-500", 7, 13)];

export const DATASET: DatasetCase[] = [...STRUCTURE, ...REPRODUCTION, ...DRAWN, ...TEXT, ...PROBLEMS, ...OLD, ...REFUSED, ...SIZE];

/** "Today" for date rules, so the manifest's expected problems do not age. */
export const DATASET_TODAY = "2026-11-16";

/** The text of a case's file. */
export function datasetFileText(c: DatasetCase): string {
  return c.text ?? JSON.stringify(c.document, null, 2) + "\n";
}
