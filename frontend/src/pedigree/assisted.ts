import { placementParentOf, type Individual, type Partnership, type Pedigree, type ReproductiveRole } from "@pedigree-editor/layout-engine";
import { NODE_SIZE } from "./constants";
import type { Segment } from "./sibshipPath";
import { symbolTopInset } from "./lifeStatus";
import { descendantsOf } from "./removal";

/**
 * Assisted reproduction (NSGC 2008 Fig. 3, #45). Framework-free, shared by the
 * canvas, the minimap, the SVG and U-shape exporters, the legends and the store.
 *
 * The model keeps genetics in the ordinary structure, so kinship, X-linked
 * kinship, relationship names and PED need nothing special:
 *
 *  - the child's partnership in `parentOf` is its GENETIC parents. With a
 *    donated sperm or egg it is the donor and the other genetic parent, and
 *    carries `donorConception`: no couple line is drawn between them, and a
 *    line runs from each of them to the children instead. kinship2 lays them
 *    out as a couple, so the donor stands beside the other parent.
 *  - `Individual.carriedBy` is the woman who carried the pregnancy when she
 *    is not the genetic mother (a surrogate, or the mother of a child from a
 *    donor egg): a solid line from her to the child.
 *  - `Individual.socialParents` are parents who are not genetic (the
 *    intended father when donor sperm is used): a dashed line to the child,
 *    NSGC's dashed line of descent for a non-biological parent.
 *  - `Individual.reproductiveRole` puts a "D" or "S" inside the symbol.
 */

export const REPRODUCTIVE_ROLE_OPTIONS: { value: ReproductiveRole; label: string; letter: string }[] = [
  { value: "donor",     label: "Donor (D)",     letter: "D" },
  { value: "surrogate", label: "Surrogate (S)", letter: "S" },
];

export function roleLetter(role: ReproductiveRole | undefined): string | undefined {
  return REPRODUCTIVE_ROLE_OPTIONS.find(o => o.value === role)?.letter;
}

/** Legend wording for the letter inside the symbol. */
export function roleLegendLabel(role: ReproductiveRole): string {
  return role === "donor" ? "Sperm or egg donor (D)" : "Surrogate (S)";
}

/** Legend wording for the two lines. */
export const CARRIER_LINE_LEGEND = "Carried the pregnancy, not the genetic mother";
export const SOCIAL_LINE_LEGEND = "Not a genetic parent (dashed line)";

/** Font size of the letter inside a symbol of the given size. */
export function roleLetterFontSize(size: number): number {
  return Math.round(size * 0.45);
}

/** Baseline of the letter, centred in a size × size box whose top is at oy. */
export function roleLetterBaselineY(size: number, oy = 0): number {
  return oy + size / 2 + roleLetterFontSize(size) * 0.36;
}

/** The letter is drawn in white on a filled (affected) symbol. */
export function roleLetterFill(ind: Pick<Individual, "affected">): string {
  return ind.affected ? "white" : "black";
}

/** The letter for this individual, or undefined. A pregnancy's "P" wins. */
export function symbolLetter(ind: Pick<Individual, "reproductiveRole" | "lifeStatus">): string | undefined {
  if (ind.lifeStatus) return undefined;
  return roleLetter(ind.reproductiveRole);
}

export function isDonorPartnership(p: Partnership | undefined): boolean {
  return !!p?.donorConception;
}

/** One line of assisted reproduction: from a carrier, social or genetic parent to a child. */
export interface AssistedLink {
  from: string;
  child: string;
  /**
   * "carrier": solid, she carried the pregnancy. "social": dashed, not a
   * genetic parent. "genetic": solid, a genetic parent the child is not
   * drawn under (the egg donor when the child hangs from the couple carrying
   * it, see `placementParentOf`).
   */
  kind: "carrier" | "social" | "genetic";
}

/** The genetic parents of a child (the two members of its partnership), or none. */
export function geneticParents(pedigree: Pedigree, childId: string): string[] {
  const p = pedigree.partnerships.find(x => (pedigree.parentOf[x.id] ?? []).includes(childId));
  return p ? [p.individual1, p.individual2] : [];
}

