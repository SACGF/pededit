import type { ReactNode } from "react";
import type { Individual, Partnership, Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { F, M, couple, family } from "../data/pedigreeBuilder";
import { GuideFigure } from "./GuideFigure";
import { AppLink, H2, P, References } from "./GuideLayout";

const hcm: Tag[] = [{ id: "hcm", label: "Hypertrophic cardiomyopathy", color: "#000000", style: "quadrant", abbrev: "HCM" }];

/**
 * One family drawn a step at a time: step 1 is the proband alone, each later
 * step adds a ring of relatives, and the last adds the details under the
 * symbols and the pedigree numbers.
 */
function stage(step: 1 | 2 | 3 | 4 | 5): Pedigree {
  const details = step >= 5;
  const d = (extra: Partial<Individual>) => (details ? extra : {});
  const people: Individual[] = [
    F("pro", { proband: true, tags: ["hcm"], ...d({ age: "34y", tagOnset: { hcm: "30y" } }) }),
  ];
  const couples: Partnership[] = [];
  const parentOf: Record<string, string[]> = {};
  if (step >= 2) {
    people.push(
      M("fa", d({ deceased: true, age: "d. 58y", tags: ["hcm"], tagOnset: { hcm: "45y" } })),
      F("mo", d({ age: "63y" })),
      M("bro", d({ age: "37y", tags: ["hcm"], tagOnset: { hcm: "36y" } })),
      F("sis", d({ age: "29y" })),
    );
    couples.push(couple("par", "fa", "mo"));
    parentOf.par = ["bro", "pro", "sis"];
  }
  if (step >= 3) {
    people.push(M("pa", d({ age: "36y" })), M("son", d({ age: "6y" })), F("dau", d({ age: "3y" })));
    couples.push(couple("pp", "pa", "pro"));
    parentOf.pp = ["son", "dau"];
  }
  if (step >= 4) {
    people.push(
      M("pgf", d({ deceased: true, age: "d. 40s" })), F("pgm", d({ deceased: true, age: "d. 81y" })),
      M("unc", d({ age: "61y" })),
      M("mgf", d({ age: "88y" })), F("mgm", d({ deceased: true, age: "d. 79y" })),
      F("aun", d({ age: "60y" })),
    );
    couples.push(couple("pg", "pgf", "pgm"), couple("mg", "mgf", "mgm"));
    parentOf.pg = ["fa", "unc"];
    parentOf.mg = ["mo", "aun"];
  }
  return family(people, couples, parentOf, {
    tags: hcm,
    canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 5, notation: "nsgc2022", showNumbers: details },
  });
}

/** The figures on the page, for the tests. */
export const HOW_TO_FIGURES: Pedigree[] = ([1, 2, 3, 4, 5] as const).map(stage);

/** What to do in PedEdit at a step. */
function InPedEdit({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm text-gray-600 border-l-2 border-gray-200 pl-3"><span className="font-medium text-gray-800">In PedEdit:</span> {children}</p>;
}

export function HowToDrawGuide() {
  return (
    <>
      <P>
        A pedigree is usually drawn while taking the family history, starting from one person and working outwards. The
        figures follow one family through the steps. The standard symbols are on the{" "}
        <AppLink to="/guides/pedigree-symbols">pedigree symbols cheat sheet</AppLink>.
      </P>

      <H2>1. Start with the proband or consultand</H2>
      <P>
        Draw first the person the history is about: the proband (the affected person through whom the family came to
        attention, arrow with P) or the consultand (the person asking for advice, arrow without P). Leave room around
        them: the parents go above, partners beside, children below.
      </P>
      <GuideFigure pedigree={HOW_TO_FIGURES[0]} alt="Step 1: the proband alone, a shaded circle with an arrow and P" />
      <InPedEdit>
        "Create blank pedigree" on the home page, then the square, circle or diamond in the toolbar. Select the person
        and tick Proband or Consultand on the Person tab.
      </InPedEdit>

      <H2>2. Parents and siblings</H2>
      <P>
        Add both parents, joined by the relationship line, and the full siblings. Siblings go left to right from the
        oldest, so ask for each one's age. Ask about pregnancies that did not go to term too: miscarriages,
        terminations and stillbirths go in the sibship in their place.
      </P>
      <GuideFigure pedigree={HOW_TO_FIGURES[1]} alt="Step 2: parents and siblings added" />
      <InPedEdit>
        hover over a person for the quick buttons: Add parents, Add son, Add daughter, Add sibling. Siblings can be moved
        left and right in the More options menu (the ⋯ button or a right-click).
      </InPedEdit>

      <H2>3. Partners and children</H2>
      <P>
        Add the proband's partner and their children, and any children with an earlier partner. Half siblings hang from
        the relationship line of the parents they share.
      </P>
      <GuideFigure pedigree={HOW_TO_FIGURES[2]} alt="Step 3: the proband's partner and two children added" />
      <InPedEdit>More options, Add partner, then Add son or Add daughter on either partner.</InPedEdit>

      <H2>4. Grandparents, aunts, uncles and cousins</H2>
      <P>
        Go up a generation on each side: grandparents, then the parents' brothers and sisters, then their children if
        the condition calls for it. A three-generation pedigree, which takes in the first- and second-degree relatives,
        is the usual minimum. Ask both sides, even when the condition seems to run in one.
      </P>
      <GuideFigure pedigree={HOW_TO_FIGURES[3]} alt="Step 4: both sets of grandparents, an uncle and an aunt added" />

      <H2>5. Health, ages and results</H2>
      <P>
        For each person record: age, or age at death and its cause; each condition with the age at diagnosis; and any
        test results. Shade the affected, mark carriers, and put the deceased slash through those who have died. Ask
        directly whether the parents, or any couple in the family, are related to each other: a consanguineous couple is
        drawn with a double line (see <AppLink to="/guides/consanguinity">consanguinity</AppLink>).
      </P>
      <P>
        Number the generations with Roman numerals from the top and the people in each generation from the left, so
        anyone can be named in a letter or a paper: II-2 is the second person in the second generation.
      </P>
      <GuideFigure pedigree={HOW_TO_FIGURES[4]} alt="Step 5: the full three-generation pedigree with ages, conditions and pedigree numbers" />
      <InPedEdit>
        the Person tab has age, deceased and the dates, and Conditions and tags defines each condition, its fill and its
        age of onset. Settings, Show pedigree numbers adds the numbers.
      </InPedEdit>

      <H2>6. The key and the record</H2>
      <P>
        Define every shading and abbreviation in a key. Write down who took the history and when, who gave it (the
        historian), the reason for referral, and the ancestry of both sides of the family. Leave off what identifies
        people when a pedigree is to be shared or published: initials or no names, ages rather than dates of birth.
      </P>
      <InPedEdit>
        the key is built from the chart. Clinical details on the Pedigree tab hold the referral reason, ancestry,
        historian, recorder and date. Export to SVG, PNG or PDF, with De-identify to leave out names and dates.
      </InPedEdit>

      <H2>Try it</H2>
      <P>
        <AppLink to="/example/three-generations">Open a three-generation example</AppLink> in the editor, or draw one of
        the <AppLink to="/guides/practice-families">practice families</AppLink> from its history and check it against
        the answer.
      </P>

      <References />
    </>
  );
}
