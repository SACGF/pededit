import type { Pedigree } from "@pedigree-editor/layout-engine";

export interface ExamplePedigree {
  label: string;
  description: string;
  data: Pedigree;
}

const siblingOrder = { mode: "insertion" as const, affectedFirst: false };

export const EXAMPLES: ExamplePedigree[] = [
  {
    label: "Simple family",
    description: "2 generations · 4 individuals",
    data: {
      siblingOrder,
      individuals: [
        { id: "p1", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "p2", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        { id: "c1", sex: "male",   affected: true,  deceased: false, carrier: false, proband: true,  sibOrder: 0 },
        { id: "c2", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
      ],
      partnerships: [
        { id: "pp1", individual1: "p1", individual2: "p2", consanguineous: false },
      ],
      parentOf: { pp1: ["c1", "c2"] },
    },
  },
  {
    label: "Three generations",
    description: "3 generations · 9 individuals · autosomal dominant",
    data: {
      siblingOrder,
      individuals: [
        // Generation I
        { id: "g1f", sex: "male",   affected: true,  deceased: true,  carrier: false, proband: false, sibOrder: 0 },
        { id: "g1m", sex: "female", affected: false, deceased: true,  carrier: false, proband: false, sibOrder: 1 },
        // Generation II
        { id: "g2a", sex: "male",   affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "g2b", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        { id: "g2c", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 2 },
        { id: "g2d", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 3 },
        // Generation III
        { id: "g3a", sex: "male",   affected: true,  deceased: false, carrier: false, proband: true,  sibOrder: 0 },
        { id: "g3b", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        { id: "g3c", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 2 },
      ],
      partnerships: [
        { id: "pp1", individual1: "g1f", individual2: "g1m", consanguineous: false },
        { id: "pp2", individual1: "g2a", individual2: "g2b", consanguineous: false },
        { id: "pp3", individual1: "g2c", individual2: "g2d", consanguineous: false },
      ],
      parentOf: {
        pp1: ["g2a", "g2c"],
        pp2: ["g3a", "g3b"],
        pp3: ["g3c"],
      },
    },
  },
  {
    label: "Large family",
    description: "4 generations · 16 individuals · multiple branches",
    data: {
      siblingOrder,
      individuals: [
        // Gen I
        { id: "i1a", sex: "male",   affected: false, deceased: true,  carrier: false, proband: false, sibOrder: 0 },
        { id: "i1b", sex: "female", affected: false, deceased: true,  carrier: true,  proband: false, sibOrder: 1 },
        // Gen II — left branch
        { id: "i2a", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 0 },
        { id: "i2b", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        { id: "i2c", sex: "female", affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 2 },
        { id: "i2d", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 3 },
        // Gen II — right branch spouse
        { id: "i2e", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 4 },
        // Gen III — left branch
        { id: "i3a", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "i3b", sex: "female", affected: true,  deceased: false, carrier: false, proband: true,  sibOrder: 1 },
        { id: "i3c", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 2 },
        // Gen III — right branch
        { id: "i3d", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 3 },
        { id: "i3e", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 4 },
        // Gen III — spouses
        { id: "i3f", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 5 },
        { id: "i3g", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 6 },
        // Gen IV
        { id: "i4a", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "i4b", sex: "female", affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 1 },
      ],
      partnerships: [
        { id: "pp1", individual1: "i1a",  individual2: "i1b",  consanguineous: false },
        { id: "pp2", individual1: "i2a",  individual2: "i2b",  consanguineous: false },
        { id: "pp3", individual1: "i2d",  individual2: "i2e",  consanguineous: false },
        { id: "pp4", individual1: "i3b",  individual2: "i3g",  consanguineous: false },
        { id: "pp5", individual1: "i3c",  individual2: "i3f",  consanguineous: false },
      ],
      parentOf: {
        pp1: ["i2a", "i2c", "i2d"],
        pp2: ["i3a", "i3b", "i3c"],
        pp3: ["i3d", "i3e"],
        pp4: ["i4a", "i4b"],
        pp5: [],
      },
    },
  },
  {
    label: "High complexity",
    description: "4 generations · consanguinity · multiple traits",
    data: {
      siblingOrder,
      individuals: [
        // Gen I
        { id: "h1a", sex: "male",   affected: false, deceased: true,  carrier: true,  proband: false, sibOrder: 0 },
        { id: "h1b", sex: "female", affected: false, deceased: true,  carrier: true,  proband: false, sibOrder: 1 },
        // Gen II
        { id: "h2a", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 0 },
        { id: "h2b", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        { id: "h2c", sex: "male",   affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 2 },
        { id: "h2d", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 3 },
        { id: "h2e", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 4 },
        // Gen III
        { id: "h3a", sex: "male",   affected: true,  deceased: false, carrier: false, proband: true,  sibOrder: 0 },
        { id: "h3b", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 1 },
        { id: "h3c", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 2 },
        { id: "h3d", sex: "female", affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 3 },
        // Gen IV
        { id: "h4a", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 0 },
        { id: "h4b", sex: "female", affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 1 },
      ],
      partnerships: [
        { id: "pph1", individual1: "h1a", individual2: "h1b", consanguineous: false },
        // h2a and h2d are cousins who marry (consanguinity)
        { id: "pph2", individual1: "h2a", individual2: "h2d", consanguineous: true },
        { id: "pph3", individual1: "h2b", individual2: "h2c", consanguineous: false },
        { id: "pph4", individual1: "h2e", individual2: "h3b", consanguineous: false },
        { id: "pph5", individual1: "h3a", individual2: "h3c", consanguineous: false },
      ],
      parentOf: {
        pph1: ["h2a", "h2c", "h2d"],
        pph2: ["h3a", "h3b"],
        pph3: ["h3d"],
        pph4: ["h4a"],
        pph5: ["h4b"],
      },
    },
  },
];
