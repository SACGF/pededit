import type { Pedigree } from "@pedigree-editor/layout-engine";
import { JSON_FORMAT, JSON_VERSION, JsonIssueCode } from "./types.js";
import type { JsonImportResult, JsonValidationIssue } from "./types.js";
import { isObject, shapeIssues } from "./schemaCheck";

type Obj = Record<string, unknown>;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Collects issues. Unknown fields are never touched. */
class Checker {
  readonly issues: JsonValidationIssue[] = [];

  error(code: JsonIssueCode, message: string, path?: string, affectedIds?: string[]) {
    this.issues.push({ severity: "error", code, message, path, affectedIds });
  }
  warning(code: JsonIssueCode, message: string, path?: string, affectedIds?: string[]) {
    this.issues.push({ severity: "warning", code, message, path, affectedIds });
  }
  info(code: JsonIssueCode, message: string, path?: string) {
    this.issues.push({ severity: "info", code, message, path });
  }
  get hasErrors(): boolean {
    return this.issues.some(i => i.severity === "error");
  }
}

/**
 * Parse and validate a pedigree JSON document.
 * Accepts the `pededit-pedigree` envelope or a bare Pedigree object.
 * Does not throw: all problems are reported in result.issues.
 * Unknown optional properties on the pedigree, individuals and partnerships
 * are preserved as-is so newer documents survive a roundtrip.
 */
export function importJson(text: string): JsonImportResult {
  const c = new Checker();

  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (e) {
    c.error(JsonIssueCode.INVALID_JSON, `Not valid JSON: ${(e as Error).message}`);
    return { pedigree: null, title: null, issues: c.issues, hasErrors: true };
  }

  if (!isObject(root)) {
    c.error(JsonIssueCode.NOT_AN_OBJECT, "Document root must be a JSON object");
    return { pedigree: null, title: null, issues: c.issues, hasErrors: true };
  }

  // Envelope or bare pedigree?
  let pedigreeRaw: unknown;
  let pedigreePath: string;
  let title: string | null = null;
  const isEnvelope = "format" in root || "pedigree" in root;

  if (isEnvelope) {
    if (root.format !== JSON_FORMAT) {
      c.error(
        JsonIssueCode.UNKNOWN_FORMAT,
        `Unrecognised format '${String(root.format)}' (expected '${JSON_FORMAT}')`,
        "format",
      );
    }
    if (!isFiniteNumber(root.version)) {
      c.error(JsonIssueCode.WRONG_TYPE, "version must be a number", "version");
    } else if (root.version > JSON_VERSION) {
      c.warning(
        JsonIssueCode.NEWER_VERSION,
        `Document version ${root.version} is newer than this editor's version ${JSON_VERSION}; unknown fields will be kept but not interpreted`,
        "version",
      );
    }
    if (root.title !== undefined && root.title !== null) {
      if (typeof root.title === "string") title = root.title;
      else c.error(JsonIssueCode.WRONG_TYPE, "title must be a string", "title");
    }
    if (root.exportedAt !== undefined && root.exportedAt !== null && typeof root.exportedAt !== "string") {
      c.error(JsonIssueCode.WRONG_TYPE, "exportedAt must be a string", "exportedAt");
    }
    pedigreeRaw = root.pedigree;
    pedigreePath = "pedigree";
    if (!isObject(pedigreeRaw)) {
      c.error(JsonIssueCode.MISSING_FIELD, "pedigree must be an object", "pedigree");
      return { pedigree: null, title, issues: c.issues, hasErrors: true };
    }
  } else {
    pedigreeRaw = root;
    pedigreePath = "";
    c.info(JsonIssueCode.BARE_PEDIGREE, "Document has no envelope; treating it as a bare pedigree object");
  }

  const pedigree = validatePedigree(c, pedigreeRaw as Obj, pedigreePath);
  const hasErrors = c.hasErrors;
  return { pedigree: hasErrors ? null : pedigree, title, issues: c.issues, hasErrors };
}