/**
 * Every line to draw besides the line of descent from the parents the child
 * hangs from (`placementParentOf`), between people who are both in the
 * pedigree, as NSGC 2008 Fig. 3 draws them:
 *
 *  - a genetic parent the child is not drawn under (the egg donor of
 *    scenario 2) and a woman who carried it but is neither (the surrogate of
 *    scenario 3) get a solid line;
 *  - a social parent gets a dashed line, unless they are the partner of
 *    someone with a biological line to the child: then the couple line is
 *    their link (scenario 1, the intended father beside the mother carrying
 *    a pregnancy by donor sperm; scenario 4, the wife beside the father).
 *
 * Someone with two roles is drawn once: genetic over carrier over social, so
 * a woman who is both egg donor and carrier is shown only as the donor.
 */
export function assistedLinks(pedigree: Pedigree): AssistedLink[] {
  if (!pedigree.individuals.some(c => c.carriedBy || c.socialParents?.length)) return [];
  const ids = new Set(pedigree.individuals.map(i => i.id));
  const placed = placementParentOf(pedigree);
  const drawnUnder = (childId: string) => {
    const p = pedigree.partnerships.find(x => (placed[x.id] ?? []).includes(childId));
    return new Set(p ? [p.individual1, p.individual2] : []);
  };
  const couples = new Set(pedigree.partnerships.filter(p => !p.donorConception)
    .flatMap(p => [`${p.individual1}|${p.individual2}`, `${p.individual2}|${p.individual1}`]));
  const out: AssistedLink[] = [];
  for (const child of pedigree.individuals) {
    if (!child.carriedBy && !child.socialParents?.length) continue;
    const genetic = geneticParents(pedigree, child.id);
    const under = drawnUnder(child.id);
    const ok = (id: string) => ids.has(id) && id !== child.id;
    const bio = new Set(genetic);
    for (const g of genetic) if (!under.has(g) && ok(g)) out.push({ from: g, child: child.id, kind: "genetic" });
    const carrier = child.carriedBy && ok(child.carriedBy) && !bio.has(child.carriedBy) ? child.carriedBy : undefined;
    if (carrier) {
      bio.add(carrier);
      if (!under.has(carrier)) out.push({ from: carrier, child: child.id, kind: "carrier" });
    }
    for (const sp of new Set(child.socialParents ?? [])) {
      if (!ok(sp) || bio.has(sp) || under.has(sp)) continue;
      if ([...bio].some(b => couples.has(`${sp}|${b}`))) continue;
      out.push({ from: sp, child: child.id, kind: "social" });
    }
  }
  return out;
}

/** A symbol centre, with its sex when the line should leave from the symbol's outline. */
export interface LinePoint { x: number; y: number; sex?: Individual["sex"] }

/**
 * Where a line of descent leaves a parent's symbol on its way down to
 * (tx, ty): the bottom middle when the target is roughly below, otherwise
 * the lower corner on the target's side (a point on the circle at 45
 * degrees, the side vertex of a diamond), so the line clears the name
 * written under the symbol.
 */
export function symbolExitPoint(p: LinePoint, tx: number, size = NODE_SIZE): [number, number] {
  const half = size / 2;
  const dx = tx - p.x;
  if (Math.abs(dx) < half || !p.sex) return [p.x, p.y + half];
  const s = Math.sign(dx);
  if (p.sex === "female") { const r = (half - 1) * Math.SQRT1_2; return [p.x + s * r, p.y + r]; }
  if (p.sex === "unknown") return [p.x + s * (half - 1), p.y];
  return [p.x + s * half, p.y + half];
}

/**
 * The line from a carrier or social parent to the child: from their symbol
 * (see `symbolExitPoint`) to the top of the child's (the apex of a loss
 * triangle, via `childTopInset`), where it meets the child's own line of
 * descent, as the lines converge on the pregnancy in NSGC's figure.
 * Positions are symbol centres.
 */
export function assistedLinkSegment(
  from: LinePoint,
  child: { x: number; y: number },
  childTopInset = 0,
  size = NODE_SIZE,
): Segment {
  const half = size / 2;
  if (child.y <= from.y) return [from.x, from.y - half, child.x, child.y + half];
  const [x1, y1] = symbolExitPoint(from, child.x, size);
  return [x1, y1, child.x, child.y - half + childTopInset];
}

/**
 * Lines of descent from parents who are not a couple (`donorConception`):
 * from each parent's symbol (see `symbolExitPoint`) to the point on the
 * sibship bar under the middle of the two, in place of the couple line and
 * its drop.
 */
export function donorDescentSegments(
  parents: LinePoint[],
  joinX: number,
  barY: number,
  size = NODE_SIZE,
): Segment[] {
  return parents.map(p => [...symbolExitPoint(p, joinX, size), joinX, barY] as Segment);
}

