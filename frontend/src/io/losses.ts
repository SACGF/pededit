/**
 * What a PED or Phenopackets export cannot carry, so the toolbar can say so
 * before writing the file. Every field of `Individual`, `Partnership` and
 * `Pedigree` has a rule for each format, typed as `Record<keyof T, ...>`, so
 * a new field fails the type check until someone decides what the formats do
 * with it:
 *
 * - "kept": the field comes back unchanged when the file is imported;
 * - "internal": not something the user sees, or matched rather than compared
 *   (ids, which the file replaces with its own IDs);
 * - a function: what is lost for this person, couple or pedigree, in words,
 *   or undefined when nothing is.
 *
 * `__tests__/losses.test.ts` exports a pedigree with every field set, imports
 * the file and holds each field to its rule: unchanged, or named here.
 */
import type { Individual, Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import { exportIds } from "./ped/exporter.js";
import { pedigreeNumbers } from "../pedigree/scene";
import { personSubject } from "../pedigree/personLabel";
import { lifeStatusLabel } from "../pedigree/lifeStatus";
import { childlessLabel } from "../pedigree/childless";
import { adoptionLabel } from "../pedigree/adoption";
import { twinLegendLabel } from "../pedigree/twins";
import { childrenOf, parentCoupleOf } from "../pedigree/graph";
import { affectedConditions, carrierLabel, isAffected, isConditionTag, plainAffected } from "../pedigree/conditions";
import { consanguinityTest } from "../pedigree/consanguinity";
import { kinshipOf } from "../pedigree/relatedness";
import { CURRENT_NOTATION } from "../pedigree/notation";
import { GENDER_IDENTITY_OPTIONS } from "../pedigree/gender";
import { ageElements, familyProband, onsetElement } from "./phenopackets/index.js";
import { deathElement, timestamp } from "./phenopackets/time.js";
import { conditionTagsFor, conditionTerm } from "./phenopackets/terms.js";

export type ExportFormat = "plink" | "r" | "phenopackets";

/** One thing a file would lose: which field of whom, and what it is in words. */
export type ExportLoss = { subject: string; what: string } & (
  | { on: "individual"; id: string; field: keyof Individual }
  | { on: "partnership"; id: string; field: keyof Partnership }
  | { on: "pedigree"; field: keyof Pedigree }
);

interface Context {
  pedigree: Pedigree;
  format: ExportFormat;
  /** The ID each person has in the file. */
  ids: Map<string, string>;
  nameOf: (id: string) => string;
  tagLabel: (id: string) => string;
  /** The Family's proband, for Phenopackets. */
  proband?: Individual;
}

type Rule<T> = "kept" | "internal" | ((x: T, c: Context) => string | undefined);
/** One rule for both formats, or one each: PED (both dialects) and Phenopackets. */
type FieldRule<T> = Rule<T> | { ped: Rule<T>; phenopackets: Rule<T> };

const lost = <T>(what: (x: T, c: Context) => string | false | undefined | null | 0 | ""): Rule<T> =>
  (x, c) => what(x, c) || undefined;

/** An option label inside a line: "Infertility" as "infertility". */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const list = (ids: readonly string[] | undefined, c: Context) => (ids ?? []).map(c.tagLabel).join(", ");

const onsetText = (ids: string[], ind: Individual, c: Context) =>
  ids.map(id => `age of onset of ${c.tagLabel(id)} "${ind.tagOnset![id]}"`).join("; ");

/** The name a person comes back with, from the ID the file gives them. */
const nameRule = (phenopackets: boolean): Rule<Individual> => (ind, c) => {
  const id = c.ids.get(ind.id)!;
  const name = ind.name ?? "";
  // PedEdit reads its own ind1, ind2 in a Phenopackets file as no name.
  const generated = phenopackets && /^ind\d+$/.test(id);
  if (!name.trim()) return generated ? undefined : `no name: comes back named "${id}"`;
  if (generated) return `name "${name}": comes back with no name`;
  return name === id ? undefined : `name written as "${id}"`;
};

const INDIVIDUAL_RULES: Record<keyof Individual, FieldRule<Individual>> = {
  // Matched by the ID in the file, which `exportIds` makes from the name.
  id: "internal",
  sex: "kept",
  genderIdentity: {
    ped: lost(ind => ind.genderIdentity && `gender identity (${GENDER_IDENTITY_OPTIONS.find(o => o.value === ind.genderIdentity)?.label.toLowerCase() ?? ind.genderIdentity})`),
    phenopackets: "kept",
  },
  affected: {
    // The file says affected, so a condition comes back as the plain flag.
    ped: lost((ind, c) => isAffected(ind, c.pedigree) && !plainAffected(ind, c.pedigree) && "affected with a condition: comes back affected, condition not recorded"),
    // Someone affected with a condition comes back affected through it only.
    phenopackets: lost((ind, c) => {
      const with_ = affectedConditions(ind, c.pedigree);
      return plainAffected(ind, c.pedigree) && with_.length > 0 && `affected (condition not recorded) beside ${with_.map(t => t.label).join(", ")}: comes back with ${with_.length === 1 ? "that condition" : "those conditions"} only`;
    }),
  },
  deceased: { ped: lost(ind => ind.deceased && "deceased"), phenopackets: "kept" },
  carrier: lost(ind => ind.carrier && "carrier"),
  presymptomatic: lost(ind => ind.presymptomatic && "presymptomatic carrier"),
  evaluations: lost(ind => !!ind.evaluations?.length && (ind.evaluations.length === 1 ? "an evaluation" : `${ind.evaluations.length} evaluations`)),
  proband: {
    ped: lost(ind => ind.proband && "proband"),
    // The Family has one proband, and must have one.
    phenopackets: lost((ind, c) => {
      if (ind === c.proband) return !ind.proband && "written as the family's proband, as none is marked";
      return ind.proband && "proband (the file holds only one)";
    }),
  },
  consultand: lost(ind => ind.consultand && "consultand"),
  familyHistoryUnknown: lost(ind => ind.familyHistoryUnknown && "family history not known"),
  // The order among siblings, read back from the order of the file.
  sibOrder: "internal",
  name: { ped: nameRule(false), phenopackets: nameRule(true) },
  dob: {
    ped: lost(ind => ind.dob && "date of birth"),
    phenopackets: lost(ind => ind.dob && !timestamp(ind.dob) && `date of birth "${ind.dob}" (not a whole date)`),
  },
  dod: {
    ped: lost(ind => ind.dod && "date of death"),
    phenopackets: lost(ind => ind.dod && !deathElement(ind.dod) && `date of death "${ind.dod}"`),
  },
  age: {
    ped: lost(ind => ind.age && "age"),
    phenopackets: lost(ind => {
      const ages = ageElements(ind);
      return ind.age && !ages.atDeath && !ages.atLastEncounter && `age "${ind.age}"`;
    }),
  },
  notes: lost(ind => ind.notes && "notes"),
  hpoTerms: { ped: lost(ind => !!ind.hpoTerms?.length && "HPO terms"), phenopackets: "kept" },
  lifeStatus: lost(ind => ind.lifeStatus && `${lower(lifeStatusLabel(ind.lifeStatus))}: comes back as an ordinary child`),
  adopted: lost(ind => ind.adopted && lower(adoptionLabel(ind.adopted))),
  reproductiveRole: lost(ind => ind.reproductiveRole && (ind.reproductiveRole === "donor" ? "donor (D)" : "surrogate (S)")),
  carriedBy: lost((ind, c) => ind.carriedBy && `carried by ${c.nameOf(ind.carriedBy)}`),
  socialParents: lost((ind, c) => !!ind.socialParents?.length && `social parent ${ind.socialParents.map(c.nameOf).join(", ")}`),
  tags: {
    ped: lost((ind, c) => !!ind.tags?.length && `conditions and tags (${list(ind.tags, c)})`),
    // Conditions are diseases; traits, dots and text tags have no place.
    phenopackets: lost((ind, c) => {
      const conditions = new Set((c.pedigree.tags ?? []).filter(isConditionTag).map(t => t.id));
      const others = (ind.tags ?? []).filter(id => !conditions.has(id));
      return others.length > 0 && `tags (${list(others, c)})`;
    }),
  },
  carrierTags: lost((ind, c) => !!ind.carrierTags?.length && ind.carrierTags.map(id => carrierLabel({ label: c.tagLabel(id) })).join(", ")),
  // The onset of the plain affected status: Phenopackets gives onsets to diseases only.
  onset: lost(ind => ind.onset && `age of onset "${ind.onset}"`),
  tagOnset: {
    ped: lost((ind, c) => onsetText(Object.keys(ind.tagOnset ?? {}), ind, c)),
    phenopackets: lost((ind, c) => onsetText(Object.keys(ind.tagOnset ?? {}).filter(id => !onsetElement(ind, id)), ind, c)),
  },
  descendantsHidden: lost(ind => ind.descendantsHidden && "people below hidden: comes back with them drawn"),
  // Made automatically as a second parent; comes back as an ordinary person.
  placeholder: "internal",
};

/** A couple the file has no row for: no children, so no one names them as parents. */
const noChildren = (p: Partnership, c: Context) => childrenOf(c.pedigree, p.id).length === 0;

const PARTNERSHIP_RULES: Record<keyof Partnership, FieldRule<Partnership>> = {
  id: lost((p, c) => noChildren(p, c) && "a couple with no children"),
  // Matched as the pair of parents the file writes.
  individual1: "internal",
  individual2: "internal",
  // The override for a couple the drawing does not show to be related. A
  // Phenopackets Family has it for the proband's parents.
  consanguineous: lost((p, c) => {
    if (!p.consanguineous || kinshipOf(c.pedigree).kinship(p.individual1, p.individual2) > 0) return false;
    const probandParents = c.proband && parentCoupleOf(c.pedigree, c.proband.id);
    return !(c.format === "phenopackets" && probandParents === p) && "marked consanguineous";
  }),
  // Text on a couple drawn with a single line is not drawn, so nothing seen is lost.
  consanguinityLabel: lost((p, c) => p.consanguinityLabel?.trim() && consanguinityTest(c.pedigree)(p.individual1, p.individual2) && `"${p.consanguinityLabel.trim()}" above the double line`),
  childless: lost(p => p.childless && lower(childlessLabel(p.childless))),
  childlessReason: lost(p => p.childlessReason?.trim() && `childless reason "${p.childlessReason.trim()}"`),
  twins: lost((p, c) => (p.twins ?? []).filter(t => t.members.length >= 2).map(t => `${lower(twinLegendLabel(t.zygosity))}: ${t.members.map(c.nameOf).join(" and ")}`).join("; ")),
  ended: lost(p => p.ended && "relationship ended"),
  donorConception: lost(p => p.donorConception && "children conceived with a donor (no line between the partners)"),
  leftPartner: lost((p, c) => p.leftPartner && `${c.nameOf(p.leftPartner)} drawn on the left`),
  drawnBeside: lost((p, c) => p.drawnBeside && `drawn beside ${c.nameOf(p.drawnBeside)}`),
};

/** The settings an import gives a pedigree (`withCurrentNotation`). */
const IMPORTED_SETTINGS = { nodesMoveable: false, snapToGrid: false, snapGridSize: 5, notation: CURRENT_NOTATION };

function sameJson(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canon(x)]))
    : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

