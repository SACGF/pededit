import type { LayoutInput, Pedigree, Individual } from "./types.js";

/** Raw flat row from a PED file (1-based sex, 0 = no parent). */
export interface FlatPedRow {
  id: number;
  father: number;
  mother: number;
  sex: number; // 1=male, 2=female
}

/**
 * Build a LayoutInput from a flat PED-style array.
 * IDs are renumbered 1..n in array order.
 */
export function buildLayoutInput(rows: FlatPedRow[]): LayoutInput {
  const n = rows.length;
  const findex = new Int32Array(n + 1);
  const mindex = new Int32Array(n + 1);
  const sex = new Uint8Array(n + 1);

  // Build id→1-based index map
  const idToIdx = new Map<number, number>();
  for (let i = 0; i < rows.length; i++) {
    idToIdx.set(rows[i]!.id, i + 1);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const idx = i + 1;
    findex[idx] = row.father === 0 ? 0 : (idToIdx.get(row.father) ?? 0);
    mindex[idx] = row.mother === 0 ? 0 : (idToIdx.get(row.mother) ?? 0);
    sex[idx] = row.sex === 1 ? 1 : row.sex === 2 ? 2 : 3;
  }

  return { n, findex, mindex, sex };
}

/**
 * Build a Pedigree (public model) from a flat PED-style array.
 * Creates one Partnership per unique (father, mother) pair.
 */
export function buildPedigreeFromFlat(rows: FlatPedRow[]): Pedigree {
  const individuals: Individual[] = rows.map(row => ({
    id: String(row.id),
    sex: row.sex === 1 ? "male" : row.sex === 2 ? "female" : "unknown",
    affected: false,
  }));

  // Group children by (father, mother) pair
  const partnershipMap = new Map<string, { ind1: string; ind2: string; children: string[] }>();
  for (const row of rows) {
    if (row.father !== 0 && row.mother !== 0) {
      const key = `${row.father}_${row.mother}`;
      if (!partnershipMap.has(key)) {
        partnershipMap.set(key, {
          ind1: String(row.father),
          ind2: String(row.mother),
          children: [],
        });
      }
      partnershipMap.get(key)!.children.push(String(row.id));
    }
  }

  const partnerships = Array.from(partnershipMap.entries()).map(([key, val]) => ({
    id: `p_${key}`,
    individual1: val.ind1,
    individual2: val.ind2,
  }));

  const parentOf: Record<string, string[]> = {};
  for (const [key, val] of partnershipMap.entries()) {
    parentOf[`p_${key}`] = val.children;
  }

  return { individuals, partnerships, parentOf };
}
