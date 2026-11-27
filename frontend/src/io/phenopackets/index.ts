/**
 * GA4GH Phenopackets v2, as protobuf JSON. Export writes a whole `Family`
 * message: the `pedigree` (PED with named fields), a Phenopacket for the
 * proband and one for each relative, and `consanguinousParents`. Import reads
 * a bare `Pedigree` message (`{ "persons": [...] }`) or a `Family`: the
 * persons become `PedRow`s and go through the PED validator and converter,
 * then the phenopackets add what PED cannot hold. What the export cannot
 * carry is listed by `exportLosses` in `../losses.ts`.
 * https://phenopacket-schema.readthedocs.io/en/latest/family.html
 */
import { isAffected, type Individual, type Pedigree } from "@pedigree-editor/layout-engine";
import { importPedRows } from "../ped/index.js";
import { exportIds } from "../ped/exporter.js";
import { parentCoupleOf, parentRoles } from "../../pedigree/graph";
import { conditionTags } from "../../pedigree/conditions";
import { consanguinityTest } from "../../pedigree/consanguinity";
import { DEFAULT_FAMILY_ID } from "../ped/parser.js";
import type { ImportResult, PedRow, IssueSeverity, ValidationIssue } from "../ped/types.js";
import { field, isObject, list, text, type Obj } from "./read.js";
import { ageElement, dateOf, deathDate, deathElement, elementText, timestamp, type TimeElement } from "./time.js";
import { conditionTagId, conditionTagsFor, conditionTerm, GENDER_TERMS, genderOf, resourcesFor, type OntologyClass } from "./terms.js";

export enum PhenopacketsIssueCode {
  INVALID_JSON          = "INVALID_JSON",
  NO_PERSONS            = "NO_PERSONS",          // neither persons nor pedigree.persons is a list
  NOT_A_PERSON          = "NOT_A_PERSON",        // an entry of persons is not an object
  MISSING_INDIVIDUAL_ID = "MISSING_INDIVIDUAL_ID",
  OTHER_SEX             = "OTHER_SEX",           // OTHER_SEX read as unknown sex
  FAMILY_FIELDS_IGNORED = "FAMILY_FIELDS_IGNORED", // fields of the Family or its phenopackets not read
  NO_SUCH_PERSON        = "NO_SUCH_PERSON",      // a phenopacket whose subject is not in the pedigree
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

/** What `metaData.createdBy` says in a file PedEdit wrote. */
export const CREATED_BY = "PedEdit";

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
 * their individualId, as a PED import does, except the `ind1`, `ind2` that
 * PedEdit writes for someone with no name.
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
  if (found.family && !result.hasErrors) readFamily(found.family, result.pedigrees.map(p => p.pedigree), issues);
  return { ...result, issues: [...issues, ...result.issues] };
}

const FAMILY_READ = new Set(["id", "proband", "relatives", "consanguinousParents", "pedigree", "metaData"]);
const PACKET_READ = new Set(["id", "subject", "phenotypicFeatures", "diseases", "metaData"]);
const SUBJECT_READ = new Set(["id", "dateOfBirth", "timeAtLastEncounter", "vitalStatus", "sex", "gender"]);
const VITAL_READ = new Set(["status", "timeOfDeath"]);
const DISEASE_READ = new Set(["term", "excluded", "onset"]);
const FEATURE_READ = new Set(["type", "excluded"]);

/** The keys of a message not in `read`, by their JSON names, as "where.key". */
function notRead(o: Obj, read: Set<string>, where: string, into: Set<string>) {
  for (const key of Object.keys(o)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    if (!read.has(camel)) into.add(where ? `${where}.${camel}` : camel);
  }
}

const term = (v: unknown): OntologyClass | undefined =>
  isObject(v) && (text(field(v, "id")) || text(field(v, "label"))) ? { id: text(field(v, "id")), label: text(field(v, "label")) } : undefined;

/**
 * Add what a Family's phenopackets say to the pedigrees its persons made,
 * matching each phenopacket's subject to a person by ID. The pedigrees are
 * fresh from the converter, so they are changed in place.
 */