const PEDIGREE_RULES: Record<keyof Pedigree, FieldRule<Pedigree>> = {
  // Compared person by person and couple by couple.
  individuals: "internal",
  partnerships: "internal",
  parentOf: "internal",
  siblingOrder: lost(p => (p.siblingOrder.mode !== "insertion" || p.siblingOrder.affectedFirst) && "the sibling order setting"),
  pinnedPositions: lost(p => Object.keys(p.pinnedPositions ?? {}).length > 0 && "people moved by hand"),
  canvasSettings: lost(p => !sameJson(p.canvasSettings ?? {}, IMPORTED_SETTINGS) && "chart settings"),
  unlockedIndividuals: lost(p => !!p.unlockedIndividuals?.length && "people unlocked for moving"),
  tags: {
    ped: lost(p => !!p.tags?.length && "the conditions and tags defined"),
    // A condition comes back with its label and a colour from the palette.
    phenopackets: lost(p => {
      const back = conditionTagsFor((p.tags ?? []).filter(isConditionTag).map(conditionTerm));
      return !sameJson(p.tags ?? [], back) && "colours and fills of conditions, and the tags that are not conditions";
    }),
  },
  chartTitle: lost(p => p.chartTitle !== undefined && "chart title"),
  clinicalDetails: lost(p => Object.values(p.clinicalDetails ?? {}).some(v => v?.trim()) && "clinical details"),
  filters: lost(p => Object.values(p.filters ?? {}).some(Boolean) && "view filters"),
};

