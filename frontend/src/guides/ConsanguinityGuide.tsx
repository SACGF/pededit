import { kinshipCoefficients, type Pedigree } from "@pedigree-editor/layout-engine";
import { F, M, U, couple, family } from "../data/pedigreeBuilder";
import { GuideFigure } from "./GuideFigure";
import { AppLink, H2, P, References } from "./GuideLayout";

const settings = { nodesMoveable: false, snapToGrid: false, snapGridSize: 5, notation: "nsgc2022" as const };

/** First cousins with a child: the double line comes from the drawn grandparents. */
const firstCousins: Pedigree = family(
  [M("gf"), F("gm"), M("a"), F("aw"), F("b"), M("bh"), M("x"), F("y"), U("c", { affected: true, proband: true })],
  [couple("g", "gf", "gm"), couple("pa", "a", "aw"), couple("pb", "bh", "b"), couple("xy", "x", "y")],
  { g: ["a", "b"], pa: ["x"], pb: ["y"], xy: ["c"] },
  { canvasSettings: settings },
);

/** A couple related through ancestors not on the chart: the double line set by hand, the degree written above. */
const notDrawn: Pedigree = family(
  [M("x"), F("y"), F("c1"), M("c2")],
  [couple("xy", "x", "y", { consanguineous: true, consanguinityLabel: "second cousins" })],
  { xy: ["c1", "c2"] },
  { canvasSettings: settings },
);

/** The figures on the page, for the tests. */
export const CONSANGUINITY_FIGURES: Pedigree[] = [firstCousins, notDrawn];

interface Relationship {
  name: string;
  pedigree: Pedigree;
  pair: [string, string];
}

// Each relationship as a small family, so the table is PedEdit's own calculation.
const g = [M("gf"), F("gm")];
const RELATIONSHIPS: Relationship[] = [
  { name: "Parent and child", pair: ["gf", "a"], pedigree: family([...g, M("a")], [couple("g", "gf", "gm")], { g: ["a"] }) },
  { name: "Full siblings", pair: ["a", "b"], pedigree: family([...g, M("a"), F("b")], [couple("g", "gf", "gm")], { g: ["a", "b"] }) },
  {
    name: "Half siblings", pair: ["a", "b"],
    pedigree: family([...g, F("gm2"), M("a"), F("b")], [couple("g", "gf", "gm"), couple("g2", "gf", "gm2")], { g: ["a"], g2: ["b"] }),
  },
  {
    name: "Uncle and niece, aunt and nephew", pair: ["a", "n"],
    pedigree: family([...g, M("a"), F("b"), M("bh"), F("n")], [couple("g", "gf", "gm"), couple("pb", "bh", "b")], { g: ["a", "b"], pb: ["n"] }),
  },
  {
    name: "Double first cousins", pair: ["x", "y"],
    pedigree: family(
      [...g, M("gf2"), F("gm2"), M("a1"), M("a2"), F("b1"), F("b2"), M("x"), F("y")],
      [couple("g", "gf", "gm"), couple("g2", "gf2", "gm2"), couple("p1", "a1", "b1"), couple("p2", "a2", "b2")],
      { g: ["a1", "a2"], g2: ["b1", "b2"], p1: ["x"], p2: ["y"] },
    ),
  },
  { name: "First cousins", pair: ["x", "y"], pedigree: firstCousins },
  {
    name: "First cousins once removed", pair: ["x", "z"],
    pedigree: family(
      [...g, M("a"), F("aw"), F("b"), M("bh"), M("x"), F("y"), M("yh"), F("z")],
      [couple("g", "gf", "gm"), couple("pa", "a", "aw"), couple("pb", "bh", "b"), couple("py", "yh", "y")],
      { g: ["a", "b"], pa: ["x"], pb: ["y"], py: ["z"] },
    ),
  },
  {
    name: "Second cousins", pair: ["x2", "z"],
    pedigree: family(
      [...g, M("a"), F("aw"), F("b"), M("bh"), M("x"), F("xw"), F("y"), M("yh"), M("x2"), F("z")],
      [couple("g", "gf", "gm"), couple("pa", "a", "aw"), couple("pb", "bh", "b"), couple("px", "x", "xw"), couple("py", "yh", "y")],
      { g: ["a", "b"], pa: ["x"], pb: ["y"], px: ["x2"], py: ["z"] },
    ),
  },
];

/** "1/16", for a kinship that is a power of a half. */
const fraction = (k: number) => `1/${Math.round(1 / k)}`;

/** Kinship of each relationship's pair, worked out by PedEdit. */
export const KINSHIP_TABLE: { name: string; kinship: number }[] = RELATIONSHIPS.map(r => ({
  name: r.name,
  kinship: kinshipCoefficients(r.pedigree).kinship(...r.pair),
}));

