/**
 * Short constructors for pedigrees written by hand in code: the examples
 * (`examples.ts`, `exampleRows.ts`, `practiceFamilies.ts`), the guide pages'
 * figures (`src/guides/`) and the feature fixtures and tests
 * (`src/fixtures/features.ts`). A field not given is left out, as the editor
 * saves it.
 */
import type { Individual, Partnership, Pedigree } from "@pedigree-editor/layout-engine";

type Extra = Partial<Omit<Individual, "id" | "sex">>;
export const person = (id: string, sex: Individual["sex"], extra: Extra = {}): Individual =>
  ({ id, sex, affected: false, sibOrder: 0, ...extra });
export const M = (id: string, extra?: Extra) => person(id, "male", extra);
export const F = (id: string, extra?: Extra) => person(id, "female", extra);
export const U = (id: string, extra?: Extra) => person(id, "unknown", extra);
export const couple = (id: string, individual1: string, individual2: string, extra: Partial<Partnership> = {}): Partnership =>
  ({ id, individual1, individual2, ...extra });

/** Children numbered oldest first in the order written, as the editor numbers them. */
export function family(
  individuals: Individual[],
  partnerships: Partnership[] = [],
  parentOf: Record<string, string[]> = {},
  rest: Partial<Pedigree> = {},
): Pedigree {
  const order = new Map<string, number>();
  for (const kids of Object.values(parentOf)) kids.forEach((id, i) => order.set(id, i));
  return {
    individuals: individuals.map(i => ({ ...i, sibOrder: order.get(i.id) ?? i.sibOrder })),
    partnerships,
    parentOf,
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...rest,
  };
}
