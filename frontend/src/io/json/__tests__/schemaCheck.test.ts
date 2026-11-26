import { describe, it, expect } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { repairShape, shapeIssues } from "../schemaCheck";
import { M, F, couple, build } from "../../../fixtures/features";

/** A pedigree as the server may have stored it before #229: wrong types it coerced and kept as sent. */
function stored(): Pedigree {
  const p = build([M("f"), F("m"), F("c")], [couple("p", "f", "m")], { p: ["c"] });
  Object.assign(p.individuals[0]!, { deceased: "false", affected: "yes", sibOrder: "1", name: 5, carrier: "", futureField: "false" });
  Object.assign(p.individuals[2]!, { hpoTerms: [7, "HP:0001250"], tagOnset: { c: 40 }, proband: "maybe" });
  Object.assign(p.partnerships[0]!, { ended: 0 });
  return p;
}

describe("repairShape: a stored pedigree read as the server read it (#229)", () => {
  it("reads each wrong type the way the server did, and keeps unknown fields", () => {
    const p = stored();
    repairShape(p, "Pedigree");
    const [f, , c] = p.individuals;
    expect(f).toMatchObject({ deceased: false, affected: true, sibOrder: 1, name: "5", futureField: "false" });
    expect(f).not.toHaveProperty("carrier");
    expect(c!.hpoTerms).toEqual(["7", "HP:0001250"]);
    expect(c!.tagOnset).toEqual({ c: "40" });
    // Not a value the server could have read: dropped, being optional.
    expect(c).not.toHaveProperty("proband");
    expect(p.partnerships[0]!.ended).toBe(false);
    expect(shapeIssues(p, "Pedigree", "")).toEqual([]);
  });

  it("leaves a valid pedigree as it is", () => {
    const p = build([M("f", { deceased: true }), F("m")], [couple("p", "f", "m", { ended: true })], {});
    const before = structuredClone(p);
    repairShape(p, "Pedigree");
    expect(p).toEqual(before);
  });
});
