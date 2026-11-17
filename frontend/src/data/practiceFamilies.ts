/**
 * Practice families for teaching (#202): invented families told as a
 * history to draw from, with the drawn answer. The guide page
 * /guides/practice-families prints the history and draws the answer, and
 * each is also an example (group "Practice" in `examples.ts`), so the answer
 * opens in the editor at /example/<slug>.
 */
import type { Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { F, M, U, couple, family } from "./pedigreeBuilder";

export interface PracticeFamily {
  /** Its /example/<slug> link: published, so never change or reuse one. */
  slug: string;
  label: string;
  /** One line for the example picker. */
  description: string;
  /** What the family is there to practise. */
  teaches: string;
  /** The family history as it would be told, one paragraph per entry. */
  history: string[];
  /** What a correct drawing shows, to check an attempt against. */
  checks: string[];
  data: Pedigree;
}

const cancerTags: Tag[] = [
  { id: "bc", label: "Breast cancer", color: "#1f77b4", style: "quadrant", abbrev: "BC" },
  { id: "oc", label: "Ovarian cancer", color: "#d62728", style: "quadrant", abbrev: "OC" },
];

const cfTags: Tag[] = [
  { id: "cf", label: "Cystic fibrosis", color: "#1f77b4", style: "quadrant", abbrev: "CF" },
];

const dmdTags: Tag[] = [
  { id: "dmd", label: "Duchenne muscular dystrophy", color: "#d62728", style: "quadrant", abbrev: "DMD" },
];

export const PRACTICE_FAMILIES: PracticeFamily[] = [
  {
    slug: "practice-breast-ovarian-cancer",
    label: "Breast and ovarian cancer",
    description: "3 generations · two conditions on the mother's side · an unaffected consultand",
    teaches: "A consultand who is not affected, two conditions in one family, ages at diagnosis and ages at death.",
    history: [
      "Sarah, 38, asks about her risk of cancer. She is well. Her partner is 40 and well, and they have two sons, aged 10 and 8.",
      "Sarah's mother had breast cancer at 41 and ovarian cancer at 58, and died at 61. Her mother's sister had breast cancer at 47 and is alive at 70. Her mother's brother is 68 and well.",
      "Her maternal grandmother died of ovarian cancer, diagnosed at 50, at 52. Her maternal grandfather died at 80 of a stroke.",
      "Sarah's father is 72 and well. Sarah has a younger sister, 35, who is well.",
    ],
    checks: [
      "Sarah has the consultand's arrow, without a P: she is the person asking, and she is not affected.",
      "Two conditions, so each affected symbol is divided: breast cancer in one half, ovarian cancer in the other. Sarah's mother has both.",
      "Ages of diagnosis are written under the symbols, and the key names both conditions.",
      "Sarah's mother and grandmother are drawn with the deceased slash and their age at death.",
      "Siblings are in birth order, oldest on the left.",
    ],
    data: family(
      [
        M("mgf", { deceased: true, age: "d. 80y" }),
        F("mgm", { deceased: true, age: "d. 52y", tags: ["oc"], tagOnset: { oc: "50y" } }),
        F("aunt", { age: "70y", tags: ["bc"], tagOnset: { bc: "47y" } }),
        F("mother", { deceased: true, age: "d. 61y", tags: ["bc", "oc"], tagOnset: { bc: "41y", oc: "58y" } }),
        M("uncle", { age: "68y" }),
        M("father", { age: "72y" }),
        F("sarah", { name: "Sarah", age: "38y", consultand: true }),
        M("partner", { age: "40y" }),
        F("sister", { age: "35y" }),
        M("son1", { age: "10y" }),
        M("son2", { age: "8y" }),
      ],
      [
        couple("gp", "mgf", "mgm"),
        couple("par", "father", "mother"),
        couple("sp", "partner", "sarah"),
      ],
      {
        gp: ["aunt", "mother", "uncle"],
        par: ["sarah", "sister"],
        sp: ["son1", "son2"],
      },
      { tags: cancerTags },
    ),
  },
  {
    slug: "practice-cystic-fibrosis",
    label: "Cystic fibrosis, first cousin parents",
    description: "4 generations · autosomal recessive · consanguinity · a pregnancy",
    teaches: "An affected child of a consanguineous couple, carriers found by testing, and a current pregnancy.",
    history: [
      "Omar, 3, has cystic fibrosis. He was referred with his parents, Karim (32) and Leila (29), who are first cousins: Karim's father and Leila's mother are brother and sister.",
      "Karim and Leila have both been tested and each is a carrier of cystic fibrosis. Omar has an older sister, 6, who is well and has not been tested. Leila is 16 weeks pregnant.",
      "Karim's parents are 60 and 57; Leila's parents are 58 and 61. All four are well. Their parents, the couple the cousins descend from, have died.",
    ],
    checks: [
      "Omar is the proband: affected, with the arrow and P.",
      "Karim and Leila are joined by a double relationship line, because the drawing shows they are related. Their common grandparents are drawn, so the degree of relationship needs no text.",
      "Both parents are drawn as carriers of cystic fibrosis, and the key says so.",
      "The pregnancy is a diamond with P inside (sex not known) and 16 wk under it, to the right of Omar.",
      "Leila's father and Karim's mother married in, so they have no parents drawn.",
    ],
    data: family(
      [
        M("ggf", { deceased: true }), F("ggm", { deceased: true }),
        M("hassan", { age: "60y" }), F("hassanW", { age: "57y" }),
        F("samira", { age: "58y" }), M("samiraH", { age: "61y" }),
        M("karim", { name: "Karim", age: "32y", carrierTags: ["cf"] }),
        F("leila", { name: "Leila", age: "29y", carrierTags: ["cf"] }),
        F("sister", { age: "6y" }),
        M("omar", { name: "Omar", age: "3y", proband: true, tags: ["cf"] }),
        U("preg", { lifeStatus: "pregnancy", age: "16 wk" }),
      ],
      [
        couple("gg", "ggf", "ggm"),
        couple("h", "hassan", "hassanW"),
        couple("s", "samiraH", "samira"),
        couple("kl", "karim", "leila"),
      ],
      {
        gg: ["hassan", "samira"],
        h: ["karim"],
        s: ["leila"],
        kl: ["sister", "omar", "preg"],
      },
      { tags: cfTags },
    ),
  },
  {
    slug: "practice-duchenne",
    label: "Duchenne muscular dystrophy",
    description: "3 generations · X-linked recessive · a carrier mother and an affected uncle",
    teaches: "An X-linked family: affected males on the mother's side, a carrier found by testing, and someone who died of the condition.",
    history: [
      "Jack, 6, has Duchenne muscular dystrophy. His mother, Emma (31), has been tested and is a carrier. His father is 33 and well. Jack has a younger brother, 4, who is not affected, and a sister, 2.",
      "Emma's older brother Michael had Duchenne muscular dystrophy and died at 19. Emma also has a younger sister, 28, who has not been tested.",
      "Emma's parents are 58 and 60 and well. Her mother has not been tested.",
    ],
    checks: [
      "Jack is the proband, with the arrow and P.",
      "Michael is affected and deceased, with his age at death under the symbol.",
      "Emma is drawn as a carrier of Duchenne muscular dystrophy. Her mother and sister are not marked, since neither has been tested; the history, not the drawing, says what is known of them.",
      "Emma's sibship is in birth order: Michael, Emma, then her sister.",
    ],
    data: family(
      [
        M("gf", { age: "60y" }), F("gm", { age: "58y" }),
        M("michael", { name: "Michael", deceased: true, age: "d. 19y", tags: ["dmd"] }),
        F("emma", { name: "Emma", age: "31y", carrierTags: ["dmd"] }),
        F("aunt", { age: "28y" }),
        M("father", { age: "33y" }),
        M("jack", { name: "Jack", age: "6y", proband: true, tags: ["dmd"] }),
        M("brother", { age: "4y" }),
        F("sister", { age: "2y" }),
      ],
      [
        couple("gp", "gf", "gm"),
        couple("par", "father", "emma"),
      ],
      {
        gp: ["michael", "emma", "aunt"],
        par: ["jack", "brother", "sister"],
      },
      { tags: dmdTags },
    ),
  },
  {
    slug: "practice-twins-and-pregnancies",
    label: "Twins, a pregnancy and a loss",
    description: "3 generations · twins · a miscarriage · an ended relationship · no condition",
    teaches: "The structure of a family with no condition in it: twins, a pregnancy and a pregnancy loss, a previous partner, and a partner whose family history is not known.",
    history: [
      "Priya, 34, and her partner Tom, 36, come for counselling in their third pregnancy, now at 12 weeks. Their first pregnancy ended in a miscarriage at 9 weeks. They have a daughter aged 3.",
      "Priya is an identical twin. Her twin sister has two sons, aged 6 and 4, with her husband. Their parents are 63 and 65 and well.",
      "Tom has a son, 10, from an earlier marriage that has ended. Tom was brought up away from his birth family and knows nothing of its history.",
    ],
    checks: [
      "Priya is the consultand: the arrow without P.",
      "Priya and her sister hang from one point on the sibship line with a bar between their lines: monozygotic twins.",
      "The miscarriage is a small triangle, oldest on the left, then the daughter, then the pregnancy (P inside) with 12 wk under it.",
      "Tom's earlier relationship line has two short strokes across it: the relationship has ended. Their son hangs from that line.",
      "Tom has a ? above his symbol: family history not known.",
    ],
    data: (() => {
      const p = family(
        [
          M("gf", { age: "65y" }), F("gm", { age: "63y" }),
          F("priya", { name: "Priya", age: "34y", consultand: true }),
          F("twin", { age: "34y" }),
          M("twinH"),
          M("n1", { age: "6y" }), M("n2", { age: "4y" }),
          F("ex"),
          M("tom", { name: "Tom", age: "36y", familyHistoryUnknown: true }),
          M("son", { age: "10y" }),
          U("loss", { lifeStatus: "miscarriage", age: "9 wk" }),
          F("daughter", { age: "3y" }),
          U("preg", { lifeStatus: "pregnancy", age: "12 wk" }),
        ],
        [
          couple("gp", "gf", "gm"),
          couple("tw", "twinH", "twin"),
          couple("old", "ex", "tom", { ended: true }),
          couple("now", "tom", "priya"),
        ],
        {
          gp: ["priya", "twin"],
          tw: ["n1", "n2"],
          old: ["son"],
          now: ["loss", "daughter", "preg"],
        },
      );
      p.partnerships.find(c => c.id === "gp")!.twins = [{ members: ["priya", "twin"], zygosity: "monozygotic" }];
      return p;
    })(),
  },
];
