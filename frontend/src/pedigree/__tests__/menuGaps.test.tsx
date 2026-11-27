import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { F, M, U, build, couple } from "../../fixtures/features";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { MoreMenuItems } from "../nodes/MoreMenu";
import { CoupleMenuItems } from "../nodes/CoupleMenuItems";
import { moveSiblingProblem } from "../actionInventory";

// #243: the menus offer what the inventory found missing.

const store = () => usePedigreeStore.getState();
/** Render with the store holding `p` (and `selected`), as personMenus.test.tsx does. */
function render(p: Pedigree, el: ReactElement, selected: string[] = []): string {
  store().initialize(p);
  if (selected.length) store().setSelection(selected);
  const initial = usePedigreeStore.getInitialState();
  const saved = { ...initial };
  Object.assign(initial, store());
  try {
    return renderToStaticMarkup(el);
  } finally {
    Object.assign(initial, saved);
  }
}
const items = (html: string) => [...html.matchAll(/<button[^>]*>([^]*?)<\/button>/g)].map(m => m[1]!.replace(/<[^>]*>/g, "").trim());
const disabledWhy = (html: string, text: string) => {
  const m = [...html.matchAll(/<button([^>]*)>([^]*?)<\/button>/g)].find(x => x[2]!.replace(/<[^>]*>/g, "").trim() === text);
  return m && /disabled/.test(m[1]!) ? /title="([^"]*)"/.exec(m[1]!)?.[1] ?? "" : null;
};

const fam = (): Pedigree => build(
  [M("dad"), F("mum"), F("kid"), M("kid2"), M("pop"), F("ma"), U("x")],
  [couple("p", "dad", "mum"), couple("q", "pop", "ma")],
  { p: ["kid", "kid2"] },
);

describe("one person's menu", () => {
  it("lists every relation under Add, with reasons when disabled (rows 8, 9, 10, 15)", () => {
    const html = render(fam(), <MoreMenuItems individualId="dad" onDone={() => {}} />);
    expect(items(html)).toEqual(expect.arrayContaining(["Add partner", "Add parents", "Add children...", "Add existing child...", "Brother", "Sister", "Unknown"]));
    expect(disabledWhy(html, "Brother")).toMatch(/Add parents first/);
    expect(disabledWhy(html, "Move left")).toMatch(/No parents/);
    const kid = render(fam(), <MoreMenuItems individualId="kid" onDone={() => {}} />);
    expect(disabledWhy(kid, "Brother")).toBeNull();
    expect(disabledWhy(kid, "Add parents")).toMatch(/Already has parents/);
    expect(disabledWhy(kid, "Move left")).toMatch(/first/);
    expect(disabledWhy(kid, "Move right")).toBeNull();
    expect(items(kid)).toContain("Select with ancestors");
  });

  it("offers Remove donor and Remove surrogate once they are added (rows 4, 5)", () => {
    const p = fam();
    store().initialize(p);
    store().addDonor("kid", "sperm");
    store().addSurrogate("kid");
    const html = render(store().pedigree, <MoreMenuItems individualId="kid" onDone={() => {}} />);
    expect(items(html)).toEqual(expect.arrayContaining(["Remove donor", "Remove surrogate"]));
    expect(items(render(fam(), <MoreMenuItems individualId="kid" onDone={() => {}} />))).not.toContain("Remove donor");
  });
});

describe("moveSiblingProblem", () => {
  it("is null only where the move does something", () => {
    const p = fam();
    expect(moveSiblingProblem(p, "kid", 1)).toBeNull();
    expect(moveSiblingProblem(p, "kid2", -1)).toBeNull();
    expect(moveSiblingProblem(p, "kid2", 1)).toMatch(/last/);
    expect(moveSiblingProblem(build([M("a"), F("b"), M("c")], [couple("p", "a", "b")], { p: ["c"] }), "c", 1)).toMatch(/only child/);
  });
});

describe("a couple's menu (row 2)", () => {
  it("offers Add children... to every couple, not only a same-sex one", () => {
    expect(items(render(fam(), <CoupleMenuItems partnershipId="q" onDone={() => {}} />))).toEqual(expect.arrayContaining(["Add children...", "Add existing child..."]));
  });
});

describe("several selected", () => {
  const batch = (ids: string[]) => render(fam(), <MoreMenuItems individualId={ids[0]!} onDone={() => {}} />, ids);

  it("two who are not partners: Make partners (row 1)", () => {
    expect(items(batch(["x", "pop"]))).toContain("Make partners");
    expect(items(batch(["pop", "ma"]))).not.toContain("Make partners");
  });

  it("two siblings: the twin choices (row 3)", () => {
    expect(items(batch(["kid", "kid2"]))).toEqual(expect.arrayContaining(["Monozygotic (identical)", "Dizygotic (fraternal)", "Unknown zygosity"]));
  });

  it("consultands, family history not known, adoption, set parents and detach for several (rows 6, 13)", () => {
    const html = batch(["kid", "kid2"]);
    expect(items(html)).toEqual(expect.arrayContaining([
      "Mark 2 as consultands", "Family history not known for 2", "In", "Out", "Set parents of 2...", "Detach 2 from parents",
    ]));
  });

  it("Unpin N when any are pinned (row 14)", () => {
    const p = { ...fam(), pinnedPositions: { kid: { x: 0, y: 0 } } };
    expect(items(render(p, <MoreMenuItems individualId="kid" onDone={() => {}} />, ["kid", "kid2"]))).toContain("Unpin 1");
  });
});
