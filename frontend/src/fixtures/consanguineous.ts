import type { Pedigree } from "@pedigree-editor/layout-engine";

export const consanguineousFamily: Pedigree = {
  individuals: [
    { id: "i1", sex: "male",   affected: false, sibOrder: 0 },          // grandfather
    { id: "i2", sex: "female", affected: false, sibOrder: 1 },          // grandmother
    { id: "i3", sex: "male",   affected: false, carrier: true, sibOrder: 0 },  // father (carrier)
    { id: "i4", sex: "female", affected: false, carrier: true, sibOrder: 1 },  // mother (carrier, sister of i3)
    { id: "i5", sex: "male",   affected: true,  proband: true, sibOrder: 0 },  // affected proband
    { id: "i6", sex: "female", affected: false, sibOrder: 1 },
  ],
  partnerships: [
    { id: "p1", individual1: "i1", individual2: "i2" },
    { id: "p2", individual1: "i3", individual2: "i4", consanguineous: true },
  ],
  parentOf: {
    "p1": ["i3", "i4"],
    "p2": ["i5", "i6"],
  },
  siblingOrder: { mode: "insertion", affectedFirst: false },
};