export function ConsanguinityGuide() {
  return (
    <>
      <H2>How it is drawn</H2>
      <P>
        A consanguineous couple, partners who are related by descent (blood relatives), is joined by a double
        relationship line. When the drawing shows how they are related, as with the first cousins below, whose shared
        grandparents are on the chart, nothing more is needed.
      </P>
      <GuideFigure pedigree={firstCousins} alt="First cousins with a child: the couple joined by a double line, their shared grandparents at the top" />
      <P>
        When the relationship is not clear from the drawing, because the shared ancestors are left off or the link is
        too distant to draw, write the degree of relationship above the double line, such as "second cousins". In a
        community where many marriages are within the group, a couple can be related in ways no one can trace: the
        double line and a note such as "related, degree unknown" record that.
      </P>
      <GuideFigure pedigree={notDrawn} alt="A couple joined by a double line with 'second cousins' written above it, and two children" />
      <P>
        Ask every couple directly whether they are related: it is easy to miss when the families use different
        surnames, and it changes the assessment of recessive conditions.
      </P>

      <H2>Kinship and inbreeding coefficients</H2>
      <P>
        The <strong>kinship coefficient</strong> of two people is the chance that a gene copy picked at random from one
        and a copy of the same gene picked at random from the other are identical by descent, inherited from a shared
        ancestor. The <strong>inbreeding coefficient</strong> F of a person is the kinship coefficient of their parents:
        the chance that their own two copies of a gene are the same ancestral copy. The child of first cousins has F =
        1/16. The <strong>coefficient of relationship</strong> r, the share of genes two relatives have in common by
        descent, is twice their kinship when neither is inbred.
      </P>
      <div className="overflow-x-auto mb-3">
        <table className="text-xs border-collapse w-full max-w-xl">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-4 font-medium">Relationship</th>
              <th className="py-1 pr-4 font-medium">Kinship, and F of their child</th>
              <th className="py-1 font-medium">r</th>
            </tr>
          </thead>
          <tbody>
            {KINSHIP_TABLE.map(r => (
              <tr key={r.name} className="border-b border-gray-100">
                <td className="py-1 pr-4">{r.name}</td>
                <td className="py-1 pr-4 tabular-nums">{fraction(r.kinship)} ({r.kinship.toFixed(4).replace(/0+$/, "")})</td>
                <td className="py-1 tabular-nums">{fraction(2 * r.kinship)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P>
        Each value assumes the relatives are related in only that one way. Where families have married within each other
        over several generations, the paths add up and the coefficient is higher than the closest relationship alone
        gives: Daenerys Targaryen, whose parents were brother and sister from generations of such marriages, has
        F = 0.375 (<AppLink to="/example/targaryen">House Targaryen example</AppLink>).
      </P>
      <P>
        For X-linked conditions the X-linked coefficients apply. A man has one X chromosome, from his mother, so the
        values differ: a man is not inbred on the X, and relationships through father and son carry no X at all.
      </P>

      <H2>Why it matters</H2>
      <P>
        The closer the relationship, the greater the chance that both partners carry the same recessive variant from
        their shared ancestor, and so that a child inherits two copies. For first cousins the risk of a child with a
        serious birth defect or genetic condition is usually quoted as about 1.7 to 2.8 percentage points above the risk
        in the general population (Bennett et al. 2002). A known recessive condition in the family raises it further.
      </P>

      <H2>In PedEdit</H2>
      <P>
        PedEdit works the coefficients out from the drawn family. The double line is drawn automatically when the chart
        shows a couple are related, and the Person tab gives a couple's kinship (the inbreeding coefficient of their
        children) and an inbred person's F, autosomal and X-linked. Select any two people to see their kinship and the
        name of their relationship. For a couple related through ancestors not drawn, set the double line by hand in
        More options, and write the degree above it on the Person tab. Settings, Name consanguineous relationships
        writes the relationship above every double line.
      </P>
      <P>
        Examples to open: <AppLink to="/example/uncle-niece">uncle and niece</AppLink>,{" "}
        <AppLink to="/example/practice-cystic-fibrosis">cystic fibrosis with first cousin parents</AppLink>,{" "}
        <AppLink to="/example/habsburgs">the Spanish Habsburgs</AppLink>.
      </P>

      <References />
      <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-gray-600">
        <li>Bennett RL, Motulsky AG, Bittles A, et al. (2002). Genetic counseling and screening of consanguineous couples and their offspring: recommendations of the National Society of Genetic Counselors. J Genet Couns 11:97-119.</li>
      </ul>
    </>
  );
}
