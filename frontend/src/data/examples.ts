import type { Pedigree, Individual, Partnership, Sex } from "@pedigree-editor/layout-engine";

export interface ExamplePedigree {
  label: string;
  description: string;
  /** Heading in the example picker. Entries without a group come first, under no heading. */
  group?: "Historic" | "Classic" | "Fiction";
  /** Primary source, shown under the description. */
  citation?: string;
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
    label: "Multi-branch family",
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
    label: "Large family",
    description: "5 generations · 100 individuals · autosomal recessive",
    data: {
      siblingOrder,
      individuals: [
        // Generation I — three founder couples (all deceased)
        { id: "g1a", sex: "male",   affected: false, deceased: true,  carrier: true,  proband: false, sibOrder: 0 },
        { id: "g1b", sex: "female", affected: false, deceased: true,  carrier: true,  proband: false, sibOrder: 1 },
        { id: "g1c", sex: "male",   affected: false, deceased: true,  carrier: true,  proband: false, sibOrder: 2 },
        { id: "g1d", sex: "female", affected: false, deceased: true,  carrier: true,  proband: false, sibOrder: 3 },
        { id: "g1e", sex: "male",   affected: false, deceased: true,  carrier: false, proband: false, sibOrder: 4 },
        { id: "g1f", sex: "female", affected: false, deceased: true,  carrier: false, proband: false, sibOrder: 5 },
        // Generation II — children
        { id: "g2a", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 6 },
        { id: "g2b", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 7 },
        { id: "g2c", sex: "male",   affected: true,  deceased: true,  carrier: false, proband: false, sibOrder: 8 },
        { id: "g2d", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 9 },
        { id: "g2e", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 10 },
        { id: "g2f", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 11 },
        { id: "g2g", sex: "male",   affected: true,  deceased: true,  carrier: false, proband: false, sibOrder: 12 },
        { id: "g2h", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 13 },
        { id: "g2i", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 14 },
        { id: "g2j", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 15 },
        // Generation II — spouses
        { id: "g2sa", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 16 },
        { id: "g2sb", sex: "male",   affected: false, deceased: true,  carrier: false, proband: false, sibOrder: 17 },
        { id: "g2sc", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 18 },
        { id: "g2sd", sex: "female", affected: false, deceased: true,  carrier: false, proband: false, sibOrder: 19 },
        { id: "g2se", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 20 },
        { id: "g2sf", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 21 },
        { id: "g2sg", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 22 },
        // Generation III — children
        { id: "g3a", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 23 },
        { id: "g3b", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 24 },
        { id: "g3c", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 25 },
        { id: "g3d", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 26 },
        { id: "g3e", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 27 },
        { id: "g3f", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 28 },
        { id: "g3g", sex: "male",   affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 29 },
        { id: "g3h", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 30 },
        { id: "g3i", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 31 },
        { id: "g3j", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 32 },
        { id: "g3k", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 33 },
        { id: "g3l", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 34 },
        { id: "g3m", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 35 },
        { id: "g3n", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 36 },
        { id: "g3o", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 37 },
        { id: "g3p", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 38 },
        { id: "g3q", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 39 },
        { id: "g3r", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 40 },
        { id: "g3s", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 41 },
        { id: "g3t", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 42 },
        { id: "g3u", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 43 },
        // Generation III — spouses
        { id: "g3sa", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 44 },
        { id: "g3sb", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 45 },
        { id: "g3sc", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 46 },
        { id: "g3sd", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 47 },
        { id: "g3se", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 48 },
        { id: "g3sf", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 49 },
        { id: "g3sg", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 50 },
        { id: "g3sh", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 51 },
        { id: "g3si", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 52 },
        { id: "g3sj", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 53 },
        // Generation IV — children
        { id: "g4a", sex: "female", affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 54 },
        { id: "g4b", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 55 },
        { id: "g4c", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 56 },
        { id: "g4d", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 57 },
        { id: "g4e", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 58 },
        { id: "g4f", sex: "male",   affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 59 },
        { id: "g4g", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 60 },
        { id: "g4h", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 61 },
        { id: "g4i", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 62 },
        { id: "g4j", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 63 },
        { id: "g4k", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 64 },
        { id: "g4l", sex: "female", affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 65 },
        { id: "g4m", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 66 },
        { id: "g4n", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 67 },
        { id: "g4o", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 68 },
        { id: "g4p", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 69 },
        { id: "g4q", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 70 },
        { id: "g4r", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 71 },
        { id: "g4s", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 72 },
        { id: "g4t", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 73 },
        { id: "g4u", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 74 },
        { id: "g4v", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 75 },
        { id: "g4w", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 76 },
        { id: "g4x", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 77 },
        { id: "g4y", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 78 },
        // Generation IV — spouses
        { id: "g4sa", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 79 },
        { id: "g4sb", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 80 },
        { id: "g4sc", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 81 },
        { id: "g4sd", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 82 },
        { id: "g4se", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 83 },
        { id: "g4sf", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 84 },
        // Generation V — children
        { id: "g5a", sex: "male",   affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 85 },
        { id: "g5b", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 86 },
        { id: "g5c", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 87 },
        { id: "g5d", sex: "female", affected: true,  deceased: false, carrier: false, proband: true,  sibOrder: 88 },
        { id: "g5e", sex: "male",   affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 89 },
        { id: "g5f", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 90 },
        { id: "g5g", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 91 },
        { id: "g5h", sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 92 },
        { id: "g5i", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 93 },
        { id: "g5j", sex: "female", affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 94 },
        { id: "g5k", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 95 },
        { id: "g5l", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 96 },
        { id: "g5m", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 97 },
        { id: "g5n", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 98 },
        { id: "g5o", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 99 },
      ],
      partnerships: [
        // Generation I
        { id: "ppA",    individual1: "g1a",  individual2: "g1b",  consanguineous: false },
        { id: "ppB",    individual1: "g1c",  individual2: "g1d",  consanguineous: false },
        { id: "ppC",    individual1: "g1e",  individual2: "g1f",  consanguineous: false },
        // Generation II
        { id: "ppD",    individual1: "g2a",  individual2: "g2sa", consanguineous: false },
        { id: "ppE",    individual1: "g2sb", individual2: "g2b",  consanguineous: false },
        { id: "ppF",    individual1: "g2e",  individual2: "g2sc", consanguineous: false },
        { id: "ppG",    individual1: "g2g",  individual2: "g2sd", consanguineous: false },
        { id: "ppH",    individual1: "g2se", individual2: "g2i",  consanguineous: false },
        { id: "ppI",    individual1: "g2h",  individual2: "g2sf", consanguineous: false },
        { id: "ppJ",    individual1: "g2sg", individual2: "g2j",  consanguineous: false },
        // Generation III
        { id: "ppK",    individual1: "g3a",  individual2: "g3sa", consanguineous: false },
        { id: "ppL",    individual1: "g3sb", individual2: "g3b",  consanguineous: false },
        { id: "ppM",    individual1: "g3sc", individual2: "g3d",  consanguineous: false },
        { id: "ppN",    individual1: "g3e",  individual2: "g3sd", consanguineous: false },
        { id: "ppO",    individual1: "g3h",  individual2: "g3se", consanguineous: false },
        { id: "ppP",    individual1: "g3sf", individual2: "g3i",  consanguineous: false },
        { id: "ppQ",    individual1: "g3l",  individual2: "g3sg", consanguineous: false },
        { id: "ppR",    individual1: "g3sh", individual2: "g3p",  consanguineous: false },
        { id: "ppS",    individual1: "g3q",  individual2: "g3si", consanguineous: false },
        { id: "ppT",    individual1: "g3sj", individual2: "g3t",  consanguineous: false },
        // Generation IV
        { id: "ppU",    individual1: "g4sa", individual2: "g4a",  consanguineous: false },
        { id: "ppV",    individual1: "g4d",  individual2: "g4sb", consanguineous: false },
        { id: "ppW",    individual1: "g4k",  individual2: "g4sc", consanguineous: false },
        { id: "ppX",    individual1: "g4p",  individual2: "g4sd", consanguineous: false },
        { id: "ppY",    individual1: "g4u",  individual2: "g4se", consanguineous: false },
        { id: "ppZ",    individual1: "g4sf", individual2: "g4v",  consanguineous: false },
      ],
      parentOf: {
        // Gen I → Gen II
        ppA: ["g2a", "g2b", "g2c", "g2d"],
        ppB: ["g2e", "g2f", "g2g"],
        ppC: ["g2h", "g2i", "g2j"],
        // Gen II → Gen III
        ppD: ["g3a", "g3b", "g3c"],
        ppE: ["g3d", "g3e", "g3f", "g3g"],
        ppF: ["g3h", "g3i", "g3j"],
        ppG: ["g3k", "g3l"],
        ppH: ["g3m", "g3n", "g3o"],
        ppI: ["g3p", "g3q", "g3r"],
        ppJ: ["g3s", "g3t", "g3u"],
        // Gen III → Gen IV
        ppK: ["g4a", "g4b", "g4c"],
        ppL: ["g4d", "g4e"],
        ppM: ["g4f", "g4g", "g4h"],
        ppN: ["g4i", "g4j"],
        ppO: ["g4k", "g4l", "g4m"],
        ppP: ["g4n", "g4o"],
        ppQ: ["g4p", "g4q", "g4r"],
        ppR: ["g4s", "g4t"],
        ppS: ["g4u", "g4v", "g4w"],
        ppT: ["g4x", "g4y"],
        // Gen IV → Gen V
        ppU: ["g5a", "g5b", "g5c"],
        ppV: ["g5d", "g5e", "g5f"],
        ppW: ["g5g", "g5h"],
        ppX: ["g5i", "g5j", "g5k"],
        ppY: ["g5l", "g5m"],
        ppZ: ["g5n", "g5o"],
      },
    },
  },
  {
    label: "Uncle-niece",
    description: "3 generations · consanguineous cross-generational mating",
    data: {
      siblingOrder,
      individuals: [
        // Gen I — founders
        { id: "un_gf",    sex: "male",   affected: false, deceased: true,  carrier: false, proband: false, sibOrder: 0 },
        { id: "un_gm",    sex: "female", affected: false, deceased: true,  carrier: false, proband: false, sibOrder: 1 },
        // Gen II — uncle (son of founders) and his sister
        { id: "un_uncle", sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "un_sis",   sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        { id: "un_bil",   sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 2 },
        // Gen III — niece (daughter of sister), who marries the uncle
        { id: "un_niece", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "un_c1",    sex: "male",   affected: true,  deceased: false, carrier: false, proband: true,  sibOrder: 1 },
        { id: "un_c2",    sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 2 },
      ],
      partnerships: [
        { id: "un_pp1", individual1: "un_gf",    individual2: "un_gm",    consanguineous: false },
        { id: "un_pp2", individual1: "un_bil",   individual2: "un_sis",   consanguineous: false },
        { id: "un_pp3", individual1: "un_uncle", individual2: "un_niece", consanguineous: true  },
      ],
      parentOf: {
        un_pp1: ["un_uncle", "un_sis"],
        un_pp2: ["un_niece"],
        un_pp3: ["un_c1", "un_c2"],
      },
    },
  },
  {
    label: "Remarriage · half-siblings",
    description: "2 generations · father with two partnerships · half-siblings",
    data: {
      siblingOrder,
      individuals: [
        // Gen I
        { id: "rm_dad",  sex: "male",   affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "rm_mom1", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        { id: "rm_mom2", sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 2 },
        // Gen II — first marriage
        { id: "rm_c1a",  sex: "male",   affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "rm_c1b",  sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        // Gen II — second marriage
        { id: "rm_c2a",  sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 2 },
        { id: "rm_c2b",  sex: "female", affected: true,  deceased: false, carrier: false, proband: true,  sibOrder: 3 },
        { id: "rm_c2c",  sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 4 },
      ],
      partnerships: [
        { id: "rm_pp1", individual1: "rm_dad", individual2: "rm_mom1", consanguineous: false },
        { id: "rm_pp2", individual1: "rm_dad", individual2: "rm_mom2", consanguineous: false },
      ],
      parentOf: {
        rm_pp1: ["rm_c1a", "rm_c1b"],
        rm_pp2: ["rm_c2a", "rm_c2b", "rm_c2c"],
      },
    },
  },
  {
    label: "Multiple partners",
    description: "3 generations · one person with three partners · partner chain",
    data: {
      siblingOrder,
      individuals: [
        // Gen I: one man with three partners
        { id: "mp_dad",  sex: "male",   affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "mp_w1",   sex: "female", affected: false, deceased: true,  carrier: false, proband: false, sibOrder: 1 },
        { id: "mp_w2",   sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 2 },
        { id: "mp_w3",   sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 3 },
        // Gen II: children of each marriage, plus the married-in partners of mp_c4
        { id: "mp_c1",   sex: "male",   affected: true,  deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "mp_c2",   sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 0 },
        { id: "mp_c3",   sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        { id: "mp_c4",   sex: "female", affected: false, deceased: false, carrier: true,  proband: false, sibOrder: 0 },
        { id: "mp_h1",   sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 4 },
        { id: "mp_h2",   sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 5 },
        { id: "mp_w4",   sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 6 },
        // Gen III: mp_c4 has children by two husbands; mp_h2 also has a child with mp_w4
        { id: "mp_g1",   sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 0 },
        { id: "mp_g2",   sex: "male",   affected: true,  deceased: false, carrier: false, proband: true,  sibOrder: 0 },
        { id: "mp_g3",   sex: "female", affected: false, deceased: false, carrier: false, proband: false, sibOrder: 1 },
        { id: "mp_g4",   sex: "male",   affected: false, deceased: false, carrier: false, proband: false, sibOrder: 0 },
      ],
      partnerships: [
        { id: "mp_pp1", individual1: "mp_dad", individual2: "mp_w1", consanguineous: false },
        { id: "mp_pp2", individual1: "mp_dad", individual2: "mp_w2", consanguineous: false },
        { id: "mp_pp3", individual1: "mp_dad", individual2: "mp_w3", consanguineous: false },
        // Partner chain in Gen II: mp_h1 - mp_c4 - mp_h2 - mp_w4
        { id: "mp_pp4", individual1: "mp_h1", individual2: "mp_c4", consanguineous: false },
        { id: "mp_pp5", individual1: "mp_h2", individual2: "mp_c4", consanguineous: false },
        { id: "mp_pp6", individual1: "mp_h2", individual2: "mp_w4", consanguineous: false },
      ],
      parentOf: {
        mp_pp1: ["mp_c1"],
        mp_pp2: ["mp_c2", "mp_c3"],
        mp_pp3: ["mp_c4"],
        mp_pp4: ["mp_g1"],
        mp_pp5: ["mp_g2", "mp_g3"],
        mp_pp6: ["mp_g4"],
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
  ...historicAndClassicExamples(),
];

/** Example picker headings in display order. "" is the ungrouped set above. */
export const EXAMPLE_GROUPS: string[] = [...new Set(EXAMPLES.map(e => e.group ?? ""))];

// ── Historic and classic examples ─────────────────────────────────────────────
//
// These are the same pedigrees as test-data/ped/historic and test-data/ped/classic
// (sources and notes in test-data/ped/README.md), written as parent-pointer rows
// so the entries stay readable. A row is [id, sex, father, mother, extras].

type Row = [
  id: string,
  sex: Sex,
  father: string | null,
  mother: string | null,
  extras?: Partial<Pick<Individual, "name" | "affected" | "carrier" | "deceased" | "proband" | "notes">>,
];

function fromRows(rows: Row[], defaults: { deceased?: boolean } = {}): Pedigree {
  const individuals: Individual[] = rows.map(([id, sex, , , extras]) => ({
    id,
    sex,
    affected: extras?.affected ?? false,
    deceased: extras?.deceased ?? defaults.deceased ?? false,
    carrier: extras?.carrier ?? false,
    proband: extras?.proband ?? false,
    sibOrder: 0,
    ...(extras?.name ? { name: extras.name } : {}),
    ...(extras?.notes ? { notes: extras.notes } : {}),
  }));

  const parentsOf = new Map<string, [string, string]>();
  const partnerships: Partnership[] = [];
  const parentOf: Record<string, string[]> = {};
  for (const [id, , father, mother] of rows) {
    if (!father || !mother) continue;
    parentsOf.set(id, [father, mother]);
    const pid = `${father}+${mother}`;
    if (!parentOf[pid]) {
      partnerships.push({ id: pid, individual1: father, individual2: mother });
      parentOf[pid] = [];
    }
    parentOf[pid].push(id);
  }

  const ancestors = (id: string): Set<string> => {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const p = parentsOf.get(stack.pop()!);
      if (!p) continue;
      for (const a of p) {
        if (!out.has(a)) { out.add(a); stack.push(a); }
      }
    }
    return out;
  };
  for (const p of partnerships) {
    const a1 = ancestors(p.individual1);
    const a2 = ancestors(p.individual2);
    if (a1.has(p.individual2) || a2.has(p.individual1) || [...a1].some(a => a2.has(a))) {
      p.consanguineous = true;
    }
  }

  const byId = new Map(individuals.map(i => [i.id, i]));
  for (const children of Object.values(parentOf)) {
    children.forEach((c, i) => { byId.get(c)!.sibOrder = i; });
  }

  return { siblingOrder, individuals, partnerships, parentOf };
}

function historicAndClassicExamples(): ExamplePedigree[] {
  const M: Sex = "male";
  const F: Sex = "female";

  const habsburg: Row[] = [
    ["Ferdinand_of_Aragon",   M, null, null, { name: "Ferdinand of Aragon" }],
    ["Elizabeth_of_Castile",  F, null, null, { name: "Elizabeth of Castile" }],
    ["Maximilian_I",          M, null, null, { name: "Maximilian I" }],
    ["Mary_of_Burgundy",      F, null, null, { name: "Mary of Burgundy" }],
    ["Manuel_I",              M, null, null, { name: "Manuel I of Portugal" }],
    ["Mary_of_Aragon",        F, "Ferdinand_of_Aragon", "Elizabeth_of_Castile", { name: "Mary of Aragon" }],
    ["Joanna_I",              F, "Ferdinand_of_Aragon", "Elizabeth_of_Castile", { name: "Joanna I" }],
    ["Philip_I",              M, "Maximilian_I", "Mary_of_Burgundy", { name: "Philip I", notes: "F = 0.025 (Alvarez et al. 2009)" }],
    ["John_III",              M, "Manuel_I", "Mary_of_Aragon", { name: "John III of Portugal" }],
    ["Isabella_of_Portugal",  F, "Manuel_I", "Mary_of_Aragon", { name: "Isabella of Portugal" }],
    ["Catherine",             F, "Philip_I", "Joanna_I", { name: "Catherine" }],
    ["Charles_I",             M, "Philip_I", "Joanna_I", { name: "Charles I (Charles V)", notes: "F = 0.037 (Alvarez et al. 2009)" }],
    ["Ferdinand_I",           M, "Philip_I", "Joanna_I", { name: "Ferdinand I" }],
    ["Anna_of_Hungary",       F, null, null, { name: "Anna of Hungary" }],
    ["Mary_of_Portugal",      F, "John_III", "Catherine", { name: "Mary of Portugal" }],
    ["Philip_II",             M, "Charles_I", "Isabella_of_Portugal", { name: "Philip II", notes: "F = 0.123 (Alvarez et al. 2009)" }],
    ["Maria",                 F, "Charles_I", "Isabella_of_Portugal", { name: "Maria" }],
    ["Maximilian_II",         M, "Ferdinand_I", "Anna_of_Hungary", { name: "Maximilian II" }],
    ["Charles_II_of_Austria", M, "Ferdinand_I", "Anna_of_Hungary", { name: "Archduke Charles II" }],
    ["Anna",                  F, "Ferdinand_I", "Anna_of_Hungary", { name: "Anna" }],
    ["Albert_V_of_Bavaria",   M, null, null, { name: "Albert V of Bavaria", notes: "Not in the paper's figure; added as Mary's father" }],
    ["Don_Carlos",            M, "Philip_II", "Mary_of_Portugal", { name: "Charles (Don Carlos)", notes: "F = 0.211 (Alvarez et al. 2009)" }],
    ["Anna_of_Austria",       F, "Maximilian_II", "Maria", { name: "Anna of Austria" }],
    ["Mary",                  F, "Albert_V_of_Bavaria", "Anna", { name: "Mary" }],
    ["Philip_III",            M, "Philip_II", "Anna_of_Austria", { name: "Philip III", notes: "F = 0.218 (Alvarez et al. 2009)" }],
    ["Margaret_of_Austria",   F, "Charles_II_of_Austria", "Mary", { name: "Margaret of Austria" }],
    ["Ferdinand_II",          M, "Charles_II_of_Austria", "Mary", { name: "Ferdinand II" }],
    ["Maria_Anna_of_Bavaria", F, null, null, { name: "Maria Anna of Bavaria", notes: "Not in the paper's figure; added as Ferdinand III's mother" }],
    ["Philip_IV",             M, "Philip_III", "Margaret_of_Austria", { name: "Philip IV", notes: "F = 0.115 (Alvarez et al. 2009)" }],
    ["Maria_Anna_of_Austria", F, "Philip_III", "Margaret_of_Austria", { name: "Maria Anna of Austria" }],
    ["Ferdinand_III",         M, "Ferdinand_II", "Maria_Anna_of_Bavaria", { name: "Ferdinand III" }],
    ["Mariana_of_Austria",    F, "Ferdinand_III", "Maria_Anna_of_Austria", { name: "Mariana of Austria" }],
    ["Charles_II",            M, "Philip_IV", "Mariana_of_Austria", { name: "Charles II", affected: true, proband: true, notes: "F = 0.254 on the paper's full pedigree, 0.217 on this one" }],
  ];

  const carrier = { carrier: true };
  const haem = { affected: true };
  const victoria: Row[] = [
    ["Queen_Victoria",          F, null, null, { name: "Queen Victoria", carrier: true, notes: "Obligate carrier of the F9 mutation" }],
    ["Prince_Albert",           M, null, null, { name: "Prince Albert" }],
    ["Victoria_Princess_Royal", F, "Prince_Albert", "Queen_Victoria", { name: "Victoria, Princess Royal" }],
    ["Edward_VII",              M, "Prince_Albert", "Queen_Victoria", { name: "Edward VII" }],
    ["Alice",                   F, "Prince_Albert", "Queen_Victoria", { name: "Alice", ...carrier }],
    ["Alfred",                  M, "Prince_Albert", "Queen_Victoria", { name: "Alfred" }],
    ["Helena",                  F, "Prince_Albert", "Queen_Victoria", { name: "Helena" }],
    ["Louise",                  F, "Prince_Albert", "Queen_Victoria", { name: "Louise" }],
    ["Arthur",                  M, "Prince_Albert", "Queen_Victoria", { name: "Arthur" }],
    ["Leopold",                 M, "Prince_Albert", "Queen_Victoria", { name: "Leopold", ...haem }],
    ["Beatrice",                F, "Prince_Albert", "Queen_Victoria", { name: "Beatrice", ...carrier }],
    ["Frederick_III",           M, null, null, { name: "Frederick III" }],
    ["Louis_IV_of_Hesse",       M, null, null, { name: "Louis IV of Hesse" }],
    ["Helen_of_Waldeck",        F, null, null, { name: "Helen of Waldeck" }],
    ["Henry_of_Battenberg",     M, null, null, { name: "Henry of Battenberg" }],
    ["Henry_of_Prussia",        M, "Frederick_III", "Victoria_Princess_Royal", { name: "Henry of Prussia" }],
    ["Victoria_of_Hesse",       F, "Louis_IV_of_Hesse", "Alice", { name: "Victoria of Hesse" }],
    ["Elisabeth_of_Hesse",      F, "Louis_IV_of_Hesse", "Alice", { name: "Elisabeth of Hesse" }],
    ["Irene_of_Hesse",          F, "Louis_IV_of_Hesse", "Alice", { name: "Irene of Hesse", ...carrier }],
    ["Ernest_Louis_of_Hesse",   M, "Louis_IV_of_Hesse", "Alice", { name: "Ernest Louis" }],
    ["Friedrich_of_Hesse",      M, "Louis_IV_of_Hesse", "Alice", { name: "Friedrich", ...haem, notes: "Died aged 2 after a fall" }],
    ["Alix_of_Hesse",           F, "Louis_IV_of_Hesse", "Alice", { name: "Alix (Empress Alexandra)", ...carrier, notes: "Heterozygous for F9 IVS3-3A>G by DNA (Rogaev et al. 2009)" }],
    ["Marie_of_Hesse",          F, "Louis_IV_of_Hesse", "Alice", { name: "Marie of Hesse" }],
    ["Alice_of_Albany",         F, "Leopold", "Helen_of_Waldeck", { name: "Alice of Albany", ...carrier }],
    ["Charles_Edward",          M, "Leopold", "Helen_of_Waldeck", { name: "Charles Edward" }],
    ["Alexander_of_Battenberg", M, "Henry_of_Battenberg", "Beatrice", { name: "Alexander of Battenberg" }],
    ["Victoria_Eugenie",        F, "Henry_of_Battenberg", "Beatrice", { name: "Victoria Eugenie", ...carrier }],
    ["Leopold_of_Battenberg",   M, "Henry_of_Battenberg", "Beatrice", { name: "Leopold of Battenberg", ...haem }],
    ["Maurice_of_Battenberg",   M, "Henry_of_Battenberg", "Beatrice", { name: "Maurice of Battenberg", notes: "Haemophilia status disputed; killed in action 1914" }],
    ["Nicholas_II",             M, null, null, { name: "Nicholas II" }],
    ["Alexander_of_Teck",       M, null, null, { name: "Alexander of Teck" }],
    ["Alfonso_XIII",            M, null, null, { name: "Alfonso XIII" }],
    ["Waldemar_of_Prussia",     M, "Henry_of_Prussia", "Irene_of_Hesse", { name: "Waldemar of Prussia", ...haem }],
    ["Sigismund_of_Prussia",    M, "Henry_of_Prussia", "Irene_of_Hesse", { name: "Sigismund of Prussia" }],
    ["Heinrich_of_Prussia",     M, "Henry_of_Prussia", "Irene_of_Hesse", { name: "Heinrich of Prussia", ...haem, notes: "Died aged 4" }],
    ["Olga",                    F, "Nicholas_II", "Alix_of_Hesse", { name: "Olga" }],
    ["Tatiana",                 F, "Nicholas_II", "Alix_of_Hesse", { name: "Tatiana" }],
    ["Maria",                   F, "Nicholas_II", "Alix_of_Hesse", { name: "Maria" }],
    ["Anastasia",               F, "Nicholas_II", "Alix_of_Hesse", { name: "Anastasia", ...carrier, notes: "Heterozygous carrier by DNA; identification as Anastasia is putative (Rogaev et al. 2009)" }],
    ["Alexei",                  M, "Nicholas_II", "Alix_of_Hesse", { name: "Alexei", ...haem, proband: true, notes: "Hemizygous for F9 IVS3-3A>G (Rogaev et al. 2009)" }],
    ["May_of_Teck",             F, "Alexander_of_Teck", "Alice_of_Albany", { name: "May of Teck" }],
    ["Rupert_of_Teck",          M, "Alexander_of_Teck", "Alice_of_Albany", { name: "Rupert of Teck", ...haem }],
    ["Maurice_of_Teck",         M, "Alexander_of_Teck", "Alice_of_Albany", { name: "Maurice of Teck", notes: "Died in infancy; status unknown" }],
    ["Alfonso_of_Asturias",     M, "Alfonso_XIII", "Victoria_Eugenie", { name: "Alfonso, Prince of Asturias", ...haem }],
    ["Jaime",                   M, "Alfonso_XIII", "Victoria_Eugenie", { name: "Jaime" }],
    ["Beatriz",                 F, "Alfonso_XIII", "Victoria_Eugenie", { name: "Beatriz" }],
    ["Maria_Cristina",          F, "Alfonso_XIII", "Victoria_Eugenie", { name: "Maria Cristina" }],
    ["Juan",                    M, "Alfonso_XIII", "Victoria_Eugenie", { name: "Juan" }],
    ["Gonzalo",                 M, "Alfonso_XIII", "Victoria_Eugenie", { name: "Gonzalo", ...haem }],
  ];

  const tutankhamun: Row[] = [
    ["Yuya",          M, null, null, { name: "Yuya" }],
    ["Thuya",         F, null, null, { name: "Thuya" }],
    ["Amenhotep_III", M, null, null, { name: "Amenhotep III" }],
    ["Tiye",          F, "Yuya", "Thuya", { name: "Tiye (KV35EL)" }],
    ["KV55",          M, "Amenhotep_III", "Tiye", { name: "KV55", notes: "Most probably Akhenaten" }],
    ["KV35YL",        F, "Amenhotep_III", "Tiye", { name: "KV35YL", notes: "The Younger Lady, full sister of KV55" }],
    ["Tutankhamun",   M, "KV55", "KV35YL", { name: "Tutankhamun", proband: true }],
    ["KV21A",         F, null, null, { name: "KV21A", notes: "Tentatively the mother of the two fetuses" }],
    ["Fetus_1",       F, "Tutankhamun", "KV21A", { name: "Fetus 1" }],
    ["Fetus_2",       F, "Tutankhamun", "KV21A", { name: "Fetus 2" }],
  ];

  // Fiction: test-data/ped/fiction/targaryen.ped. Affected = the Targaryen madness.
  const targaryen: Row[] = [
    // Conquest
    ["Aerion",             M, null, null, { name: "Aerion" }],
    ["Valaena_Velaryon",   F, null, null, { name: "Valaena Velaryon" }],
    ["Aegon_I",            M, "Aerion", "Valaena_Velaryon", { name: "Aegon I", notes: "The Conqueror" }],
    ["Visenya",            F, "Aerion", "Valaena_Velaryon", { name: "Visenya" }],
    ["Rhaenys_Queen",      F, "Aerion", "Valaena_Velaryon", { name: "Rhaenys" }],
    // Children of Aegon I by his sister-wives
    ["Aenys_I",            M, "Aegon_I", "Rhaenys_Queen", { name: "Aenys I" }],
    ["Maegor_I",           M, "Aegon_I", "Visenya", { name: "Maegor I", notes: "The Cruel. Six wives, among them his niece Rhaena; no surviving children" }],
    ["Alyssa_Velaryon",    F, null, null, { name: "Alyssa Velaryon" }],
    // Children of Aenys I
    ["Rhaena_Aenys",       F, "Aenys_I", "Alyssa_Velaryon", { name: "Rhaena" }],
    ["Aegon_Uncrowned",    M, "Aenys_I", "Alyssa_Velaryon", { name: "Aegon", notes: "The Uncrowned" }],
    ["Viserys_Aenys",      M, "Aenys_I", "Alyssa_Velaryon", { name: "Viserys" }],
    ["Jaehaerys_I",        M, "Aenys_I", "Alyssa_Velaryon", { name: "Jaehaerys I", notes: "The Conciliator" }],
    ["Alysanne",           F, "Aenys_I", "Alyssa_Velaryon", { name: "Alysanne" }],
    ["Vaella",             F, "Aenys_I", "Alyssa_Velaryon", { name: "Vaella" }],
    // Brother-sister marriages of Aenys's children
    ["Aerea",              F, "Aegon_Uncrowned", "Rhaena_Aenys", { name: "Aerea", notes: "Twin of Rhaella" }],
    ["Rhaella_Twin",       F, "Aegon_Uncrowned", "Rhaena_Aenys", { name: "Rhaella", notes: "Twin of Aerea" }],
    ["Aegon_JA",           M, "Jaehaerys_I", "Alysanne", { name: "Aegon" }],
    ["Daenerys_JA",        F, "Jaehaerys_I", "Alysanne", { name: "Daenerys" }],
    ["Aemon_JA",           M, "Jaehaerys_I", "Alysanne", { name: "Aemon" }],
    ["Baelon",             M, "Jaehaerys_I", "Alysanne", { name: "Baelon", notes: "The Brave" }],
    ["Alyssa",             F, "Jaehaerys_I", "Alysanne", { name: "Alyssa" }],
    ["Maegelle",           F, "Jaehaerys_I", "Alysanne", { name: "Maegelle" }],
    ["Vaegon",             M, "Jaehaerys_I", "Alysanne", { name: "Vaegon" }],
    ["Daella_JA",          F, "Jaehaerys_I", "Alysanne", { name: "Daella" }],
    ["Saera",              F, "Jaehaerys_I", "Alysanne", { name: "Saera" }],
    ["Viserra",            F, "Jaehaerys_I", "Alysanne", { name: "Viserra" }],
    ["Gaemon_JA",          M, "Jaehaerys_I", "Alysanne", { name: "Gaemon" }],
    ["Valerion",           M, "Jaehaerys_I", "Alysanne", { name: "Valerion" }],
    ["Gael",               F, "Jaehaerys_I", "Alysanne", { name: "Gael" }],
    ["Jocelyn_Baratheon",  F, null, null, { name: "Jocelyn Baratheon" }],
    ["Rodrik_Arryn",       M, null, null, { name: "Rodrik Arryn" }],
    // Grandchildren of Jaehaerys I
    ["Rhaenys_QWNW",       F, "Aemon_JA", "Jocelyn_Baratheon", { name: "Rhaenys", notes: "The Queen Who Never Was" }],
    ["Viserys_I",          M, "Baelon", "Alyssa", { name: "Viserys I" }],
    ["Daemon",             M, "Baelon", "Alyssa", { name: "Daemon" }],
    ["Aegon_Baelon",       M, "Baelon", "Alyssa", { name: "Aegon", notes: "Died in infancy" }],
    ["Aemma_Arryn",        F, "Rodrik_Arryn", "Daella_JA", { name: "Aemma Arryn" }],
    ["Corlys_Velaryon",    M, null, null, { name: "Corlys Velaryon" }],
    ["Alicent_Hightower",  F, null, null, { name: "Alicent Hightower" }],
    // The Dance of the Dragons generation
    ["Laena_Velaryon",     F, "Corlys_Velaryon", "Rhaenys_QWNW", { name: "Laena Velaryon" }],
    ["Laenor_Velaryon",    M, "Corlys_Velaryon", "Rhaenys_QWNW", { name: "Laenor Velaryon" }],
    ["Rhaenyra",           F, "Viserys_I", "Aemma_Arryn", { name: "Rhaenyra" }],
    ["Aegon_II",           M, "Viserys_I", "Alicent_Hightower", { name: "Aegon II" }],
    ["Helaena",            F, "Viserys_I", "Alicent_Hightower", { name: "Helaena" }],
    ["Aemond",             M, "Viserys_I", "Alicent_Hightower", { name: "Aemond" }],
    ["Daeron_VA",          M, "Viserys_I", "Alicent_Hightower", { name: "Daeron" }],
    ["Baela",              F, "Daemon", "Laena_Velaryon", { name: "Baela" }],
    ["Rhaena_Daemon",      F, "Daemon", "Laena_Velaryon", { name: "Rhaena" }],
    ["Jacaerys",           M, "Laenor_Velaryon", "Rhaenyra", { name: "Jacaerys Velaryon", notes: "Recorded as Laenor's son; widely believed to be fathered by Harwin Strong" }],
    ["Lucerys",            M, "Laenor_Velaryon", "Rhaenyra", { name: "Lucerys Velaryon", notes: "Recorded as Laenor's son; widely believed to be fathered by Harwin Strong" }],
    ["Joffrey",            M, "Laenor_Velaryon", "Rhaenyra", { name: "Joffrey Velaryon", notes: "Recorded as Laenor's son; widely believed to be fathered by Harwin Strong" }],
    ["Aegon_III",          M, "Daemon", "Rhaenyra", { name: "Aegon III", notes: "The Dragonbane" }],
    ["Viserys_II",         M, "Daemon", "Rhaenyra", { name: "Viserys II" }],
    ["Jaehaerys_AH",       M, "Aegon_II", "Helaena", { name: "Jaehaerys", notes: "Twin of Jaehaera" }],
    ["Jaehaera",           F, "Aegon_II", "Helaena", { name: "Jaehaera", notes: "Twin of Jaehaerys; first wife of Aegon III, no children" }],
    ["Maelor",             M, "Aegon_II", "Helaena", { name: "Maelor" }],
    ["Daenaera_Velaryon",  F, null, null, { name: "Daenaera Velaryon" }],
    ["Larra_Rogare",       F, null, null, { name: "Larra Rogare" }],
    // Children of Aegon III and of Viserys II
    ["Daeron_I",           M, "Aegon_III", "Daenaera_Velaryon", { name: "Daeron I", notes: "The Young Dragon" }],
    ["Baelor_I",           M, "Aegon_III", "Daenaera_Velaryon", { name: "Baelor I", notes: "The Blessed. Married his sister Daena; the marriage was never consummated" }],
    ["Daena",              F, "Aegon_III", "Daenaera_Velaryon", { name: "Daena", notes: "The Defiant" }],
    ["Rhaena_AD",          F, "Aegon_III", "Daenaera_Velaryon", { name: "Rhaena" }],
    ["Elaena",             F, "Aegon_III", "Daenaera_Velaryon", { name: "Elaena" }],
    ["Aegon_IV",           M, "Viserys_II", "Larra_Rogare", { name: "Aegon IV", notes: "The Unworthy" }],
    ["Aemon_Dragonknight", M, "Viserys_II", "Larra_Rogare", { name: "Aemon", notes: "The Dragonknight" }],
    ["Naerys",             F, "Viserys_II", "Larra_Rogare", { name: "Naerys" }],
    // Children of Aegon IV: by his sister Naerys, and by his cousin Daena
    ["Daeron_II",          M, "Aegon_IV", "Naerys", { name: "Daeron II", notes: "The Good. Rumoured to be the son of Aemon the Dragonknight" }],
    ["Daenerys_AN",        F, "Aegon_IV", "Naerys", { name: "Daenerys" }],
    ["Daemon_Blackfyre",   M, "Aegon_IV", "Daena", { name: "Daemon Blackfyre", notes: "Legitimised bastard; founder of House Blackfyre" }],
    ["Myriah_Martell",     F, null, null, { name: "Myriah Martell" }],
    ["Baelor_Breakspear",  M, "Daeron_II", "Myriah_Martell", { name: "Baelor", notes: "Breakspear" }],
    ["Aerys_I",            M, "Daeron_II", "Myriah_Martell", { name: "Aerys I" }],
    ["Rhaegel",            M, "Daeron_II", "Myriah_Martell", { name: "Rhaegel" }],
    ["Maekar_I",           M, "Daeron_II", "Myriah_Martell", { name: "Maekar I" }],
    ["Dyanna_Dayne",       F, null, null, { name: "Dyanna Dayne" }],
    // Children of Maekar I
    ["Daeron_Drunken",     M, "Maekar_I", "Dyanna_Dayne", { name: "Daeron", notes: "The Drunken" }],
    ["Aerion_Brightflame", M, "Maekar_I", "Dyanna_Dayne", { name: "Aerion", affected: true, notes: "Brightflame. Drank wildfire believing it would turn him into a dragon" }],
    ["Maester_Aemon",      M, "Maekar_I", "Dyanna_Dayne", { name: "Aemon", notes: "Maester of the Night's Watch" }],
    ["Daella_MD",          F, "Maekar_I", "Dyanna_Dayne", { name: "Daella" }],
    ["Aegon_V",            M, "Maekar_I", "Dyanna_Dayne", { name: "Aegon V", notes: "The Unlikely, called Egg" }],
    ["Rhae",               F, "Maekar_I", "Dyanna_Dayne", { name: "Rhae" }],
    ["Betha_Blackwood",    F, null, null, { name: "Betha Blackwood" }],
    ["Duncan",             M, "Aegon_V", "Betha_Blackwood", { name: "Duncan", notes: "The Small" }],
    ["Jaehaerys_II",       M, "Aegon_V", "Betha_Blackwood", { name: "Jaehaerys II" }],
    ["Shaera",             F, "Aegon_V", "Betha_Blackwood", { name: "Shaera" }],
    ["Daeron_AB",          M, "Aegon_V", "Betha_Blackwood", { name: "Daeron" }],
    ["Rhaelle",            F, "Aegon_V", "Betha_Blackwood", { name: "Rhaelle" }],
    // Children of the sibling marriage of Jaehaerys II and Shaera
    ["Aerys_II",           M, "Jaehaerys_II", "Shaera", { name: "Aerys II", affected: true, notes: "The Mad King" }],
    ["Rhaella",            F, "Jaehaerys_II", "Shaera", { name: "Rhaella" }],
    ["Rhaegar",            M, "Aerys_II", "Rhaella", { name: "Rhaegar" }],
    ["Viserys",            M, "Aerys_II", "Rhaella", { name: "Viserys" }],
    ["Daenerys",           F, "Aerys_II", "Rhaella", { name: "Daenerys", deceased: false, notes: "Stormborn" }],
    ["Elia_Martell",       F, null, null, { name: "Elia Martell" }],
    ["Lyanna_Stark",       F, null, null, { name: "Lyanna Stark" }],
    ["Rhaenys_RE",         F, "Rhaegar", "Elia_Martell", { name: "Rhaenys" }],
    ["Aegon_RE",           M, "Rhaegar", "Elia_Martell", { name: "Aegon", notes: "Killed in the Sack of King's Landing, or smuggled to safety, depending on whom you believe" }],
    ["Jon_Snow",           M, "Rhaegar", "Lyanna_Stark", { name: "Jon Snow", proband: true, deceased: false, notes: "Born Aegon. Raised as Eddard Stark's bastard; Rhaegar's son by Lyanna" }],
  ];

  const focal = { affected: true };
  const classic: Array<[string, string, Row[]]> = [
    ["3/4 siblings", "share a mother; fathers are brothers. Kinship 3/16", [
      ["GF", M, null, null], ["GM", F, null, null],
      ["F1", M, "GF", "GM"], ["F2", M, "GF", "GM"], ["M", F, null, null],
      ["A", M, "F1", "M", focal], ["B", F, "F2", "M", focal],
    ]],
    ["5/8 siblings", "share a mother; fathers are half brothers. Kinship 5/32", [
      ["GF", M, null, null], ["GM1", F, null, null], ["GM2", F, null, null],
      ["F1", M, "GF", "GM1"], ["F2", M, "GF", "GM2"], ["M", F, null, null],
      ["A", M, "F1", "M", focal], ["B", F, "F2", "M", focal],
    ]],
    ["Full-sib mating", "brother and sister have a child. F = 1/4", [
      ["GF", M, null, null], ["GM", F, null, null],
      ["S", M, "GF", "GM"], ["D", F, "GF", "GM"],
      ["C", M, "S", "D", focal],
    ]],
    ["Half-sib triangle", "every pair of parents are half siblings", [
      ["P1", M, null, null], ["P2", F, null, null], ["P3", M, null, null], ["P4", F, null, null],
      ["C12", M, "P1", "P2"], ["C23", F, "P3", "P2"], ["C34", M, "P3", "P4"],
      ["D1", M, "C12", "C23"], ["D2", F, "C34", "C23"],
      ["E", M, "D1", "D2", focal],
    ]],
    ["Double first cousins", "two sibling pairs intermarry. Kinship 1/8", [
      ["A1", M, null, null], ["A2", F, null, null], ["B1", M, null, null], ["B2", F, null, null],
      ["a1", M, "A1", "A2"], ["a2", F, "A1", "A2"], ["b1", M, "B1", "B2"], ["b2", F, "B1", "B2"],
      ["X", M, "a1", "b2", focal], ["Y", F, "b1", "a2", focal],
    ]],
    ["Double second cousins (A)", "fathers first cousins, mothers first cousins. Kinship 1/32", [
      ["G1", M, null, null], ["G2", F, null, null], ["H1", M, null, null], ["H2", F, null, null],
      ["g1", M, "G1", "G2"], ["g2", M, "G1", "G2"], ["s1", F, null, null], ["s2", F, null, null],
      ["h1", F, "H1", "H2"], ["h2", F, "H1", "H2"], ["t1", M, null, null], ["t2", M, null, null],
      ["P1", M, "g1", "s1"], ["P2", M, "g2", "s2"], ["Q1", F, "t1", "h1"], ["Q2", F, "t2", "h2"],
      ["X", M, "P1", "Q1", focal], ["Y", F, "P2", "Q2", focal],
    ]],
    ["Double second cousins (B)", "fathers are double first cousins. Kinship 1/32", [
      ["G1", M, null, null], ["G2", F, null, null], ["H1", M, null, null], ["H2", F, null, null],
      ["g1", M, "G1", "G2"], ["g2", F, "G1", "G2"], ["h1", M, "H1", "H2"], ["h2", F, "H1", "H2"],
      ["P1", M, "g1", "h2"], ["P2", M, "h1", "g2"], ["s1", F, null, null], ["s2", F, null, null],
      ["X", M, "P1", "s1", focal], ["Y", F, "P2", "s2", focal],
    ]],
    ["Quadruple half first cousins", "each parent of X is a half sibling of each parent of Y. Kinship 1/8", [
      ["A", M, null, null], ["B", F, null, null], ["C", M, null, null], ["D", F, null, null],
      ["F1", M, "A", "B"], ["M1", F, "C", "D"], ["F2", M, "A", "D"], ["M2", F, "C", "B"],
      ["X", M, "F1", "M1", focal], ["Y", F, "F2", "M2", focal],
    ]],
    ["Grandparent and grandchild's partner", "a couple spanning two generations", [
      ["GF", M, null, null], ["GM", F, null, null],
      ["P", F, "GF", "GM"], ["S", M, null, null],
      ["GC", M, "S", "P"], ["Z", F, null, null],
      ["GGC", F, "GC", "Z"], ["W", M, "GF", "Z", focal],
    ]],
    ["Two lineages joined twice", "marriages between two families in successive generations", [
      ["A1", M, null, null], ["A2", F, null, null], ["B1", M, null, null], ["B2", F, null, null],
      ["a1", M, "A1", "A2"], ["a2", F, "A1", "A2"], ["b1", F, "B1", "B2"], ["b2", M, "B1", "B2"],
      ["X", M, null, null], ["Y", F, null, null],
      ["c1", M, "a1", "b1", focal], ["a3", M, "X", "a2"], ["b3", F, "b2", "Y"],
      ["c2", F, "a3", "b3", focal],
    ]],
  ];

  return [
    {
      label: "Spanish Habsburgs",
      description: "9 generations · 33 individuals · nested uncle-niece and cousin marriages",
      group: "Historic",
      citation: "Alvarez, Ceballos & Quinteiro (2009) PLoS ONE 4(4): e5174, Fig. 1",
      data: fromRows(habsburg, { deceased: true }),
    },
    {
      label: "Queen Victoria · haemophilia B",
      description: "4 generations · 49 individuals · X-linked recessive with carriers",
      group: "Historic",
      citation: "Rogaev et al. (2009) Science 326: 817, Fig. S1",
      data: fromRows(victoria, { deceased: true }),
    },
    {
      label: "Tutankhamun's family",
      description: "5 generations · 10 individuals · brother-sister parents",
      group: "Historic",
      citation: "Hawass et al. (2010) JAMA 303(7): 638, Fig. 2",
      data: fromRows(tutankhamun, { deceased: true }),
    },
    ...classic.map(([label, description, rows]): ExamplePedigree => ({
      label,
      description: `${rows.length} individuals · ${description}`,
      group: "Classic",
      data: fromRows(rows),
    })),
    {
      label: "House Targaryen",
      description: "16 generations · 96 individuals · sibling, uncle-niece and cousin marriages. Daenerys F = 0.375",
      group: "Fiction",
      citation: "G. R. R. Martin, Fire & Blood (2018) and A Song of Ice and Fire",
      data: fromRows(targaryen, { deceased: true }),
    },
  ];
}
