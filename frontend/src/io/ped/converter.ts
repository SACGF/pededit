import type { Pedigree, Individual, Partnership } from "@pedigree-editor/layout-engine";
import type { PedRow } from "./types.js";

/**
 * Prefix of the IDs the importer invents for the missing partner of a single
 * parent. They are internal and never shown as a label.
 */
export const PHANTOM_ID_PREFIX = "__phantom_";

export function isPhantomId(id: string): boolean {
  return id.startsWith(PHANTOM_ID_PREFIX);
}

export function convertFamily(rows: PedRow[]): Pedigree {
  // Step 1: Normalise — build complete set of individuals including phantoms
  const knownIds = new Set(rows.map(r => r.individualId));
  const allIndividuals: Individual[] = [];

  // Add defined individuals
  let sibOrderCounter = 0;
  for (const row of rows) {
    allIndividuals.push({
      id: row.individualId,
      // The PED ID is the only label the file carries; show it (#66), so a
      // PED round trip keeps what the user sees and exports.
      name: row.individualId,
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
    const phantomId = `${PHANTOM_ID_PREFIX}${role}_${crypto.randomUUID().slice(0, 8)}`;
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
          name: fatherId,
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
          name: motherId,
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

  // Step 4: partnerships. A related couple is not flagged: the double line
  // is worked out from kinship when the pedigree is drawn (#85).
  const partnerships: Partnership[] = [];
  const parentOf: Record<string, string[]> = {};

  for (const [key, val] of partnershipMap.entries()) {
    const pId = `p_${key}`;
    partnerships.push({
      id: pId,
      individual1: val.individual1,
      individual2: val.individual2,
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
    if (!childIds.has(ind.id) && !isPhantomId(ind.id)) {
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

/**
 * Sex codes the importer understands: PED 1/2/0, and the letters and words R
 * and spreadsheets write. Returns null for anything else (read as unknown, with
 * a validator warning). The validator uses this too, so the two always agree.
 */
export function recogniseSex(raw: string): "male" | "female" | "unknown" | null {
  switch (raw.trim().toLowerCase()) {
    case "1": case "m": case "male":                  return "male";
    case "2": case "f": case "female":                return "female";
    case "0": case "u": case "unknown": case "na":    return "unknown";
    default:                                          return null;
  }
}

function parseSex(raw: string): "male" | "female" | "unknown" {
  return recogniseSex(raw) ?? "unknown";
}

function parseAffection(raw: string): boolean {
  // Standard: 2=affected, 1=unaffected, 0/-9=missing → false
  return raw === "2";
}