/**
 * Where a sibship's line of descent meets its bar: under the middle of the
 * parents, half way down to the highest child, lowered by the bar's offset
 * (as `sibshipSegments` draws it).
 */
export function sibshipJoinPoint(
  left: { x: number; y: number },
  right: { x: number; y: number },
  childYs: number[],
  barOffset = 0,
): { x: number; y: number } {
  const coupleY = (left.y + right.y) / 2;
  return { x: (left.x + right.x) / 2, y: (coupleY + Math.min(...childYs)) / 2 + barOffset };
}

/** What `assistedEdgeSegment` needs of an AssistedEdge (layoutToFlow.ts). */
export interface AssistedEdgeLike {
  source: string;
  target: string;
  data?: { kind: AssistedLink["kind"]; bar?: { leftParentId: string; rightParentId: string; childIds: string[]; barOffset: number } };
}

/**
 * The segment an assisted edge draws, from the nodes' current positions: to
 * the top of the child, or to the sibship's join point when it stands for
 * the whole sibship. Null when a node it needs is not drawn. Shared by the
 * canvas edge, the minimap and the SVG export.
 */
export function assistedEdgeSegment(
  edge: AssistedEdgeLike,
  nodeAt: (id: string) => { position: { x: number; y: number }; individual?: Individual; shape?: Individual["sex"] } | undefined,
): Segment | null {
  const a = nodeAt(edge.source), b = nodeAt(edge.target);
  if (!a || !b) return null;
  // The shape drawn (gender identity, #26), which the line leaves from.
  const from: LinePoint = { ...a.position, sex: a.shape ?? a.individual?.sex };
  const bar = edge.data?.bar;
  if (bar) {
    const l = nodeAt(bar.leftParentId), r = nodeAt(bar.rightParentId);
    const kids = bar.childIds.map(nodeAt).filter((n): n is NonNullable<typeof n> => !!n);
    if (!l || !r || kids.length === 0) return null;
    const j = sibshipJoinPoint(l.position, r.position, kids.map(k => k.position.y), bar.barOffset);
    const [x1, y1] = symbolExitPoint(from, j.x);
    return [x1, y1, j.x, j.y];
  }
  return assistedLinkSegment(from, b.position, symbolTopInset(b.individual?.lifeStatus, NODE_SIZE));
}

// ── Editing (#45): the store applies these to an immer draft ─────────────────

export type Gamete = "sperm" | "egg";

function nameOf(pedigree: Pedigree, id: string): string {
  return pedigree.individuals.find(i => i.id === id)?.name?.trim() || "this person";
}

/**
 * The genetic parent a donor of this gamete replaces: for sperm the male
 * partner (or the one not female), for egg the female (or the one not male).
 */
function replacedParent(pedigree: Pedigree, p: Partnership, gamete: Gamete): string | undefined {
  const sexOf = (id: string) => pedigree.individuals.find(i => i.id === id)?.sex;
  const ids = [p.individual1, p.individual2];
  const want = gamete === "sperm" ? "male" : "female";
  const avoid = gamete === "sperm" ? "female" : "male";
  return ids.find(id => sexOf(id) === want) ?? ids.find(id => sexOf(id) !== avoid);
}

/**
 * Why a donor of this gamete cannot be added for the child, or null when one
 * can. With `donorId`, the donor is someone already on the tree (#104), such
 * as the mother's sister giving an egg: then also why that person cannot be
 * the donor.
 */
export function addDonorProblem(pedigree: Pedigree, childId: string, gamete: Gamete, donorId?: string): string | null {
  const p = pedigree.partnerships.find(x => (pedigree.parentOf[x.id] ?? []).includes(childId));
  if (!p) return "Add the parents first: the donor replaces one of them as the genetic parent.";
  const x = replacedParent(pedigree, p, gamete);
  if (!x) return `Neither parent could have given the ${gamete}.`;
  const xi = pedigree.individuals.find(i => i.id === x);
  if (xi?.reproductiveRole === "donor") return `${nameOf(pedigree, x)} is already a donor.`;
  if (donorId === undefined) return null;
  const donor = pedigree.individuals.find(i => i.id === donorId);
  if (!donor) return "Unknown individual.";
  if (donorId === childId) return "Someone cannot be their own donor.";
  if (donorId === p.individual1 || donorId === p.individual2) return `${nameOf(pedigree, donorId)} is already a genetic parent of ${nameOf(pedigree, childId)}.`;
  if (donor.lifeStatus) return `${nameOf(pedigree, donorId)} is a pregnancy or pregnancy loss and cannot be a donor.`;
  if (donor.sex === (gamete === "sperm" ? "female" : "male")) return `${gamete === "egg" ? "An egg" : "A sperm"} donor cannot be ${donor.sex}.`;
  if (descendantsOf(pedigree, [childId]).has(donorId)) return `${nameOf(pedigree, donorId)} is a descendant of ${nameOf(pedigree, childId)}, so cannot be their donor.`;
  return null;
}

