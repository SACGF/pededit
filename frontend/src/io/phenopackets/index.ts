/**
 * GA4GH Phenopackets v2 pedigree, as protobuf JSON: a `Pedigree` message
 * (`{ "persons": [...] }`) or a `Family` message holding one in `pedigree`.
 * Each Person is a PED row with named fields, so import turns persons into
 * `PedRow`s and runs the PED validator and converter, and export writes what
 * `exportPed` writes. https://phenopacket-schema.readthedocs.io/en/latest/pedigree.html
 */
import { isAffected, type Pedigree } from "@pedigree-editor/layout-engine";
import { importPedRows } from "../ped/index.js";
import { exportIds } from "../ped/exporter.js";
import { parentCoupleOf, parentRoles } from "../../pedigree/graph";
import { DEFAULT_FAMILY_ID } from "../ped/parser.js";
import type { ImportResult, PedRow, IssueSeverity, ValidationIssue } from "../ped/types.js";

export enum PhenopacketsIssueCode {
  INVALID_JSON          = "INVALID_JSON",
  NO_PERSONS            = "NO_PERSONS",          // neither persons nor pedigree.persons is a list
  NOT_A_PERSON          = "NOT_A_PERSON",        // an entry of persons is not an object
  MISSING_INDIVIDUAL_ID = "MISSING_INDIVIDUAL_ID",
  OTHER_SEX             = "OTHER_SEX",           // OTHER_SEX read as unknown sex
  FAMILY_FIELDS_IGNORED = "FAMILY_FIELDS_IGNORED",
}

interface PhenopacketsIssue {
  severity: IssueSeverity;
  code: PhenopacketsIssueCode;
  message: string;
}

export interface PhenopacketsImportResult extends Omit<ImportResult, "issues"> {
  issues: Array<ValidationIssue | PhenopacketsIssue>;
}

/** One Person of a Phenopackets pedigree, as written in protobuf JSON. */
export interface PhenopacketsPerson {
  familyId: string;
  individualId: string;
  paternalId: string;
  maternalId: string;
  sex: "UNKNOWN_SEX" | "FEMALE" | "MALE" | "OTHER_SEX";
  affectedStatus: "MISSING" | "UNAFFECTED" | "AFFECTED";
}

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** The persons list of a Pedigree message, or of the Family message around one. */
function personsOf(doc: unknown): { persons: unknown[]; family?: Obj } | null {
  if (!isObject(doc)) return null;
  if (Array.isArray(doc.persons)) return { persons: doc.persons };
  if (isObject(doc.pedigree) && Array.isArray(doc.pedigree.persons)) return { persons: doc.pedigree.persons, family: doc };
  return null;
}

/**
 * Whether a JSON file is a Phenopackets pedigree or family, so the import
 * dialog can tell it from a PedEdit file, which also has `pedigree` but
 * whose people are `individuals`.
 */
export function isPhenopacketsJson(input: string): boolean {
  try {
    return personsOf(JSON.parse(input)) !== null;
  } catch {
    return false;
  }
}

/**
 * A field by its JSON name or its proto name: protobuf JSON readers accept
 * both (`individualId`, `individual_id`).
 */
function field(person: Obj, camel: string): unknown {
  if (camel in person) return person[camel];
  return person[camel.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)];
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/**
 * Sex as a PED code. Protobuf JSON may write an enum by number, and the
 * numbers are not PED's: FEMALE is 1 and MALE is 2. A field left out is the
 * default, UNKNOWN_SEX. Anything else is passed on as written, for the PED
 * validator to report.
 */
function sexCode(v: unknown): string {
  switch (v) {
    case undefined: case null: case "UNKNOWN_SEX": case 0: return "0";
    case "FEMALE": case 1: return "2";
    case "MALE": case 2: return "1";
    case "OTHER_SEX": case 3: return "0";
    default: return String(v);
  }
}

/** Affected status as a PED code. The numbers happen to be PED's own. */
function affectionCode(v: unknown): string {
  switch (v) {
    case undefined: case null: case "MISSING": case 0: return "0";
    case "UNAFFECTED": case 1: return "1";
    case "AFFECTED": case 2: return "2";
    default: return String(v);
  }
}

/**
 * Read a Phenopackets pedigree or family. Never throws; problems come back
 * as issues, with the PED importer's codes for everything it checks. A parent
 * ID of "0" (what the specification writes for a founder), an empty string
 * or a field left out means no parent. Each person gets a PedEdit name from
 * their individualId, as a PED import does.
 */
