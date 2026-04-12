import type { Pedigree, Individual, Partnership } from "@pedigree-editor/layout-engine";
import type { PedRow } from "./types.js";

export function convertFamily(rows: PedRow[]): Pedigree {
  // Step 1: Normalise — build complete set of individuals including phantoms
  const knownIds = new Set(rows.map(r => r.individualId));
  const allIndividuals: Individual[] = [];

  // Add defined individuals
  let sibOrderCounter = 0;
  for (const row of rows) {
    allIndividuals.push({
      id: row.individualId,
      sex: parseSex(row.sex),
      affected: parseAffection(row.affection),
      sibOrder: sibOrderCounter++,
    });
  }

  // Step 2: Resolve phantom parents and single-parent cases
  const augmentedRows: Array<{
    iid: string;
    fatherId: string;  // "0" or resolved iid
    motherId: string;
  }> = [];

  // Track phantom parents we've already created (by original referenced ID)
  const phantomRegistry = new Map<string, string>(); // pKey → generated_iid

  function getOrCreatePhantom(role: "father" | "mother"): string {
    const phantomId = `__phantom_${role}_${crypto.randomUUID().slice(0, 8)}`;
    allIndividuals.push({
      id: phantomId,
      sex: role === "father" ? "male" : "female",
      affected: false,
      sibOrder: sibOrderCounter++,
    });
    return phantomId;
  }

  for (const row of rows) {
    let fatherId = row.fatherId;
    let motherId = row.motherId;

    // Phantom parent: referenced but not in file
    if (fatherId !== "0" && !knownIds.has(fatherId)) {
      const pKey = `father:${fatherId}`;
      if (!phantomRegistry.has(pKey)) {
        phantomRegistry.set(pKey, fatherId); // keep original ID as the phantom's ID
        allIndividuals.push({
          id: fatherId,
          sex: "male",   // PAT column implies male; validator warned about mismatches
          affected: false,
          sibOrder: sibOrderCounter++,
        });
      }
    }
    if (motherId !== "0" && !knownIds.has(motherId)) {
      const pKey = `mother:${motherId}`;
      if (!phantomRegistry.has(pKey)) {
        phantomRegistry.set(pKey, motherId);
        allIndividuals.push({
          id: motherId,
          sex: "female",
          affected: false,
          sibOrder: sibOrderCounter++,
        });
      }
    }

    // Single parent: one is "0", other is not → create phantom partner
    if (fatherId !== "0" && motherId === "0") {
      motherId = getOrCreatePhantom("mother");
    } else if (fatherId === "0" && motherId !== "0") {
      fatherId = getOrCreatePhantom("father");
    }

    augmentedRows.push({ iid: row.individualId, fatherId, motherId });
  }

  // Step 3: Build partnerships (group children by (father, mother) pair)
  const partnershipMap = new Map<string, {
    individual1: string;
    individual2: string;
    children: string[];
  }>();

  for (const row of augmentedRows) {
    if (row.fatherId === "0" && row.motherId === "0") continue;

    // Canonical key: always father first (PAT column)
    const key = `${row.fatherId}__${row.motherId}`;
    if (!partnershipMap.has(key)) {
      partnershipMap.set(key, {
        individual1: row.fatherId,
        individual2: row.motherId,
        children: [],
      });
    }
    partnershipMap.get(key)!.children.push(row.iid);
  }

  // Step 4: Detect consanguinity via ancestor reachability
  const parentLookup = new Map<string, { father: string; mother: string }>();
  for (const row of augmentedRows) {
    parentLookup.set(row.iid, { father: row.fatherId, mother: row.motherId });
  }

  function getAncestors(iid: string, visited = new Set<string>()): Set<string> {
    if (visited.has(iid)) return new Set(); // cycle guard
    visited.add(iid);
    const result = new Set<string>();
    const parents = parentLookup.get(iid);
    if (!parents) return result;
    if (parents.father !== "0") {
      result.add(parents.father);
      for (const a of getAncestors(parents.father, visited)) result.add(a);
    }
    if (parents.mother !== "0") {
      result.add(parents.mother);
      for (const a of getAncestors(parents.mother, visited)) result.add(a);
    }
    return result;
  }

  const partnerships: Partnership[] = [];
  const parentOf: Record<string, string[]> = {};

  for (const [key, val] of partnershipMap.entries()) {
    const pId = `p_${key}`;
    const anc1 = getAncestors(val.individual1);
    const anc2 = getAncestors(val.individual2);
    const isConsanguineous =
      anc1.has(val.individual2) ||
      anc2.has(val.individual1) ||
      [...anc1].some(a => anc2.has(a));

    partnerships.push({
      id: pId,
      individual1: val.individual1,
      individual2: val.individual2,
      consanguineous: isConsanguineous || undefined,
    });
    parentOf[pId] = val.children;
  }

  // Step 5: Assign final sibOrder within each sibling group
  for (const children of Object.values(parentOf)) {
    children.forEach((childId, i) => {
      const ind = allIndividuals.find(x => x.id === childId);
      if (ind) ind.sibOrder = i;
    });
  }
  // Roots (no parents): assign consecutive order
  const childIds = new Set(Object.values(parentOf).flat());
  let rootOrder = 0;
  for (const ind of allIndividuals) {
    if (!childIds.has(ind.id) && !ind.id.startsWith("__phantom_")) {
      ind.sibOrder = rootOrder++;
    }
  }

  return {
    individuals: allIndividuals,
    partnerships,
    parentOf,
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseSex(raw: string): "male" | "female" | "unknown" {
  switch (raw.trim().toLowerCase()) {
    case "1": case "m": case "male":   return "male";
    case "2": case "f": case "female": return "female";
    default:                           return "unknown";
  }
}

function parseAffection(raw: string): boolean {
  // Standard: 2=affected, 1=unaffected, 0/-9=missing → false
  return raw === "2";
}
