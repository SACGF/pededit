import type { Pedigree } from "@pedigree-editor/layout-engine";

// Root couple -> 2 children (1 per arm)
// Left child has 3 kids, right child has 2 kids
// One grandchild on left has 2 great-grandchildren
export const largerFamily: Pedigree = {
  individuals: [
    // Gen 0: root couple
    { id: "f", sex: "male", affected: false, sibOrder: 0 },
    { id: "m", sex: "female", affected: false, sibOrder: 0 },
    // Gen 1: two children + their spouses
    { id: "s1", sex: "male", affected: true, sibOrder: 0 },
    { id: "s1w", sex: "female", affected: false, sibOrder: 0 },
    { id: "d1", sex: "female", affected: false, sibOrder: 1 },
    { id: "d1h", sex: "male", affected: false, sibOrder: 0 },
    // Gen 2: grandchildren
    { id: "gc1", sex: "male", affected: false, sibOrder: 0 },
    { id: "gc2", sex: "female", affected: true, proband: true, sibOrder: 1 },
    { id: "gc3", sex: "male", affected: false, sibOrder: 2 },
    { id: "gc4", sex: "female", affected: false, sibOrder: 0 },
    { id: "gc5", sex: "male", affected: true, sibOrder: 1 },
    // Gen 2: spouse for gc1
    { id: "gc1w", sex: "female", affected: false, sibOrder: 0 },
    // Gen 3: great-grandchildren
    { id: "ggc1", sex: "male", affected: false, sibOrder: 0 },
    { id: "ggc2", sex: "female", affected: true, sibOrder: 1 },
  ],
  partnerships: [
    { id: "p0", individual1: "f", individual2: "m" },
    { id: "p1", individual1: "s1", individual2: "s1w" },
    { id: "p2", individual1: "d1h", individual2: "d1" },
    { id: "p3", individual1: "gc1", individual2: "gc1w" },
  ],
  parentOf: {
    p0: ["s1", "d1"],
    p1: ["gc1", "gc2", "gc3"],
    p2: ["gc4", "gc5"],
    p3: ["ggc1", "ggc2"],
  },
  siblingOrder: { mode: "insertion", affectedFirst: false },
};