export function importPhenopackets(input: string): PhenopacketsImportResult {
  const fail = (code: PhenopacketsIssueCode, message: string): PhenopacketsImportResult =>
    ({ pedigrees: [], issues: [{ severity: "error", code, message }], hasErrors: true });

  let doc: unknown;
  try {
    doc = JSON.parse(input);
  } catch {
    return fail(PhenopacketsIssueCode.INVALID_JSON, "The file is not valid JSON");
  }
  const found = personsOf(doc);
  if (!found) return fail(PhenopacketsIssueCode.NO_PERSONS, "No persons list: expected a Phenopackets Pedigree ({\"persons\": [...]}) or a Family with a pedigree");

  const issues: PhenopacketsIssue[] = [];
  if (found.family) {
    const ignored = Object.keys(found.family).filter(k => k !== "pedigree");
    if (ignored.length > 0) {
      issues.push({
        severity: "info",
        code: PhenopacketsIssueCode.FAMILY_FIELDS_IGNORED,
        message: `Only the family's pedigree is read; ${ignored.join(", ")} ${ignored.length === 1 ? "is" : "are"} not`,
      });
    }
  }

  const rows: PedRow[] = [];
  found.persons.forEach((person, i) => {
    const n = i + 1;
    if (!isObject(person)) {
      issues.push({ severity: "error", code: PhenopacketsIssueCode.NOT_A_PERSON, message: `Person ${n} is not an object` });
      return;
    }
    const individualId = text(field(person, "individualId"));
    if (!individualId) {
      issues.push({ severity: "error", code: PhenopacketsIssueCode.MISSING_INDIVIDUAL_ID, message: `Person ${n} has no individualId` });
      return;
    }
    const parent = (v: unknown) => text(v) || "0";
    const sex = field(person, "sex");
    if (sex === "OTHER_SEX" || sex === 3) {
      issues.push({
        severity: "warning",
        code: PhenopacketsIssueCode.OTHER_SEX,
        message: `Individual '${individualId}': sex OTHER_SEX is drawn as unknown sex`,
      });
    }
    rows.push({
      familyId: text(field(person, "familyId")) || DEFAULT_FAMILY_ID,
      individualId,
      fatherId: parent(field(person, "paternalId")),
      motherId: parent(field(person, "maternalId")),
      sex: sexCode(sex),
      affection: affectionCode(field(person, "affectedStatus")),
      // The person's place in the list, which the PED validator reports as a line.
      lineNumber: n,
      extraColumns: [],
    });
  });

  if (issues.some(i => i.severity === "error")) return { pedigrees: [], issues, hasErrors: true };
  if (rows.length === 0) return fail(PhenopacketsIssueCode.NO_PERSONS, "The pedigree has no persons");
  const result = importPedRows(rows);
  return { ...result, issues: [...issues, ...result.issues] };
}

export interface PhenopacketsExportOptions {
  familyId?: string;   // default "1", as PED
}

/** The persons of a Phenopackets pedigree for `pedigree`, one per individual. */
export function phenopacketsPersons(pedigree: Pedigree, options: PhenopacketsExportOptions = {}): PhenopacketsPerson[] {
  const familyId = options.familyId ?? DEFAULT_FAMILY_ID;
  // JSON has no delimiter to protect, so names keep their spaces as in the R dialect.
  const id = exportIds(pedigree, true);
  return pedigree.individuals.map(ind => {
    // The father role, as exportPed decides PAT.
    const couple = parentCoupleOf(pedigree, ind.id);
    const p = couple ? parentRoles(pedigree, couple) : undefined;
    return {
      familyId,
      individualId: id.get(ind.id)!,
      paternalId: p ? id.get(p.father) ?? "0" : "0",
      maternalId: p ? id.get(p.mother) ?? "0" : "0",
      // Biological sex, never gender identity, as in PED.
      sex: ind.sex === "male" ? "MALE" : ind.sex === "female" ? "FEMALE" : "UNKNOWN_SEX",
      affectedStatus: isAffected(ind, pedigree) ? "AFFECTED" : "UNAFFECTED",
    };
  });
}

/**
 * A Phenopackets v2 Pedigree message as protobuf JSON (camelCase names, enums
 * as strings, every field written). It holds what PED holds, so it loses what
 * PED loses: the `pedLost*` lists in `ped/exporter.ts` apply unchanged.
 */
export function exportPhenopackets(pedigree: Pedigree, options: PhenopacketsExportOptions = {}): string {
  return JSON.stringify({ persons: phenopacketsPersons(pedigree, options) }, null, 2) + "\n";
}
