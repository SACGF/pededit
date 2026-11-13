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
  Paywalled. What we know of it comes from Bennett's December 2022 teaching
  slides, summarised under "The 2022 revision, from the slides" below.
- Resta RG et al. (2022). Both sides now: changing a long-standing pedigree
  tradition of men on the left and women on the right. J Genet Couns.
  doi:10.1002/jgc4.1662.

We keep no copies of the papers or slides, here or in the private repo,
because they are copyrighted. This file states the rules in our own words so
that nothing depends on them; go back to the sources by DOI when a rule is
unclear.

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
| Under a pregnancy or stillbirth: gestational age and karyotype if known (e.g. "20 wk", "47,XY,+21"), or the date of the last menstrual period ("LMP: ..."). Under a miscarriage: gestational age and sex if known. Only the abbreviation TOP, never TAB or VTOP. Affected losses are shaded and defined in the key; an affected pregnancy may use light shading. | Partly: no gestational age or karyotype field; the free-text age (#20) can carry it. |
| A pregnancy not carried to term is told apart by its triangle, so it no longer gets a shorter individual's line (2008 change). | Follows. |
| Karyotype written below the symbol when known; for a difference of sex development the symbol shows the phenotypic sex (2008). | No karyotype field. |
| "n" inside the symbol when the number of siblings is unknown. | Not used: group symbols only come from collapsing or filtering, where the count is always known. |

### Text below the symbol (Fig. 1 instructions)

Below the symbol, or to its lower right, in this order:

1. age, or year of birth / death ("b. 1978", "d. 2007", "30y", "4 mo", "d. 60's");
2. evaluation and test results (Fig. 4);
3. pedigree number (I-1, II-3).

Privacy: prefer birth year or age, and year or age at death, over full dates.
Use initials or first names rather than full names on clinical pedigrees.

| Rule | PedEdit |
|---|---|
| Age / year of birth first | Follows (#20, #103): the free-text age, else the age at death ("d. 72y") when both full dates are known, else the year of birth and year of death ("b. 1935", "d. 2007", two lines). The full dates stay in the data, the edit panel and CSV. "Deceased" alone means date unknown. |
| Pedigree number last, below the other text | Follows (#8): its own line, last (`detailSections` in `pedigree/labels.ts`). The name goes above the age line. |
| Age at onset is pedigree information for risk assessment (2008, p. 431) | #93 records it. The standard gives no exact wording; "dx" is common practice. |

### Lines (Fig. 2)

| Rule | PedEdit |
|---|---|
| Relationship, line of descent, sibship and individual's lines as defined. | Follows. |
| Line names: relationship line (between partners), line of descent (from the relationship line down), sibship line (horizontal, joining siblings), individual's line (short vertical above each sibling). | Same terms used in code and docs. |
| Siblings left to right in birth order, oldest first. | Sibling order setting. |
| Previous partners need not be shown if they do not affect the genetic assessment. | Up to the user. |
| Male partner on the left "if possible" (2008). Dropped as a rule in 2022 ("Both sides now"). | No rule enforced, which matches 2022. |
| A break (two slashes) in the relationship line means the relationship has ended. | Follows (#98): `Partnership.ended`. |
| Consanguinity: double relationship line. **If the degree of relationship is not obvious from the pedigree, write it above the line** (e.g. "third cousins"). | Follows: double line (#85, #92), text above it (#97), set per couple or named automatically with a setting. |
| Twins: monozygotic with a horizontal bar between the individual's lines (not between the symbols), dizygotic without, "?" when unknown. Triplets and more share the fork the same way. An asterisk marks zygosity that has been proven. | Follows (#11), except the "proven" asterisk, which has no field. |
| No children by choice: one bar under the line of descent. Infertility: two bars. Reason written below. | Follows (#15). |
| Adoption: brackets around every adopted person; dashed line from adoptive parents, solid from biological. Three cases are drawn: adopted in, adopted out, and adopted by a relative. | Follows (#12) for in and out. "By a relative" is not a separate option. |
| "Family history not known": "?" above the symbol. | Follows (#100): `Individual.familyHistoryUnknown`. |

### Assisted reproduction (Fig. 3) and evaluation (Fig. 4)

Donor "D", surrogate "S", evaluation "E" with results, documented evaluation
"*", carrier dot, and a vertical line through the symbol for an asymptomatic
or presymptomatic carrier. PedEdit has the carrier dot, the presymptomatic
line and the evaluation notation (#101): per-person evaluations written
under the symbol as "E+ (detail)", numbered E1, E2 when there are several,
with the detail in parentheses standing in for a key entry per number, and
"*" at the lower right for a documented one. It has the assisted
reproduction symbols (#45):

| Rule (Fig. 3) | PedEdit |
|---|---|
| "D" inside the donor's symbol, "S" inside the surrogate's | Follows: `Individual.reproductiveRole`. |
| No relationship line between the woman carrying the pregnancy and a sperm donor; the donor's line of descent runs to the child | Follows: the donor and the other genetic parent are a `donorConception` partnership, drawn with no couple line and a line from each to the child. |
| The woman carrying the pregnancy has a solid line to it even when not the genetic mother | Follows: `Individual.carriedBy`. When she is the partner of the genetic father (scenario 2), the child hangs from that couple and their line of descent is the solid line; the egg donor gets her own line. |
| The intended parent who is not genetic is joined only by the couple line (scenarios 1 and 4: no line from the husband, or the wife, to the pregnancy) | Follows: a social parent whose partner has a biological line to the child gets no line of their own. |
| Dashed line of descent for a non-biological parent (scenario 5) | Partly: `Individual.socialParents` with no such partner get a dashed line each, from their own symbols rather than one from the couple line, and there are no brackets (adoption makes the child a founder for kinship, #12). Kinship and PED use the genetic parents. |
| A woman who is both egg donor and carrier is shown only as the donor | Follows: no carrier line is drawn to a genetic parent. |
| The pregnancy sits below the woman carrying it, the lines meeting at its top | Follows for an only child: below the mother or donor carrying it (scenarios 1, 4), below the couple when she is half of it (2), below a surrogate (3), as far as the neighbours in its row allow (`shiftUnderCarrier` in `alignPedigree`). A donor pair's lines run straight to its top; a couple's line of descent keeps its elbow (scenario 3 draws it diagonally, which would cross the wife's name). Siblings keep the sibship bar. |
| Person order: H, W, D (1, 2) | Differs: kinship2 puts the donor beside the parent who shares the donor pair (D, W, H in 1; W, H, D in 2). A man whose partner and egg donor are sisters (4b) is drawn twice, as kinship2 does for anyone with partners on both sides of a sibship. |

Further Fig. 3 and Fig. 4 points:

- Record what family history is known for a donor or gestational carrier.
- The 2008 paper notes the nomenclature has no way to show frozen or
  transferred embryos; "E" could track embryo testing.
- "E" must be defined in the key. Several evaluations take subscripts (E1,
  E2) defined in the key. Results go in parentheses or in the key: "+",
  "-", or "u" for uninformative.
- Shade a symbol only when the person is clinically symptomatic.
- Carrier status follows how the disease shows, not the inheritance pattern:
  a dot for a carrier unlikely to be affected (whatever the mode of
  inheritance), a vertical line for someone unaffected now who may become so.
  Half shading for recessive carriers is a common habit the standard does not
  endorse. PedEdit follows this.
- Linkage haplotypes go below the person with the haplotype of interest on
  the left; repeat sizes are written affected allele first in parentheses;
  a known variant goes in parentheses. PedEdit has no fields for these; the
  evaluation detail text (#101) carries them.

The 2022 revision is reported to change how carrier status is shown. The
slides do not cover it, so this is unconfirmed.

### Key and chart

The key must define every fill and symbol used. Clinical pedigrees should also
record the proband or consultand, who recorded it and when, who gave the
history, the reason for referral and the ancestry of both sides.

| Rule | PedEdit |
|---|---|
| Key defines every fill and symbol | Auto legend (#3). |
| Reason for referral, recorder, date, historian, ancestry | Follows (#102): pedigree-level fields, listed in the legend and the export key, dropped by de-identified export. The proband is marked on the chart, not in these fields. |

### Publication and masking (2008, pp. 425-426)

The 2008 paper **discourages masking or altering published pedigrees**.
Masking is a visible change, such as diamonds used to hide sex; altering is
an invisible one, such as changed birth order or sex. Birth order, ages
and affected status should be kept, since altering them can hide anticipation,
parent of origin effects, sex-linked expression or consanguinity effects.
A published pedigree should not tell a relative a test result they did not
already know. It asks for the minimum information needed
and for consent, rather than alteration.

This bears on collapsing branches and de-identified export (#1, #4). When a
branch is collapsed it must still read correctly: a number inside a symbol
means siblings, and affected people are drawn separately.
The "affected only" view filter (#4) follows the same rule: it removes no one
from the chart, it groups each drawn couple's unaffected children into one
numbered symbol, and it keeps every ancestor so lines of descent stay whole.

## The 2022 revision, from the slides

From Bennett's teaching slides (December 2022), which reproduce the revision's
figures. Not checked against the paper itself.

- **Gender first.** The symbol shows self-identified gender: square for a man
  or boy, circle for a woman or girl, diamond for non-binary or gender
  diverse. Sex assigned at birth is written as AMAB, AFAB or UAAB **directly
  under the symbol, above the age**, and left out when it matches the
  gender shown (a cis man is a square with only his age under it).
  Karyotype only if known.
- **Diamond** with a code under it: non-binary. Diamond with no code: sex
  or gender unknown or not relevant. Diamond with a number and no code:
  several people of unknown or mixed sex and gender. A grouped diamond for
  non-binary people carries their code(s) under it (e.g. "AMAB/AFAB").
- Deceased and grouped symbols follow the same scheme ("d. 1981", "d. 4 mo"
  under the symbol, the code under that).
- **Same-sex couples** are drawn as ordinary couples. Examples: two women,
  one carrying a pregnancy from a sperm donor; two men with an egg donor
  and a surrogate; a trans man (square, AFAB) carrying a pregnancy, with a
  line from his symbol to it.
- **Donor embryo** (adoption in vitro): the pregnancy in brackets with a
  dashed line from the couple, since neither is a genetic parent.
- In the slides' surrogate and egg donor examples the line from a
  gestational carrier who is not the genetic mother is **dashed**. The 2008
  Fig. 3 draws it solid (biological effect on the fetus, e.g. teratogens).
  Unconfirmed until we read the paper; PedEdit draws it solid.
- Partners are no longer placed man left, woman right (Resta et al. 2022).

## Where we differ on purpose

**Sex is the data, gender is a drawing choice (#26).** The 2022 revision
makes the symbol show gender identity, with sex assigned at birth written
below it (AMAB, AFAB, UAAB). PedEdit stores biological sex on every person
and uses it for layout, kinship, X-linked kinship, twins and PED export,
because inheritance depends on it (root `AGENTS.md`, "Biological sex
notation"). Gender identity is optional and only changes the drawing: with
the pedigree setting "Symbols show: gender identity where recorded" (the
default) such a person gets the 2022 symbol for their gender and the AMAB /
AFAB / UAAB line under it, as the 2022 figure does; "biological sex" draws
everyone by sex. Where we still differ: the code goes in the text block
under the name (after age and onset, before the pedigree number) rather
than directly under the symbol and above the age, and a person with no
gender identity recorded draws by sex with no annotation. In "biological
sex" mode nothing on the chart shows that a gender identity is recorded. The 2022 diamond for
"multiple people of unknown or mixed sex" with a number inside matches what we
use for groups.

## Open gaps (November 2026)

The 2008 gaps found in November 2026 (#1, #8, #20, #97, #99, #100, #101,
#102, #45 and #98) are done. Still open:

1. Remaining assisted reproduction cases from Fig. 3 (#108).
2. Fields NSGC uses that PedEdit lacks: gestational age, karyotype, proven
   zygosity, adoption by a relative, "n" groups (#112).
3. Same-sex couples, which the 2022 figures draw (#105).
4. Points to check against the 2022 paper: where the AMAB / AFAB / UAAB
   code goes, the gestational carrier's line, carrier status (#110).
5. What de-identified export should drop, given the masking guidance (#111).
