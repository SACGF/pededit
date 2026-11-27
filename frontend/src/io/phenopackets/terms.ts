/**
 * Ontology terms for what PedEdit records without one, and the `metaData`
 * resources that name the ontologies a file uses.
 *
 * - A condition (a tag) has no code in PedEdit, so it is written with the
 *   local prefix `PEDEDIT` and its tag id ("PEDEDIT:3f2a...") and its label.
 *   A tag made on import from another tool's term keeps that term's id as its
 *   tag id ("MONDO:0007254"), and is written back with it.
 * - Gender identity is the SNOMED CT "Identifies as ... gender" finding, the
 *   codes of the HL7 gender identity value set.
 */
import type { GenderIdentity, Tag } from "@pedigree-editor/layout-engine";
import { nextTagColor } from "../../pedigree/tags";

export interface OntologyClass { id: string; label: string }

/** The prefix of the terms written for conditions, which mean nothing outside the file. */
export const LOCAL_PREFIX = "PEDEDIT";

const CURIE = /^[A-Za-z][A-Za-z0-9_.]*:\S+$/;

/** The term a condition is written with. */
export function conditionTerm(tag: Pick<Tag, "id" | "label">): OntologyClass {
  return { id: CURIE.test(tag.id) ? tag.id : `${LOCAL_PREFIX}:${tag.id}`, label: tag.label };
}

/**
 * The tag id a condition's term comes back as: the local part of a PedEdit
 * term, else the term id, or for a term with no id its label.
 */
export function conditionTagId(term: OntologyClass): string {
  if (!term.id) return term.label;
  return term.id.startsWith(`${LOCAL_PREFIX}:`) ? term.id.slice(LOCAL_PREFIX.length + 1) : term.id;
}

/**
 * The conditions a file's diseases make, in the order first met: a quadrant
 * tag each, coloured from the palette as the Conditions and tags dialog
 * colours new ones, since the file carries no colour.
 */
export function conditionTagsFor(terms: readonly OntologyClass[]): Tag[] {
  const tags: Tag[] = [];
  for (const term of terms) {
    const id = conditionTagId(term);
    if (!id || tags.some(t => t.id === id)) continue;
    tags.push({ id, label: term.label || term.id, color: nextTagColor(tags), style: "quadrant" });
  }
  return tags;
}

export const GENDER_TERMS: Record<GenderIdentity, OntologyClass> = {
  man:       { id: "SNOMEDCT:446151000124109", label: "Identifies as male gender" },
  woman:     { id: "SNOMEDCT:446141000124107", label: "Identifies as female gender" },
  nonbinary: { id: "SNOMEDCT:33791000087105", label: "Identifies as nonbinary gender" },
};

/** The gender identity of a `subject.gender` term: by its id, else by words in its label. */
export function genderOf(term: Partial<OntologyClass>): GenderIdentity | undefined {
  const byId = (Object.keys(GENDER_TERMS) as GenderIdentity[]).find(g => GENDER_TERMS[g].id === term.id);
  if (byId) return byId;
  const label = (term.label ?? "").toLowerCase();
  if (/non-?binary|gender ?diverse|genderqueer|non-?conforming/.test(label)) return "nonbinary";
  if (/\b(female|woman|girl)\b/.test(label)) return "woman";
  if (/\b(male|man|boy)\b/.test(label)) return "man";
  return undefined;
}

export interface Resource {
  id: string;
  name: string;
  url: string;
  version: string;
  namespacePrefix: string;
  iriPrefix: string;
}

/** Resources for the prefixes PedEdit writes or commonly reads. The version of the outside ontologies is not known. */
const RESOURCES: Record<string, Omit<Resource, "namespacePrefix">> = {
  [LOCAL_PREFIX]: { id: "pededit", name: "PedEdit conditions, local to this file", url: "https://pededit.com", version: "1", iriPrefix: "https://pededit.com/condition/" },
  HP: { id: "hp", name: "human phenotype ontology", url: "http://purl.obolibrary.org/obo/hp.owl", version: "unknown", iriPrefix: "http://purl.obolibrary.org/obo/HP_" },
  SNOMEDCT: { id: "snomedct", name: "SNOMED CT", url: "http://snomed.info/sct", version: "unknown", iriPrefix: "http://snomed.info/id/" },
  MONDO: { id: "mondo", name: "Mondo Disease Ontology", url: "http://purl.obolibrary.org/obo/mondo.obo", version: "unknown", iriPrefix: "http://purl.obolibrary.org/obo/MONDO_" },
  OMIM: { id: "omim", name: "Online Mendelian Inheritance in Man", url: "https://www.omim.org", version: "unknown", iriPrefix: "https://www.omim.org/entry/" },
  ORPHA: { id: "orpha", name: "Orphanet Rare Disease Ontology", url: "http://www.orpha.net/ontology/orphanet.owl", version: "unknown", iriPrefix: "http://www.orpha.net/ORDO/Orphanet_" },
};

/** One resource per prefix of `ids`, in order of first use. */
export function resourcesFor(ids: Iterable<string>): Resource[] {
  const prefixes = [...new Set([...ids].map(id => id.split(":")[0]!).filter(Boolean))];
  return prefixes.map(prefix => {
    const known = RESOURCES[prefix];
    return known
      ? { ...known, namespacePrefix: prefix }
      : { id: prefix.toLowerCase(), name: prefix, url: "", version: "unknown", namespacePrefix: prefix, iriPrefix: "" };
  });
}