function ruleFor<T>(rule: FieldRule<T>, format: ExportFormat): Rule<T> {
  return typeof rule === "object" ? (format === "phenopackets" ? rule.phenopackets : rule.ped) : rule;
}

/**
 * Everything in the pedigree the file would lose, field by field, in the
 * order of the people, then the couples, then the pedigree. Empty when the
 * file loses nothing.
 */
export function exportLosses(pedigree: Pedigree, format: ExportFormat): ExportLoss[] {
  const numbers = pedigreeNumbers(pedigree);
  const tagById = new Map((pedigree.tags ?? []).map(t => [t.id, t.label]));
  const c: Context = {
    pedigree,
    format,
    ids: exportIds(pedigree, format !== "plink"),
    nameOf: id => personSubject(pedigree, id, numbers),
    tagLabel: id => tagById.get(id) ?? id,
    proband: format === "phenopackets" ? familyProband(pedigree) : undefined,
  };
  const out: ExportLoss[] = [];
  for (const ind of pedigree.individuals) {
    for (const field of Object.keys(INDIVIDUAL_RULES) as (keyof Individual)[]) {
      const rule = ruleFor(INDIVIDUAL_RULES[field], format);
      const what = typeof rule === "function" ? rule(ind, c) : undefined;
      if (what) out.push({ on: "individual", id: ind.id, field, subject: c.nameOf(ind.id), what });
    }
  }
  for (const p of pedigree.partnerships) {
    for (const field of Object.keys(PARTNERSHIP_RULES) as (keyof Partnership)[]) {
      const rule = ruleFor(PARTNERSHIP_RULES[field], format);
      const what = typeof rule === "function" ? rule(p, c) : undefined;
      if (what) out.push({ on: "partnership", id: p.id, field, subject: `${c.nameOf(p.individual1)} and ${c.nameOf(p.individual2)}`, what });
    }
  }
  for (const field of Object.keys(PEDIGREE_RULES) as (keyof Pedigree)[]) {
    const rule = ruleFor(PEDIGREE_RULES[field], format);
    const what = typeof rule === "function" ? rule(pedigree, c) : undefined;
    if (what) out.push({ on: "pedigree", field, subject: "The pedigree", what });
  }
  return out;
}

/** The losses as lines for the warning, one per person, couple or the pedigree: "II-2, Mary: notes; age". */
export function lossLines(losses: readonly ExportLoss[]): string[] {
  const bySubject = new Map<string, string[]>();
  for (const l of losses) bySubject.set(l.subject, [...(bySubject.get(l.subject) ?? []), l.what]);
  return [...bySubject].map(([subject, whats]) => `${subject}: ${whats.join("; ")}`);
}
