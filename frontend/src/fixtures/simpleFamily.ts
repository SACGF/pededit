import type { Pedigree } from "@pedigree-editor/layout-engine";

export const simpleFamily: Pedigree = {
  individuals: [
    { id: "i1", sex: "male",    affected: false, sibOrder: 0 },         // grandfather
    { id: "i2", sex: "female",  affected: false, sibOrder: 1 },         // grandmother
    { id: "i3", sex: "male",    affected: true,  deceased: true,  sibOrder: 0 },  // father
    { id: "i4", sex: "female",  affected: false, sibOrder: 1 },         // aunt (sibling of i3)
    { id: "i5", sex: "female",  affected: false, sibOrder: 0 },         // mother (marry-in)
    { id: "i6", sex: "female",  affected: true,  proband: true,   sibOrder: 0 },  // proband
    { id: "i7", sex: "male",    affected: false, sibOrder: 1 },
    { id: "i8", sex: "female",  affected: false, carrier: true,   sibOrder: 2 },
  ],
  partnerships: [
    { id: "p1", individual1: "i1", individual2: "i2" },  // i1 + i2
    { id: "p2", individual1: "i3", individual2: "i5" },  // i3 + i5
  ],
  parentOf: {
    "p1": ["i3", "i4"],          // i1+i2 → i3, i4
    "p2": ["i6", "i7", "i8"],    // i3+i5 → i6, i7, i8
  },
  siblingOrder: { mode: "insertion", affectedFirst: false },
};