function validatePedigree(c: Checker, ped: Obj, base: string): Pedigree | null {
  const p = (k: string) => (base ? `${base}.${k}` : k);
  const path = base || "pedigree";

  // siblingOrder: required by the type, but default it with a warning so hand-written files are easy
  if (ped.siblingOrder === undefined || ped.siblingOrder === null) {
    c.warning(JsonIssueCode.DEFAULT_APPLIED, `${path}.siblingOrder missing; defaulting to insertion order`, p("siblingOrder"));
    ped.siblingOrder = { mode: "insertion", affectedFirst: false };
  }

  // Field types, enums and required fields come from the schema. The rest of
  // this function is what the schema cannot say: how the parts refer to each
  // other, checked on a pedigree whose fields are already the right types.
  const shape = shapeIssues(ped, "Pedigree", base, "pedigree");
  for (const s of shape) {
    c.error(s.kind === "missing" ? JsonIssueCode.MISSING_FIELD : JsonIssueCode.WRONG_TYPE, s.message, s.path);
  }
  if (shape.length > 0) return null;
  const pedigree = ped as unknown as Pedigree;

  // ---- Individuals ----
  const individualIds = new Set<string>();
  const tagRefs: { tagId: string; path: string }[] = [];
  pedigree.individuals.forEach((ind, i) => {
    const ip = p(`individuals[${i}]`);
    if (individualIds.has(ind.id)) {
      c.error(JsonIssueCode.DUPLICATE_ID, `Duplicate individual id '${ind.id}'`, ip, [ind.id]);
    }
    individualIds.add(ind.id);
    for (const tagId of ind.tags ?? []) tagRefs.push({ tagId, path: `${ip}.tags` });
    // Conditions carried: ids of quadrant tags, checked like `tags`.
    for (const tagId of ind.carrierTags ?? []) tagRefs.push({ tagId, path: `${ip}.carrierTags` });
  });

  // ---- Partnerships ----
  const partnershipIds = new Set<string>();
  const partnerMembers = new Map<string, [string, string]>();
  pedigree.partnerships.forEach((pt, i) => {
    const pp = p(`partnerships[${i}]`);
    const { id, individual1: a, individual2: b } = pt;
    if (partnershipIds.has(id)) {
      c.error(JsonIssueCode.DUPLICATE_ID, `Duplicate partnership id '${id}'`, pp, [id]);
    }
    partnershipIds.add(id);
    for (const [key, member] of [["individual1", a], ["individual2", b]] as const) {
      if (!individualIds.has(member)) {
        c.error(JsonIssueCode.UNKNOWN_INDIVIDUAL,
          `Partnership '${id}' refers to unknown individual '${member}'`, `${pp}.${key}`, [member]);
      }
    }
    if (a === b) {
      c.error(JsonIssueCode.SELF_PARTNERSHIP, `Partnership '${id}' pairs individual '${a}' with itself`, pp, [a]);
    }
    for (const key of ["leftPartner", "drawnBeside"] as const) {
      const v = pt[key];
      if (v != null && v !== a && v !== b) {
        c.error(JsonIssueCode.WRONG_TYPE, `${path}.partnerships[${i}].${key} must be the id of individual1 or individual2 when present`, `${pp}.${key}`, [v]);
      }
    }
    partnerMembers.set(id, [a, b]);
  });

  // ---- parentOf ----
  const childToPartnership = new Map<string, string>();
  for (const [pid, children] of Object.entries(pedigree.parentOf)) {
    const cp = p(`parentOf["${pid}"]`);
    if (!partnershipIds.has(pid)) {
      c.error(JsonIssueCode.UNKNOWN_PARTNERSHIP, `parentOf key '${pid}' is not a partnership id`, cp, [pid]);
    }
    const members = partnerMembers.get(pid);
    const seen = new Set<string>();
    for (const child of children) {
      if (!individualIds.has(child)) {
        c.error(JsonIssueCode.UNKNOWN_INDIVIDUAL, `Child '${child}' of partnership '${pid}' does not exist`, cp, [child]);
        continue;
      }
      if (seen.has(child)) {
        c.error(JsonIssueCode.DUPLICATE_ID, `Child '${child}' is listed twice under partnership '${pid}'`, cp, [child]);
        continue;
      }
      seen.add(child);
      if (members && (members[0] === child || members[1] === child)) {
        c.error(JsonIssueCode.CHILD_OF_OWN_PARTNERSHIP, `Individual '${child}' is a child of its own partnership '${pid}'`, cp, [child]);
      }
      const other = childToPartnership.get(child);
      if (other !== undefined && other !== pid) {
        c.error(JsonIssueCode.MULTIPLE_PARENT_SETS,
          `Individual '${child}' is a child of two partnerships ('${other}' and '${pid}')`, cp, [child]);
      } else {
        childToPartnership.set(child, pid);
      }
    }
  }

  // Circular ancestry: walk from each individual up through its parents.
  if (!c.hasErrors) {
    const cycle = findAncestryCycle(childToPartnership, partnerMembers);
    if (cycle.length > 0) {
      c.error(JsonIssueCode.CIRCULAR_ANCESTRY, `Circular ancestry: ${cycle.join(" -> ")}`, p("parentOf"), cycle);
    }
  }

  // ---- Twin sets: members must be children of their partnership, in one set only ----
  const inSet = new Set<string>();
  pedigree.partnerships.forEach((pt, i) => {
    if (!pt.twins) return;
    const children = new Set(pedigree.parentOf[pt.id] ?? []);
    const kept = pt.twins.filter((t, k) => {
      const outsiders = t.members.filter(m => !children.has(m));
      const repeated = t.members.filter(m => inSet.has(m));
      if (outsiders.length || repeated.length) {
        const why = outsiders.length ? `${outsiders.map(m => `'${m}'`).join(", ")} not a child of partnership '${pt.id}'`
          : `${repeated.map(m => `'${m}'`).join(", ")} already in another twin set`;
        c.warning(JsonIssueCode.UNKNOWN_INDIVIDUAL, `Twin set dropped: ${why}`, p(`partnerships[${i}].twins[${k}]`), t.members);
        return false;
      }
      for (const m of t.members) inSet.add(m);
      return true;
    });
    if (kept.length !== pt.twins.length) {
      if (kept.length) pt.twins = kept; else delete pt.twins;
    }
  });

  // ---- Assisted reproduction lines: drop references to nobody ----
  pedigree.individuals.forEach((ind, i) => {
    const ip = p(`individuals[${i}]`);
    const bad = (ref: string) => !individualIds.has(ref) || ref === ind.id;
    if (typeof ind.carriedBy === "string" && bad(ind.carriedBy)) {
      c.warning(JsonIssueCode.UNKNOWN_INDIVIDUAL, `carriedBy '${ind.carriedBy}' dropped: not another individual in the pedigree`, `${ip}.carriedBy`, [ind.carriedBy]);
      delete ind.carriedBy;
    }
    if (ind.socialParents) {
      const dropped = ind.socialParents.filter(bad);
      if (dropped.length) {
        c.warning(JsonIssueCode.UNKNOWN_INDIVIDUAL, `socialParents ${dropped.map(d => `'${d}'`).join(", ")} dropped: not another individual in the pedigree`, `${ip}.socialParents`, dropped);
        const kept = ind.socialParents.filter(x => !bad(x));
        if (kept.length) ind.socialParents = kept; else delete ind.socialParents;
      }
    }
  });

  // ---- References from the optional top-level fields ----
  for (const id of Object.keys(pedigree.pinnedPositions ?? {})) {
    if (!individualIds.has(id)) {
      const pp = p("pinnedPositions");
      c.warning(JsonIssueCode.DANGLING_REFERENCE, `${pp} refers to unknown individual '${id}'`, `${pp}["${id}"]`, [id]);
    }
  }
  for (const id of pedigree.unlockedIndividuals ?? []) {
    if (!individualIds.has(id)) {
      const up = p("unlockedIndividuals");
      c.warning(JsonIssueCode.DANGLING_REFERENCE, `${up} refers to unknown individual '${id}'`, up, [id]);
    }
  }

  const tagIds = new Set<string>();
  (pedigree.tags ?? []).forEach((tag, i) => {
    if (tagIds.has(tag.id)) c.error(JsonIssueCode.DUPLICATE_ID, `Duplicate tag id '${tag.id}'`, p(`tags[${i}]`), [tag.id]);
    tagIds.add(tag.id);
  });
  for (const { tagId, path: refPath } of tagRefs) {
    if (!tagIds.has(tagId)) {
      c.warning(JsonIssueCode.DANGLING_REFERENCE, `${refPath} refers to unknown tag '${tagId}'`, refPath, [tagId]);
    }
  }

  // The object itself is returned so that unknown properties are preserved.
  return pedigree;
}

/**
 * Returns the first ancestry cycle found as a list of individual ids, or [] if none.
 * Parents of X are the two members of the partnership that lists X as a child.
 */
function findAncestryCycle(
  childToPartnership: Map<string, string>,
  partnerMembers: Map<string, [string, string]>,
): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const path: string[] = [];

  function parentsOf(id: string): string[] {
    const pid = childToPartnership.get(id);
    if (pid === undefined) return [];
    return partnerMembers.get(pid) ?? [];
  }

  function dfs(id: string): string[] {
    color.set(id, GRAY);
    path.push(id);
    for (const parent of parentsOf(id)) {
      const col = color.get(parent) ?? WHITE;
      if (col === GRAY) {
        return [...path.slice(path.indexOf(parent)), parent];
      }
      if (col === WHITE) {
        const cycle = dfs(parent);
        if (cycle.length > 0) return cycle;
      }
    }
    path.pop();
    color.set(id, BLACK);
    return [];
  }

  for (const id of childToPartnership.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      const cycle = dfs(id);
      if (cycle.length > 0) return cycle;
    }
  }
  return [];
}
