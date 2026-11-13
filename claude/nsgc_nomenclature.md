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
  Paywalled. It keeps the 2008 nomenclature except where it says otherwise;
  its changes are summarised under "The 2022 revision" below.
- Resta RG et al. (2022). Both sides now: changing a long-standing pedigree
  tradition of men on the left and women on the right. J Genet Couns.
  doi:10.1002/jgc4.1662.

We keep no copies of the papers, here or in the private repo,
because they are copyrighted. This file states the rules in our own words so
that nothing depends on them; go back to the sources by DOI when a rule is
unclear.

## Rules, in our words, with where PedEdit stands

Section numbers refer to the 2008 figures. Where the 2022 revision changed a
rule, the rule below says so; see also "The 2022 revision".

PedEdit draws the latest edition by default. Where 2022 changed the drawing,
the 2008 form stays available through the pedigree setting "Notation"
(`canvasSettings.notation`, `pedigree/notation.ts`) for people who still
work in it.

### Symbols (Fig. 1)

| Rule | PedEdit |
|---|---|
| Square, circle, diamond. Diamond for sex not specified. Do not write age inside the symbol. | Follows. Symbols encode biological sex: see "Where we differ" below. |
| Affected: shaded. Two or more conditions: partition the symbol, one fill per condition, defined in the key. | Follows (tags, #3; per-condition affected and carrier, #115): in NSGC 2022 one condition in use fills the whole symbol (solid black in black and white), two take halves, three or four quarters. NSGC 2008 mode keeps quarters. |
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
or presymptomatic carrier. **The 2022 revision drops the "E" and the carrier
dot** (see below); the "*", the vertical line, D and S stay. PedEdit draws
the 2022 divided carrier symbol, or the dot with "Notation: NSGC 2008"
(#115), and has the presymptomatic
line and evaluation results (#101, #114): written under the symbol as
"detail +" (2022), or with the pedigree setting "Notation: NSGC
2008" as "E+ (detail)", numbered E1, E2 when there are several, with the
detail in parentheses standing in for a key entry per number; "*" at the
lower right for a documented one. It has the assisted
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
- 2008: "E" must be defined in the key. Several evaluations take subscripts
  (E1, E2) defined in the key. Results go in parentheses or in the key: "+",
  "-", or "u" for uninformative. 2022: no "E"; results (sequencing, panel,
  karyotype, ultrasound) are simply written under the symbol. PedEdit
  follows 2022 by default, 2008 as a setting (#114).
- Shade a symbol only when the person is clinically symptomatic.
- 2008: carrier status follows how the disease shows, not the inheritance
  pattern: a dot for a carrier unlikely to be affected, a vertical line for
  someone unaffected now who may become so. 2022: **no dot**. A carrier's
  symbol is divided, one fill pattern per carrier result or condition,
  defined in the key (a HEXA and CFTR carrier: two halves, two patterns; an
  ATM carrier with breast cancer: one half each). Reason: carriers can have
  symptoms, a dot hides under a fill, and screening often finds several
  carrier results. The vertical line stays, "typically for dominant
  conditions", with the condition in the key. PedEdit follows this (#115,
  `symbolPaint` in `tags.ts`, `conditions.ts`): a condition (quadrant tag)
  has a per-person state, affected or carrier (`Individual.carrierTags`).
  Affected fills the condition's section in its fill; carrier fills the
  same section hatched in its colour (or, for a patterned condition, the
  same pattern in a lighter tint), keyed "Cystic fibrosis carrier". As
  NSGC partitions the symbol only for several conditions, the number of
  sections follows the number of conditions **in use**, that is someone
  drawn on the chart is affected with or a carrier of them
  (`sectionConditions`): one fills the whole symbol, two take the left and
  right halves (the paper's HEXA and CFTR carrier), three or four the
  quarters, more equal slices. A condition defined but not yet given to
  anyone changes nothing, and people left out of the drawing (a collapsed
  branch, #94) do not count, since NSGC divides what the chart shows; the
  Affected only filter (#4) keeps everyone with a condition, so it never
  changes the count. Sections go to the conditions in use in the order of
  the tags dialog, so each keeps the same section on every symbol and
  position still names it; they move only when a condition comes into or
  goes out of use. NSGC shades the symbol for a single condition, so in
  black and white mode the one condition in use is solid black, keyed with
  its name ("Cystic fibrosis"), not a hatch; in colour it keeps its colour.
  Its carriers are the whole symbol hatched in black (in colour, hatched in
  its colour). The exceptions keep the hatch: a pattern chosen for the tag
  itself, and a chart where someone is affected with no condition recorded
  (their plain black fill would look the same). A carrier with no
  condition recorded (the plain Carrier control) is the right half dotted
  in black, keyed "Carrier": against a single condition's whole-symbol
  carrier fill it differs in size (half against whole) and pattern (dots
  against lines), and against the solid black affected fill in both; it is
  left off when the person's affected conditions cover the right half, as
  the 2008 dot is on a black fill. In 2022 an affected
  person with a recorded condition is that condition's section only (no
  black fill); affected with no condition recorded is the black fill. With
  the setting "Notation: NSGC 2008" the plain carrier keeps the dot, an
  affected person with condition tags the black fill with a black centre,
  and conditions keep the fixed quarters of #3 whatever their number, so
  pedigrees drawn before this change look the same; a carrier of a named
  condition is drawn as its patterned section in both, since a dot cannot
  name a condition. Pedigrees saved before #115 have no
  notation setting and are drawn as 2008; new pedigrees, PED imports and
  the built-in examples are 2022.
- Linkage haplotypes go below the person with the haplotype of interest on
  the left; repeat sizes are written affected allele first in parentheses;
  a known variant goes in parentheses. PedEdit has no fields for these; the
  evaluation detail text (#101) carries them.



### Key and chart

The key must define every fill and symbol used. Clinical pedigrees should also
record the proband or consultand, who recorded it and when, who gave the
history, the reason for referral and the ancestry of both sides.

| Rule | PedEdit |
|---|---|
| Key defines every fill and symbol | Auto legend (#3). |
| Reason for referral, recorder, date, historian, ancestry | Follows (#102): pedigree-level fields, listed in the legend and the export key, dropped by de-identified export. The proband is marked on the chart, not in these fields. |

**Fills other than solid shading (#67).** NSGC asks only that every fill be
defined in the key and names the kinds: shading, "hatches, dots, etc." (1995,
kept in 2008). The 2022 revision's carrier example divides the symbol and
fills each part with a different line pattern (horizontal lines in one half,
vertical in the other), so patterns, not only colour, are expected to tell
conditions apart. Other tools: kinship2's `plot.pedigree` fills the first
affection column solid and further columns with line hatching at different
angles; Madeline 2.0 prints a single condition in black and white and several
in colour, and offers sixteen quadrant shading patterns instead of colours;
pedigreejs and Schematex use coloured pie slices or quadrants with a key.
Journals that print in black and white need the pattern form.

PedEdit: each quadrant tag can be solid, diagonal hatch, horizontal lines,
vertical lines, cross-hatch, dots, or a light shade, drawn in the tag's
colour on white (`Tag.fill`), and the pedigree setting "Tag fills: black and
white patterns" (`canvasSettings.tagFills`) draws every tag in black with a
pattern each, on the canvas and in exports. To keep them apart from marks
with a meaning of their own, the textures are fine (lines 4px apart on a
40px symbol): a single vertical line is the presymptomatic carrier, a single
centre dot the 2008 carrier, and the "\" slash deceased, so the diagonal
hatch runs "/". The carrier dot and presymptomatic line keep their white rim
over any fill.

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

## The 2022 revision

Bennett et al. 2022 (doi:10.1002/jgc4.1621), a "focused revision": the 2008
recommendations stand except as below. No new symbols.

- **The symbol shows gender, not sex.** Square for a man or boy, circle for
  a woman or girl, diamond for non-binary or gender diverse. Sex assigned
  at birth is written under the symbol as AMAB, AFAB or UAAB, and left out
  when it matches the gender shown (a square with no code is a cis man).
  A diamond with no code: sex or gender unknown or not stated. Gender is
  established by asking the proband or consultand.
- **Where the code goes is not consistent in the figures.** The sex and
  gender table puts it directly under the symbol, above the age; the
  symbols table puts it under the age or "d." line (deceased, stillbirth,
  consultand). PedEdit's placement, after the age lines, matches the
  second.
- For children who have not yet expressed a gender, pregnancies,
  stillbirths, and relatives, sex and gender are assumed to match unless
  known otherwise. PedEdit draws pregnancies and losses by sex.
- Do not use a circle inside a square or a square inside a circle (the NCCN
  scheme), or an inverted triangle, for gender diverse people.
- Variations in sex characteristics (VSC, intersex): the symbol for the
  person's gender, with shading defined in the key and a note under it
  (VSC, karyotype if known, or the condition). Karyotype only if known;
  never assume it from sex at birth.
- Grouped symbols follow gender: a numbered diamond for non-binary people
  carries their code(s) under it ("AMAB/AFAB"); a numbered diamond with no
  code is a group of unknown or mixed sex and gender.
- **No "E".** Results go under the symbol without it. PedEdit: default,
  with the 2008 form as a setting (#114). The order under
  the symbol stays age, then results, then pedigree number (numbers
  "typically used in research or publication").
- **No carrier dot**; divided symbol with fills instead (see Fig. 4 above,
  #115). The presymptomatic vertical line and the documented "*" stay.
- The relationship line stays solid. The task force considered a dotted
  line to match non-biological lines and decided against it.
- Proband: always affected, arrow with "P". Consultand: arrow without "P",
  shaded if affected.
- Twins: with no "?" and no bar, a twin set is dizygotic. Triplets drawn
  the same way.
- Adoption by a relative: brackets, solid lines from the biological parents,
  a dashed line from the relative who adopted.
- Pregnancy with a known fetal sex: square or circle with "P" inside, and
  how the sex was found ("female by US", or a karyotype). Gestational age
  under every pregnancy, miscarriage and termination.
- Ancestry: of both sets of grandparents, when clinically relevant.
- Assisted reproduction (Fig. 5): symbols unchanged; the gestational
  carrier's line is solid even when she is not the genetic mother (as in
  2008). New worked examples:
  - two women, one carrying a pregnancy from a sperm donor;
  - an unpartnered woman with a son and a pregnancy by the same donor (the
    donor and she share a sibship line, no relationship line);
  - a trans man (square, AFAB) carrying a pregnancy from a sperm donor; a
    non-binary person (diamond, AFAB) likewise, partnered with a trans woman;
  - a donated embryo (egg donor and sperm donor), carried by the female
    partner: lines from both donors and from her, none from the male partner;
  - a surrogate carrying for a trans man and cis man couple;
  - a sister of a trans woman as egg donor and carrier for her and her
    partner;
  - "double gamete donor": a female couple, one partner's egg with donor
    sperm, the other partner carrying (her vertical line to the pregnancy,
    lines from the egg donor partner and the sperm donor).
  The 2008 "planned adoption" scenario is not repeated.
- Same-sex relationships were already recorded in 2008; the 2022 figures
  draw same-sex and trans couples as ordinary couples. Follows (#105): a
  same-sex couple is an ordinary partnership with a couple line; their
  child is one partner's and a donor's (the #45 donor pair), the other
  partner a social parent linked by the couple line only, as example 1b
  draws it (the "Assisted reproduction" example has one). Trans couples
  need nothing: partners are paired by sex and drawn by gender (#26).
- Frozen embryos: still no symbol (chart notes suffice for now).
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
under the name (after age and onset, before the pedigree number), which
matches some of the 2022 figures but not the sex and gender table, and a
person with no gender identity recorded draws by sex with no annotation. In "biological
sex" mode nothing on the chart shows that a gender identity is recorded. The 2022 diamond for
"multiple people of unknown or mixed sex" with a number inside matches what we
use for groups.

## Open gaps (November 2026)

The 2008 gaps found in November 2026 (#1, #8, #20, #97, #99, #100, #101,
#102, #45 and #98) are done, as are same-sex couples (#105). Still open:

1. Remaining assisted reproduction cases from Fig. 3 (#108).
2. Fields NSGC uses that PedEdit lacks: gestational age, karyotype, proven
   zygosity, adoption by a relative, "n" groups (#112).
3. 2022: carriers as a divided fill rather than a dot (#115) and results
   without "E" (#114) are done. The other 2022 questions are answered above (#110).
4. What de-identified export should drop, given the masking guidance (#111).
