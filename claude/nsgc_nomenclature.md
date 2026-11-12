# NSGC pedigree nomenclature: what we follow

The standard for drawing clinical pedigrees is the National Society of Genetic
Counselors (NSGC) nomenclature. Journals (AJHG, AJMG, Genetics in Medicine, J
Genet Couns), the AMA Manual of Style and genetic counselling training
programmes use it. PedEdit follows it unless this file says otherwise.

## Sources

- Bennett RL et al. (1995). Recommendations for standardized human pedigree
  nomenclature. Am J Hum Genet 56:745-752. The original.
- Bennett RL, French KS, Resta RG, Doyle DL (2008). Standardized human
  pedigree nomenclature: update and assessment of the recommendations of the
  NSGC. J Genet Couns 17:424-433. doi:10.1007/s10897-008-9169-9. Free to read
  from the publisher. **The main reference: Figures 1 to 4 are the symbol
  tables.**
- Bennett RL, French KS, Resta RG, Austin J (2022). Practice resource-focused
  revision: standardized pedigree nomenclature update centered on sex and
  gender inclusivity. J Genet Couns 31:1238-1248. doi:10.1002/jgc4.1621.
  Paywalled. We have Bennett's December 2022 teaching slides summarising it,
  not the paper.
- Resta RG et al. (2022). Both sides now: changing a long-standing pedigree
  tradition of men on the left and women on the right. J Genet Couns.
  doi:10.1002/jgc4.1662.

Copies of the 2008 paper and the 2022 slides are in the private repo
(`pededit_private/reference/nsgc/`), not here, because they are copyrighted.

## Rules, in our words, with where PedEdit stands

Section numbers refer to the 2008 figures.

### Symbols (Fig. 1)

| Rule | PedEdit |
|---|---|
| Square, circle, diamond. Diamond for sex not specified. Do not write age inside the symbol. | Follows. Symbols encode biological sex: see "Where we differ" below. |
| Affected: shaded. Two or more conditions: partition the symbol, one fill per condition, defined in the key. | Follows (tags, #3). |
| **Several people as one symbol:** the number of siblings is written inside the symbol, "n" when unknown. **Affected people are not grouped.** | Only used for collapsed branches (#1). See the gaps below. |
| Deceased: a slash through the symbol, extending past it. Do not use a cross. Cause of death below if known. | Follows. |
| Proband: arrow with "P" at the lower left. Consultand: arrow without "P". | **Gap:** the proband arrow has no "P". No consultand arrow. |
| Stillbirth "SB" with gestational age; pregnancy "P" inside the symbol; miscarriage (SAB), termination (TOP) and ectopic (ECT) as small triangles. | Follows (#12 era work, `pedigree/lifeStatus.ts`). |

### Text below the symbol (Fig. 1 instructions)

Below the symbol, or to its lower right, in this order:

1. age, or year of birth / death ("b. 1978", "d. 2007", "30y", "4 mo", "d. 60's");
2. evaluation and test results (Fig. 4);
3. pedigree number (I-1, II-3).

Privacy: prefer birth year or age, and year or age at death, over full dates.
Use initials or first names rather than full names on clinical pedigrees.

| Rule | PedEdit |
|---|---|
| Age / year of birth first | Free-text age (#20) and DOB. **Gap:** the canvas shows the full date of birth, where the standard prefers year or age. |
| Pedigree number last, below the other text | **Gap:** #8 puts the number before the name on the same line. |
| Age at onset is pedigree information for risk assessment (2008, p. 431) | #93 records it. The standard gives no exact wording; "dx" is common practice. |

### Lines (Fig. 2)

| Rule | PedEdit |
|---|---|
| Relationship, line of descent, sibship and individual's lines as defined. | Follows. |
| Siblings left to right in birth order, oldest first. | Sibling order setting. |
| Male partner on the left "if possible" (2008). Dropped as a rule in 2022 ("Both sides now"). | No rule enforced, which matches 2022. |
| A break (two slashes) in the relationship line means the relationship has ended. | Follows (#98): `Partnership.ended`. |
| Consanguinity: double relationship line. **If the degree of relationship is not obvious from the pedigree, write it above the line** (e.g. "third cousins"). | Double line follows (#85, #92). **Gap:** no degree label above the line. #90 can now name the relationship. |
| Twins: monozygotic with a horizontal bar between the individual's lines, dizygotic without, "?" when unknown. | Follows (#11). |
| No children by choice: one bar under the line of descent. Infertility: two bars. Reason written below. | Follows (#15). |
| Adoption: brackets around the adopted person; dashed line from adoptive parents, solid from biological. | Follows (#12). |
| "Family history not known": "?" above the symbol. | **Gap:** not supported. |

### Assisted reproduction (Fig. 3) and evaluation (Fig. 4)

Donor "D", surrogate "S", evaluation "E" with results, documented evaluation
"*", carrier dot, and a vertical line through the symbol for an asymptomatic
or presymptomatic carrier. PedEdit has the carrier dot. It has none of the
assisted reproduction symbols, no evaluation notation and no presymptomatic
symbol.

The 2022 revision is reported to change how carrier status is shown. We have
not seen the paper, so this is unconfirmed.

### Key and chart

The key must define every fill and symbol used. Clinical pedigrees should also
record the proband or consultand, who recorded it and when, who gave the
history, the reason for referral and the ancestry of both sides.

| Rule | PedEdit |
|---|---|
| Key defines every fill and symbol | Auto legend (#3). |
| Reason for referral, recorder, date, historian, ancestry | Only the chart title (#20). Not otherwise. |

### Publication and masking (2008, pp. 425-426)

The 2008 paper **discourages masking or altering published pedigrees**, and
names using diamonds to hide sex as an example of masking. Birth order, ages
and affected status should be kept. It asks for the minimum information needed
and for consent, rather than alteration.

This bears on collapsing branches and de-identified export (#1, #4). When a
branch is collapsed it must still read correctly: a number inside a symbol
means siblings, and affected people are drawn separately.

## Where we differ on purpose

**Sex, not gender.** The 2022 revision makes the symbol show gender identity,
with sex assigned at birth written below it (AMAB, AFAB, UAAB). PedEdit's
symbols show biological sex, because inheritance, X-linkage and sex-specific
risk depend on it (root `AGENTS.md`, "Biological sex notation"). This is a
deliberate product decision, not an oversight. The 2022 diamond for
"multiple people of unknown or mixed sex" with a number inside matches what we
use for groups.

## Open gaps (November 2026)

1. **Collapsed branch diamond (#1).** The number counts every hidden person,
   including partners who married in and grandchildren, and affected people
   are folded in with an "n affected" note. To follow the standard, the
   diamond should count the couple's children only, and affected children
   should be drawn as their own symbols beside it.
2. **Pedigree number placement (#8).** It should go on its own line below the
   age and evaluation text, not before the name.
3. **Full date of birth on the canvas (#20).** Prefer year of birth or age.
4. **Consanguinity degree label** above the double line when the relationship
   is not obvious from the drawing (#85, #90, #92).
5. **Proband arrow without "P".** Small fix.
6. Not yet built: consultand arrow, presymptomatic carrier, evaluation (E)
   notation, assisted reproduction (D, S), "?" for unknown family history,
   and clinical key fields. (Ended relationship: done in #98.)
