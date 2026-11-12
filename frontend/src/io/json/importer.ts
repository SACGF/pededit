import type { Pedigree } from "@pedigree-editor/layout-engine";
import { JSON_FORMAT, JSON_VERSION, JsonIssueCode } from "./types.js";
import type { JsonImportResult, JsonValidationIssue } from "./types.js";

const SEX_VALUES = ["male", "female", "unknown"];
const TAG_STYLES = ["quadrant", "dot", "text"];
const LIFE_STATUS_VALUES = ["pregnancy", "miscarriage", "termination", "stillbirth", "ectopic"];
const CHILDLESS_VALUES = ["infertility", "byChoice"];
const ADOPTION_VALUES = ["in", "out"];
const NAME_LABEL_VALUES = ["wrap", "truncate"];
const LAYOUT_WIDTH_VALUES = ["minimal", "relaxed"];
const ZYGOSITY_VALUES = ["monozygotic", "dizygotic", "unknown"];
const SIBLING_ORDER_MODES = ["insertion", "manual", "birthDate"];

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === "string");
}

/** Collects issues and offers typed field checks. Unknown fields are never touched. */
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

  /** Required field: reports MISSING_FIELD or WRONG_TYPE. Returns true if usable. */
  required(obj: Obj, key: string, path: string, typeName: string, test: (v: unknown) => boolean): boolean {
    if (!(key in obj) || obj[key] === undefined) {
      this.error(JsonIssueCode.MISSING_FIELD, `${path}.${key} is required`, `${path}.${key}`);
      return false;
    }
    if (!test(obj[key])) {
      this.error(JsonIssueCode.WRONG_TYPE, `${path}.${key} must be ${typeName}`, `${path}.${key}`);
      return false;
    }
    return true;
  }

  /** Optional field: absent or null is fine, otherwise must pass the type test. */
  optional(obj: Obj, key: string, path: string, typeName: string, test: (v: unknown) => boolean): void {
    const v = obj[key];
    if (v === undefined || v === null) return;
    if (!test(v)) {
      this.error(JsonIssueCode.WRONG_TYPE, `${path}.${key} must be ${typeName} when present`, `${path}.${key}`);
    }
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

  const haveInds = c.required(ped, "individuals", path, "an array", Array.isArray);
  const havePartners = c.required(ped, "partnerships", path, "an array", Array.isArray);
  const haveParentOf = c.required(ped, "parentOf", path, "an object", isObject);

  // siblingOrder: required by the type, but default it with a warning so hand-written files are easy
  if (ped.siblingOrder === undefined || ped.siblingOrder === null) {
    c.warning(JsonIssueCode.DEFAULT_APPLIED, `${path}.siblingOrder missing; defaulting to insertion order`, p("siblingOrder"));
    ped.siblingOrder = { mode: "insertion", affectedFirst: false };
  } else if (!isObject(ped.siblingOrder)) {
    c.error(JsonIssueCode.WRONG_TYPE, `${path}.siblingOrder must be an object`, p("siblingOrder"));
  } else {
    const so = ped.siblingOrder;
    c.required(so, "mode", p("siblingOrder"), SIBLING_ORDER_MODES.map(m => `"${m}"`).join(" | "),
      v => typeof v === "string" && SIBLING_ORDER_MODES.includes(v));
    c.required(so, "affectedFirst", p("siblingOrder"), "a boolean", v => typeof v === "boolean");
  }

  if (!haveInds || !havePartners || !haveParentOf) return null;

  // ---- Individuals ----
  const individualIds = new Set<string>();
  const tagRefs: { tagId: string; path: string }[] = [];
  (ped.individuals as unknown[]).forEach((raw, i) => {
    const ip = p(`individuals[${i}]`);
    if (!isObject(raw)) {
      c.error(JsonIssueCode.WRONG_TYPE, `${ip} must be an object`, ip);
      return;
    }
    if (c.required(raw, "id", ip, "a non-empty string", v => typeof v === "string" && v.length > 0)) {
      const id = raw.id as string;
      if (individualIds.has(id)) {
        c.error(JsonIssueCode.DUPLICATE_ID, `Duplicate individual id '${id}'`, ip, [id]);
      }
      individualIds.add(id);
    }
    c.required(raw, "sex", ip, SEX_VALUES.map(s => `"${s}"`).join(" | "),
      v => typeof v === "string" && SEX_VALUES.includes(v));
    c.required(raw, "affected", ip, "a boolean", v => typeof v === "boolean");
    c.required(raw, "sibOrder", ip, "a number", isFiniteNumber);
    c.optional(raw, "deceased", ip, "a boolean", v => typeof v === "boolean");
    c.optional(raw, "carrier", ip, "a boolean", v => typeof v === "boolean");
    c.optional(raw, "proband", ip, "a boolean", v => typeof v === "boolean");
    c.optional(raw, "lifeStatus", ip, LIFE_STATUS_VALUES.map(s => `"${s}"`).join(" | "),
      v => typeof v === "string" && LIFE_STATUS_VALUES.includes(v));
    c.optional(raw, "adopted", ip, ADOPTION_VALUES.map(s => `"${s}"`).join(" | "),
      v => typeof v === "string" && ADOPTION_VALUES.includes(v));
    c.optional(raw, "name", ip, "a string", v => typeof v === "string");
    c.optional(raw, "dob", ip, "a string", v => typeof v === "string");
    c.optional(raw, "notes", ip, "a string", v => typeof v === "string");
    c.optional(raw, "hpoTerms", ip, "an array of strings", isStringArray);
    c.optional(raw, "tags", ip, "an array of tag ids", isStringArray);
    if (isStringArray(raw.tags)) {
      for (const tagId of raw.tags) tagRefs.push({ tagId, path: `${ip}.tags` });
    }
    // Any other property is an extension or a newer field: preserved untouched.
  });

  // ---- Partnerships ----
  const partnershipIds = new Set<string>();
  const partnerMembers = new Map<string, [string, string]>();
  (ped.partnerships as unknown[]).forEach((raw, i) => {
    const pp = p(`partnerships[${i}]`);
    if (!isObject(raw)) {
      c.error(JsonIssueCode.WRONG_TYPE, `${pp} must be an object`, pp);
      return;
    }
    let id: string | null = null;
    if (c.required(raw, "id", pp, "a non-empty string", v => typeof v === "string" && v.length > 0)) {
      id = raw.id as string;
      if (partnershipIds.has(id)) {
        c.error(JsonIssueCode.DUPLICATE_ID, `Duplicate partnership id '${id}'`, pp, [id]);
      }
      partnershipIds.add(id);
    }
    const ok1 = c.required(raw, "individual1", pp, "a string", v => typeof v === "string");
    const ok2 = c.required(raw, "individual2", pp, "a string", v => typeof v === "string");
    c.optional(raw, "consanguineous", pp, "a boolean", v => typeof v === "boolean");
    c.optional(raw, "childless", pp, CHILDLESS_VALUES.map(s => `"${s}"`).join(" | "),
      v => typeof v === "string" && CHILDLESS_VALUES.includes(v));
    c.optional(raw, "childlessReason", pp, "a string", v => typeof v === "string");
    c.optional(raw, "twins", pp, "an array of twin sets", Array.isArray);
    if (Array.isArray(raw.twins)) {
      raw.twins.forEach((t, k) => {
        const tp = `${pp}.twins[${k}]`;
        if (!isObject(t)) { c.error(JsonIssueCode.WRONG_TYPE, `${tp} must be an object`, tp); return; }
        c.required(t, "members", tp, "an array of at least two individual ids", v => isStringArray(v) && v.length >= 2);
        c.required(t, "zygosity", tp, ZYGOSITY_VALUES.map(s => `"${s}"`).join(" | "),
          v => typeof v === "string" && ZYGOSITY_VALUES.includes(v));
      });
    }
    if (ok1 && ok2) {
      const a = raw.individual1 as string;
      const b = raw.individual2 as string;
      for (const [key, member] of [["individual1", a], ["individual2", b]] as const) {
        if (!individualIds.has(member)) {
          c.error(JsonIssueCode.UNKNOWN_INDIVIDUAL,
            `Partnership '${id ?? i}' refers to unknown individual '${member}'`, `${pp}.${key}`, [member]);
        }
      }
      if (a === b) {
        c.error(JsonIssueCode.SELF_PARTNERSHIP, `Partnership '${id ?? i}' pairs individual '${a}' with itself`, pp, [a]);
      }
      if (id !== null) partnerMembers.set(id, [a, b]);
    }
  });

  // ---- parentOf ----
  const childToPartnership = new Map<string, string>();
  for (const [pid, children] of Object.entries(ped.parentOf as Obj)) {
    const cp = p(`parentOf["${pid}"]`);
    if (!partnershipIds.has(pid)) {
      c.error(JsonIssueCode.UNKNOWN_PARTNERSHIP, `parentOf key '${pid}' is not a partnership id`, cp, [pid]);
    }
    if (!isStringArray(children)) {
      c.error(JsonIssueCode.WRONG_TYPE, `${cp} must be an array of individual ids`, cp);
      continue;
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

  // ---- Twin sets (#11): members must be children of their partnership, in one set only ----
  const inSet = new Set<string>();
  (ped.partnerships as unknown[]).forEach((raw, i) => {
    if (!isObject(raw) || !Array.isArray(raw.twins)) return;
    const pid = typeof raw.id === "string" ? raw.id : "";
    const children = new Set(isStringArray((ped.parentOf as Obj)[pid]) ? ((ped.parentOf as Obj)[pid] as string[]) : []);
    const kept: unknown[] = [];
    raw.twins.forEach((t, k) => {
      if (!isObject(t) || !isStringArray(t.members)) return;
      const tp = p(`partnerships[${i}].twins[${k}]`);
      const outsiders = t.members.filter(m => !children.has(m));
      const repeated = t.members.filter(m => inSet.has(m));
      if (t.members.length < 2 || outsiders.length || repeated.length) {
        const why = outsiders.length ? `${outsiders.map(m => `'${m}'`).join(", ")} not a child of partnership '${pid}'`
          : repeated.length ? `${repeated.map(m => `'${m}'`).join(", ")} already in another twin set`
          : "fewer than two members";
        c.warning(JsonIssueCode.UNKNOWN_INDIVIDUAL, `Twin set dropped: ${why}`, tp, t.members);
        return;
      }
      for (const m of t.members) inSet.add(m);
      kept.push(t);
    });
    if (kept.length !== raw.twins.length) {
      if (kept.length) raw.twins = kept; else delete raw.twins;
    }
  });

  // ---- Optional top-level fields ----
  if (ped.pinnedPositions !== undefined && ped.pinnedPositions !== null) {
    const pp = p("pinnedPositions");
    if (!isObject(ped.pinnedPositions)) {
      c.error(JsonIssueCode.WRONG_TYPE, `${pp} must be an object`, pp);
    } else {
      for (const [id, pos] of Object.entries(ped.pinnedPositions)) {
        if (!isObject(pos) || !isFiniteNumber(pos.x) || !isFiniteNumber(pos.y)) {
          c.error(JsonIssueCode.WRONG_TYPE, `${pp}["${id}"] must be { x: number, y: number }`, `${pp}["${id}"]`);
        } else if (!individualIds.has(id)) {
          c.warning(JsonIssueCode.DANGLING_REFERENCE, `${pp} refers to unknown individual '${id}'`, `${pp}["${id}"]`, [id]);
        }
      }
    }
  }

  if (ped.canvasSettings !== undefined && ped.canvasSettings !== null) {
    const cp = p("canvasSettings");
    if (!isObject(ped.canvasSettings)) {
      c.error(JsonIssueCode.WRONG_TYPE, `${cp} must be an object`, cp);
    } else {
      const cs = ped.canvasSettings;
      c.required(cs, "nodesMoveable", cp, "a boolean", v => typeof v === "boolean");
      c.required(cs, "snapToGrid", cp, "a boolean", v => typeof v === "boolean");
      c.required(cs, "snapGridSize", cp, "a number", isFiniteNumber);
      c.optional(cs, "nameLabels", cp, NAME_LABEL_VALUES.map(s => `"${s}"`).join(" | "),
        v => typeof v === "string" && NAME_LABEL_VALUES.includes(v));
      c.optional(cs, "layoutWidth", cp, LAYOUT_WIDTH_VALUES.map(s => `"${s}"`).join(" | "),
        v => typeof v === "string" && LAYOUT_WIDTH_VALUES.includes(v));
    }
  }

  if (ped.unlockedIndividuals !== undefined && ped.unlockedIndividuals !== null) {
    const up = p("unlockedIndividuals");
    if (!isStringArray(ped.unlockedIndividuals)) {
      c.error(JsonIssueCode.WRONG_TYPE, `${up} must be an array of strings`, up);
    } else {
      for (const id of ped.unlockedIndividuals) {
        if (!individualIds.has(id)) {
          c.warning(JsonIssueCode.DANGLING_REFERENCE, `${up} refers to unknown individual '${id}'`, up, [id]);
        }
      }
    }
  }

  const tagIds = new Set<string>();
  if (ped.tags !== undefined && ped.tags !== null) {
    const tp = p("tags");
    if (!Array.isArray(ped.tags)) {
      c.error(JsonIssueCode.WRONG_TYPE, `${tp} must be an array`, tp);
    } else {
      ped.tags.forEach((raw: unknown, i: number) => {
        const tip = `${tp}[${i}]`;
        if (!isObject(raw)) {
          c.error(JsonIssueCode.WRONG_TYPE, `${tip} must be an object`, tip);
          return;
        }
        if (c.required(raw, "id", tip, "a non-empty string", v => typeof v === "string" && v.length > 0)) {
          const id = raw.id as string;
          if (tagIds.has(id)) c.error(JsonIssueCode.DUPLICATE_ID, `Duplicate tag id '${id}'`, tip, [id]);
          tagIds.add(id);
        }
        c.required(raw, "label", tip, "a string", v => typeof v === "string");
        c.required(raw, "color", tip, "a string", v => typeof v === "string");
        c.required(raw, "style", tip, TAG_STYLES.map(s => `"${s}"`).join(" | "),
          v => typeof v === "string" && TAG_STYLES.includes(v));
        c.optional(raw, "abbrev", tip, "a string", v => typeof v === "string");
      });
    }
  }
  for (const { tagId, path: refPath } of tagRefs) {
    if (!tagIds.has(tagId)) {
      c.warning(JsonIssueCode.DANGLING_REFERENCE, `${refPath} refers to unknown tag '${tagId}'`, refPath, [tagId]);
    }
  }

  // The object itself is returned so that unknown properties are preserved.
  return ped as unknown as Pedigree;
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
