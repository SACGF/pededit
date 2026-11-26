import { describe, expect, it } from "vitest";
import { readPedText } from "../ped/text";
import { PED_TEXT_PLACEHOLDER } from "../../components/PedTextBox";

const byName = (r: ReturnType<typeof readPedText>, name: string) => r.pedigree?.individuals.find(i => i.name === name);

describe("readPedText (#218)", () => {
  it("reads rows split by a mix of spaces and tabs", () => {
    const r = readPedText("fam1 dad\t0  0 1 1\nfam1\tmum 0 0\t2 1\nfam1  kid dad\tmum 2   2\n");
    expect(r.errors).toEqual([]);
    expect(r.current).toBe(true);
    expect(r.familyId).toBe("fam1");
    expect(r.pedigree?.individuals.map(i => i.name).sort()).toEqual(["dad", "kid", "mum"]);
    expect(byName(r, "kid")?.sex).toBe("female");
    expect(byName(r, "kid")?.affected).toBe(true);
    expect(byName(r, "dad")?.affected).toBeFalsy();
  });

  it("the placeholder is a pedigree of three", () => {
    expect(readPedText(PED_TEXT_PLACEHOLDER).pedigree?.individuals).toHaveLength(3);
  });

  it("a half-typed row keeps the last good pedigree and says what is wrong", () => {
    const good = readPedText(PED_TEXT_PLACEHOLDER);
    const bad = readPedText(PED_TEXT_PLACEHOLDER + "\nfam1 son dad", good.pedigree);
    expect(bad.current).toBe(false);
    expect(bad.pedigree).toBe(good.pedigree);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it("empty text draws nothing and is not an error", () => {
    const r = readPedText("  \n", readPedText(PED_TEXT_PLACEHOLDER).pedigree);
    expect(r).toMatchObject({ pedigree: null, current: true, errors: [] });
  });

  it("takes the first of several families and says so", () => {
    const r = readPedText("A a1 0 0 1 1\nA a2 0 0 2 1\nB b1 0 0 1 2\n");
    expect(r.familyId).toBe("A");
    expect(r.pedigree?.individuals.map(i => i.name).sort()).toEqual(["a1", "a2"]);
    expect(r.note).toMatch(/2 families/);
  });
});
