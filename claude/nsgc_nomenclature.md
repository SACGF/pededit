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
| **Several people as one symbol:** the number of siblings is written inside the symbol, "n" when unknown. **Affected people are not grouped.** | Follows, for collapsed branches (#1): a collapsed couple's unaffected children are one symbol with their number inside (square or circle when they share a sex, diamond otherwise), and affected or condition-tagged children are drawn as themselves beside it. |
| Deceased: a slash through the symbol, extending past it. Do not use a cross. Cause of death below if known. | Follows. |
| Proband: arrow with "P" at the lower left. Consultand: arrow without "P". | Follows (#99): `Individual.consultand`; a proband who is also the consultand keeps the "P". |
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
| Age / year of birth first | Follows (#20): the free-text age, else the year of birth ("b. 1978"). The full DOB stays in the data, the edit panel and CSV. There is no date of death field, so "d. 2007" comes from the free-text age. |
| Pedigree number last, below the other text | Follows (#8): its own line, last (`detailSections` in `pedigree/labels.ts`). The name goes above the age line. |
| Age at onset is pedigree information for risk assessment (2008, p. 431) | #93 records it. The standard gives no exact wording; "dx" is common practice. |

### Lines (Fig. 2)

| Rule | PedEdit |
|---|---|
| Relationship, line of descent, sibship and individual's lines as defined. | Follows. |
| Siblings left to right in birth order, oldest first. | Sibling order setting. |
| Male partner on the left "if possible" (2008). Dropped as a rule in 2022 ("Both sides now"). | No rule enforced, which matches 2022. |
| A break (two slashes) in the relationship line means the relationship has ended. | Follows (#98): `Partnership.ended`. |
| Consanguinity: double relationship line. **If the degree of relationship is not obvious from the pedigree, write it above the line** (e.g. "third cousins"). | Follows: double line (#85, #92), text above it (#97), set per couple or named automatically with a setting. |
| Twins: monozygotic with a horizontal bar between the individual's lines, dizygotic without, "?" when unknown. | Follows (#11). |
| No children by choice: one bar under the line of descent. Infertility: two bars. Reason written below. | Follows (#15). |
| Adoption: brackets around the adopted person; dashed line from adoptive parents, solid from biological. | Follows (#12). |
| "Family history not known": "?" above the symbol. | Follows (#100): `Individual.familyHistoryUnknown`. |

### Assisted reproduction (Fig. 3) and evaluation (Fig. 4)

Donor "D", surrogate "S", evaluation "E" with results, documented evaluation
"*", carrier dot, and a vertical line through the symbol for an asymptomatic
or presymptomatic carrier. PedEdit has the carrier dot, the presymptomatic
line and the evaluation notation (#101): per-person evaluations written
under the symbol as "E+ (detail)", numbered E1, E2 when there are several,
with the detail in parentheses standing in for a key entry per number, and
"*" at the lower right for a documented one. It has none of the assisted
reproduction symbols.

The 2022 revision is reported to change how carrier status is shown. We have
not seen the paper, so this is unconfirmed.

### Key and chart

The key must define every fill and symbol used. Clinical pedigrees should also
record the proband or consultand, who recorded it and when, who gave the
history, the reason for referral and the ancestry of both sides.

| Rule | PedEdit |
|---|---|
| Key defines every fill and symbol | Auto legend (#3). |
| Reason for referral, recorder, date, historian, ancestry | Follows (#102): pedigree-level fields, listed in the legend and the export key, dropped by de-identified export. The proband is marked on the chart, not in these fields. |

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

1. **Collapsed branch symbol (#1).** Fixed: the number counts the couple's
   unaffected children only, and affected children are drawn beside it.
2. **Pedigree number placement (#8).** Fixed: its own line, last.
3. **Full date of birth on the canvas (#20).** Fixed: year of birth.
4. **Consanguinity degree label** above the double line. Fixed (#97).
5. **Proband arrow without "P".** Fixed, with a consultand arrow (#99).
6. Not yet built: assisted reproduction (D, S). Presymptomatic carrier and
   evaluation (E) notation: done (#101). "?" for unknown family history: done (#100).
   Ended relationship: done (#98). Clinical key fields: done (#102).