/**
 * Add a sperm or egg donor for one child, in place. The donor becomes the
 * child's genetic parent with the other parent (a `donorConception`
 * partnership); the parent they replace stays linked to the child: as the
 * woman who carried it for an egg donor (unless someone else is recorded as
 * carrying it), otherwise as a social parent. A donor partnership left with
 * no children is removed, since it is not a couple. Returns the donor's id.
 * `donorId` is a new id, or the id of someone already on the tree (#104),
 * who becomes the donor; an existing donor pair with the same other parent
 * is reused, so two children of one donor are full siblings.
 */
export function applyAddDonor(draft: Pedigree, childId: string, gamete: Gamete, donorId: string, partnershipId: string): string | null {
  const existing = draft.individuals.find(i => i.id === donorId);
  if (addDonorProblem(draft, childId, gamete, existing ? donorId : undefined)) return null;
  const p = draft.partnerships.find(x => (draft.parentOf[x.id] ?? []).includes(childId))!;
  const replaced = replacedParent(draft, p, gamete)!;
  const other = p.individual1 === replaced ? p.individual2 : p.individual1;
  const child = draft.individuals.find(i => i.id === childId)!;

  if (existing) {
    // Someone already on the tree (#104): they become a donor, keeping everything else.
    existing.reproductiveRole = "donor";
    if (existing.sex === "unknown") existing.sex = gamete === "sperm" ? "male" : "female";
  } else {
    draft.individuals.push({
      id: donorId, sex: gamete === "sperm" ? "male" : "female", affected: false, sibOrder: 0,
      name: "", notes: "", reproductiveRole: "donor",
    });
  }
  // The same donor and parent for a second child share one donor pair, so the children are full siblings.
  const shared = existing && draft.partnerships.find(x => x.donorConception
    && ((x.individual1 === donorId && x.individual2 === other) || (x.individual1 === other && x.individual2 === donorId)));
  if (shared) {
    child.sibOrder = Math.max(-1, ...(draft.parentOf[shared.id] ?? []).map(id => draft.individuals.find(i => i.id === id)?.sibOrder ?? 0)) + 1;
    draft.parentOf[shared.id] = [...(draft.parentOf[shared.id] ?? []), childId];
  } else {
    const [i1, i2] = gamete === "sperm" ? [donorId, other] : [other, donorId];
    draft.partnerships.push({ id: partnershipId, individual1: i1, individual2: i2, donorConception: true });
    draft.parentOf[partnershipId] = [childId];
    child.sibOrder = 0;
  }

  // Leave the old parents, and their twin sets.
  draft.parentOf[p.id] = (draft.parentOf[p.id] ?? []).filter(c => c !== childId);
  if (p.twins) {
    p.twins = p.twins.map(t => ({ ...t, members: t.members.filter(m => m !== childId) })).filter(t => t.members.length >= 2);
    if (p.twins.length === 0) delete p.twins;
  }
  if (p.donorConception && draft.parentOf[p.id]!.length === 0) {
    draft.partnerships = draft.partnerships.filter(x => x.id !== p.id);
    delete draft.parentOf[p.id];
  }

  // The replaced parent keeps a line to the child, unless they were a donor themselves.
  const replacedInd = draft.individuals.find(i => i.id === replaced)!;
  if (replacedInd.reproductiveRole !== "donor") {
    if (gamete === "egg" && replacedInd.sex === "female" && !child.carriedBy) child.carriedBy = replaced;
    else if (child.carriedBy !== replaced && !child.socialParents?.includes(replaced)) {
      child.socialParents = [...(child.socialParents ?? []), replaced];
    }
  }
  return donorId;
}