function readFamily(family: Obj, pedigrees: Pedigree[], issues: PhenopacketsIssue[]) {
  const unread = new Set<string>();
  notRead(family, FAMILY_READ, "", unread);
  const where = new Map<string, { ind: Individual; pedigree: Pedigree }>();
  for (const pedigree of pedigrees) for (const ind of pedigree.individuals) where.set(ind.id, { ind, pedigree });

  const proband = isObject(field(family, "proband")) ? field(family, "proband") as Obj : undefined;
  const packets = [...(proband ? [proband] : []), ...list(family, "relatives")];
  // Per pedigree, the condition terms in the order first met, and who is affected with which.
  const terms = new Map<Pedigree, OntologyClass[]>();
  const affectedWith = new Map<Individual, { term: OntologyClass; onset?: string }[]>();
  let probandInd: Individual | undefined;

  for (const packet of packets) {
    const subject = isObject(field(packet, "subject")) ? field(packet, "subject") as Obj : {};
    const id = text(field(subject, "id")) || text(field(packet, "id"));
    const found = where.get(id);
    if (!found) {
      issues.push({ severity: "warning", code: PhenopacketsIssueCode.NO_SUCH_PERSON, message: `The phenopacket for '${id || "(no id)"}' is not about anyone in the pedigree, so it is not read` });
      continue;
    }
    const { ind, pedigree } = found;
    if (packet === proband) {
      ind.proband = true;
      probandInd = ind;
    }
    notRead(packet, PACKET_READ, "phenopacket", unread);
    notRead(subject, SUBJECT_READ, "subject", unread);

    const dob = field(subject, "dateOfBirth");
    if (dob !== undefined) {
      const date = dateOf(dob);
      if (date) ind.dob = date;
      else unread.add("subject.dateOfBirth");
    }
    const vital = field(subject, "vitalStatus");
    if (isObject(vital)) {
      notRead(vital, VITAL_READ, "vitalStatus", unread);
      const status = field(vital, "status");
      if (status === "DECEASED" || status === 2) {
        ind.deceased = true;
        const death = field(vital, "timeOfDeath");
        if (death !== undefined) {
          const date = deathDate(death);
          const age = date ? undefined : elementText(death);
          if (date) ind.dod = date;
          else if (age) ind.age = `d. ${age}`;
          else unread.add("vitalStatus.timeOfDeath");
        }
      }
    }
    const last = field(subject, "timeAtLastEncounter");
    if (last !== undefined) {
      const age = elementText(last);
      if (!age) unread.add("subject.timeAtLastEncounter");
      else if (!ind.age) ind.age = age;
    }
    const gender = term(field(subject, "gender"));
    if (gender) {
      const g = genderOf(gender);
      if (g) ind.genderIdentity = g;
      else unread.add("subject.gender");
    }

    const hpo: string[] = [];
    for (const feature of list(packet, "phenotypicFeatures")) {
      notRead(feature, FEATURE_READ, "phenotypicFeatures", unread);
      const type = term(field(feature, "type"));
      if (field(feature, "excluded") === true) unread.add("phenotypicFeatures.excluded");
      else if (type?.id) hpo.push(type.id);
    }
    if (hpo.length > 0) ind.hpoTerms = [...new Set(hpo)];

    for (const disease of list(packet, "diseases")) {
      notRead(disease, DISEASE_READ, "diseases", unread);
      const t = term(field(disease, "term"));
      if (!t) continue;
      const known = terms.get(pedigree) ?? [];
      terms.set(pedigree, [...known, t]);
      if (field(disease, "excluded") === true) continue;
      const onsetField = field(disease, "onset");
      const onset = onsetField === undefined ? undefined : elementText(onsetField);
      if (onsetField !== undefined && !onset) unread.add("diseases.onset");
      affectedWith.set(ind, [...(affectedWith.get(ind) ?? []), { term: t, onset }]);
    }
  }

  // Conditions become tags; someone affected with one is affected through it, not the plain flag.
  for (const pedigree of pedigrees) {
    const tags = conditionTagsFor(terms.get(pedigree) ?? []);
    if (tags.length === 0) continue;
    pedigree.tags = tags;
    for (const ind of pedigree.individuals) {
      const mine = affectedWith.get(ind);
      if (!mine) continue;
      const ids = new Set(mine.map(m => conditionTagId(m.term)));
      ind.tags = tags.filter(t => ids.has(t.id)).map(t => t.id);
      ind.affected = false;
      for (const m of mine) if (m.onset) ind.tagOnset = { ...ind.tagOnset, [conditionTagId(m.term)]: m.onset };
    }
  }

  // The proband's parents, the only couple the Family can mark consanguineous.
  if (field(family, "consanguinousParents") === true && probandInd) {
    const pedigree = where.get(probandInd.id)!.pedigree;
    const couple = parentCoupleOf(pedigree, probandInd.id);
    if (couple && !consanguinityTest(pedigree)(couple.individual1, couple.individual2)) couple.consanguineous = true;
  }

  // PedEdit writes ind1, ind2 for someone with no name (`exportIds`).
  const metaData = isObject(field(family, "metaData")) ? field(family, "metaData") as Obj : {};
  if (text(field(metaData, "createdBy")) === CREATED_BY) {
    for (const { ind } of where.values()) if (ind.name === ind.id && /^ind\d+$/.test(ind.id)) delete ind.name;
  }

  if (unread.size > 0) {
    const names = [...unread];
    issues.push({
      severity: "info",
      code: PhenopacketsIssueCode.FAMILY_FIELDS_IGNORED,
      message: `Not read from the family: ${names.join(", ")}`,
    });
  }
}

export interface PhenopacketsExportOptions {
  familyId?: string;   // default "1", as PED
  /** `metaData.created`, an ISO timestamp; default now. */
  created?: string;
}

