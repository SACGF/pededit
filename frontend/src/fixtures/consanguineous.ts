import type { Pedigree } from "@pedigree-editor/layout-engine";

export const consanguineousFamily: Pedigree = {
  individuals: [
    { id: "i1", sex: "male",   affected: false },                       // grandfather
    { id: "i2", sex: "female", affected: false },                       // grandmother
    { id: "i3", sex: "male",   affected: false, carrier: true },        // father (carrier)
    { id: "i4", sex: "female", affected: false, carrier: true },        // mother (carrier, sister of i3)
    { id: "i5", sex: "male",   affected: true,  proband: true },        // affected proband
    { id: "i6", sex: "female", affected: false },
  ],
  partnerships: [
    { id: "p1", individual1: "i1", individual2: "i2" },
    { id: "p2", individual1: "i3", individual2: "i4", consanguineous: true },
  ],
  parentOf: {
    "p1": ["i3", "i4"],
    "p2": ["i5", "i6"],
  },
};
