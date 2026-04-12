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