/**
 * Why a surrogate cannot be added for the child, or null when one can. With
 * `surrogateId`, the surrogate is someone already on the tree (#104), such
 * as the mother's sister: then also why she cannot be.
 */
export function addSurrogateProblem(pedigree: Pedigree, childId: string, surrogateId?: string): string | null {
  const child = pedigree.individuals.find(i => i.id === childId);
  if (!child) return "Unknown individual.";
  const carrier = child.carriedBy && pedigree.individuals.find(i => i.id === child.carriedBy);
  if (carrier && carrier.reproductiveRole === "surrogate") return `${nameOf(pedigree, carrier.id)} is already recorded as the surrogate.`;
  if (surrogateId === undefined) return null;
  const s = pedigree.individuals.find(i => i.id === surrogateId);
  if (!s) return "Unknown individual.";
  if (surrogateId === childId) return "Someone cannot carry themselves.";
  if (s.sex === "male") return `${nameOf(pedigree, surrogateId)} is male and cannot carry a pregnancy.`;
  if (s.lifeStatus) return `${nameOf(pedigree, surrogateId)} is a pregnancy or pregnancy loss.`;
  // An egg donor who also carried the child (NSGC Fig. 3, the sister as donor and carrier) is allowed:
  // she is drawn as the donor only, and the previous carrier becomes a social parent.
  if (geneticParents(pedigree, childId).includes(surrogateId) && s.reproductiveRole !== "donor") return `${nameOf(pedigree, surrogateId)} is the genetic mother of ${nameOf(pedigree, childId)}, not a surrogate.`;
  if (descendantsOf(pedigree, [childId]).has(surrogateId)) return `${nameOf(pedigree, surrogateId)} is a descendant of ${nameOf(pedigree, childId)}.`;
  return null;
}

/**
 * Add a surrogate who carried this child, in place. A woman recorded as
 * carrying it before (the mother of a child from a donor egg) becomes a
 * social parent. Returns the surrogate's id. `surrogateId` is a new id, or
 * the id of a woman already on the tree (#104).
 */
export function applyAddSurrogate(draft: Pedigree, childId: string, surrogateId: string): string | null {
  const existing = draft.individuals.find(i => i.id === surrogateId);
  if (addSurrogateProblem(draft, childId, existing ? surrogateId : undefined)) return null;
  const child = draft.individuals.find(i => i.id === childId)!;
  if (existing) {
    // Someone already on the tree (#104). A donor stays a donor (D wins over S).
    if (existing.reproductiveRole !== "donor") existing.reproductiveRole = "surrogate";
    if (existing.sex === "unknown") existing.sex = "female";
  } else {
    draft.individuals.push({
      id: surrogateId, sex: "female", affected: false, sibOrder: 0,
      name: "", notes: "", reproductiveRole: "surrogate",
    });
  }
  const before = child.carriedBy;
  child.carriedBy = surrogateId;
  if (child.socialParents?.includes(surrogateId)) {
    child.socialParents = child.socialParents.filter(x => x !== surrogateId);
    if (child.socialParents.length === 0) delete child.socialParents;
  }
  if (before && before !== surrogateId && !child.socialParents?.includes(before)) child.socialParents = [...(child.socialParents ?? []), before];
  return surrogateId;
}

/**
 * Who may be recorded as carrying this child or as a social parent: anyone
 * but the child, its genetic parents and its descendants' line (kept simple:
 * not the child's own children). Pregnancies cannot carry or raise anyone.
 */
export function assistedCandidates(pedigree: Pedigree, childId: string): Individual[] {
  const genetic = new Set(geneticParents(pedigree, childId));
  const own = new Set(pedigree.partnerships
    .filter(p => p.individual1 === childId || p.individual2 === childId)
    .flatMap(p => pedigree.parentOf[p.id] ?? []));
  return pedigree.individuals.filter(i => i.id !== childId && !genetic.has(i.id) && !own.has(i.id) && !i.lifeStatus);
}

/** What Export PED drops for this individual (#45), for its warning. */
export function assistedLossText(ind: Individual, nameOf: (id: string) => string): string {
  const parts: string[] = [];
  if (ind.reproductiveRole) parts.push(ind.reproductiveRole === "donor" ? "donor (D)" : "surrogate (S)");
  if (ind.carriedBy) parts.push(`carried by ${nameOf(ind.carriedBy)}`);
  if (ind.socialParents?.length) parts.push(`social parent ${ind.socialParents.map(nameOf).join(", ")}`);
  return parts.join("; ");
}