/**
 * Who the Family's `proband` is: the first person marked proband, else the
 * first person, since the field is required.
 */
export function familyProband(pedigree: Pedigree): Individual | undefined {
  return pedigree.individuals.find(i => i.proband) ?? pedigree.individuals[0];
}

/**
 * An age as written: with "d. " for someone deceased with no date of death,
 * as their age at death; otherwise as the age at the last encounter. Empty
 * when it cannot be written so that it reads back the same.
 */
export function ageElements(ind: Individual): { atDeath?: TimeElement; atLastEncounter?: TimeElement } {
  if (!ind.age) return {};
  const gestational = !!ind.lifeStatus;
  const atDeath = ind.age.match(/^d\. (.+)$/);
  if (atDeath) {
    const te = ind.deceased && !ind.dod ? ageElement(atDeath[1]!, gestational) : undefined;
    return te ? { atDeath: te } : {};
  }
  const te = ageElement(ind.age, gestational);
  return te ? { atLastEncounter: te } : {};
}

/** The onset of a condition the person is affected with, when it can be written. */
export function onsetElement(ind: Individual, tagId: string): TimeElement | undefined {
  const value = ind.tagOnset?.[tagId];
  return value && ind.tags?.includes(tagId) ? ageElement(value) : undefined;
}

/** The persons of the pedigree, one per individual, with the IDs of `exportIds`. */
function persons(pedigree: Pedigree, familyId: string, id: Map<string, string>): PhenopacketsPerson[] {
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
 * A Phenopackets v2 Family message as protobuf JSON (camelCase names, enums
 * as strings). Every person is in `pedigree` and has a Phenopacket, the
 * proband's in `proband` and everyone else's in `relatives`, with their dates,
 * age, vital status, gender identity, HPO terms and a disease per condition
 * of the pedigree: affected with it, with its onset, or `excluded`.
 */
export function exportPhenopackets(pedigree: Pedigree, options: PhenopacketsExportOptions = {}): string {
  const familyId = options.familyId ?? DEFAULT_FAMILY_ID;
  // JSON has no delimiter to protect, so names keep their spaces as in the R dialect.
  const id = exportIds(pedigree, true);
  const conditions = conditionTags(pedigree);
  const used: string[] = [];
  const cls = (c: OntologyClass) => { used.push(c.id); return c; };
  const metaData: Obj = {
    created: options.created ?? new Date().toISOString(),
    createdBy: CREATED_BY,
    resources: [],
    phenopacketSchemaVersion: "2.0",
  };

  const packet = (ind: Individual): Obj => {
    const pid = id.get(ind.id)!;
    const ages = ageElements(ind);
    const dob = ind.dob ? timestamp(ind.dob) : undefined;
    const death = ind.dod ? deathElement(ind.dod) ?? ages.atDeath : ages.atDeath;
    const gender = ind.genderIdentity ? GENDER_TERMS[ind.genderIdentity] : undefined;
    const subject: Obj = {
      id: pid,
      ...(dob && { dateOfBirth: dob }),
      ...(ages.atLastEncounter && { timeAtLastEncounter: ages.atLastEncounter }),
      ...((ind.deceased || ind.dod) && { vitalStatus: { status: "DECEASED", ...(death && { timeOfDeath: death }) } }),
      sex: ind.sex === "male" ? "MALE" : ind.sex === "female" ? "FEMALE" : "UNKNOWN_SEX",
      ...(gender && { gender: cls(gender) }),
    };
    for (const te of [ages.atLastEncounter, death]) {
      const c = te && isObject(te.ontologyClass) ? te.ontologyClass as unknown as OntologyClass : undefined;
      if (c) used.push(c.id);
    }
    const features = (ind.hpoTerms ?? []).map(code => ({ type: cls({ id: code, label: code }) }));
    const diseases = conditions.map(tag => {
      const t = cls(conditionTerm(tag));
      if (!ind.tags?.includes(tag.id)) return { term: t, excluded: true };
      const onset = onsetElement(ind, tag.id);
      if (onset && isObject(onset.ontologyClass)) used.push((onset.ontologyClass as unknown as OntologyClass).id);
      return { term: t, ...(onset && { onset }) };
    });
    return {
      id: pid,
      subject,
      ...(features.length > 0 && { phenotypicFeatures: features }),
      ...(diseases.length > 0 && { diseases }),
      metaData,
    };
  };

  const proband = familyProband(pedigree);
  const couple = proband ? parentCoupleOf(pedigree, proband.id) : undefined;
  const family = {
    id: familyId,
    ...(proband && { proband: packet(proband) }),
    relatives: pedigree.individuals.filter(i => i !== proband).map(packet),
    consanguinousParents: !!couple && consanguinityTest(pedigree)(couple.individual1, couple.individual2),
    pedigree: { persons: persons(pedigree, familyId, id) },
    metaData,
  };
  metaData.resources = resourcesFor(used);
  return JSON.stringify(family, null, 2) + "\n";
}
