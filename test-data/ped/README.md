# PED Test Files

Test corpus for the PED file import/export feature (`frontend/src/io/ped/`).
Each file exercises specific parser, validator, or converter behaviour.

Columns in standard PED format: `FID IID PAT MAT SEX PHENO`
- `PAT`/`MAT`: parent IID, or `0` for unknown/founder
- `SEX`: 1=male, 2=female, 0=unknown
- `PHENO`: 1=unaffected, 2=affected, 0=missing, -9=missing

---

## Attribution

### `large/kinship2_sample.ped`
Exported from the **kinship2** R package `sample.ped` dataset.
- Package: kinship2 ≥ 1.9.6, Mayo Clinic, GPL-2+
- Source: https://github.com/mayoverse/kinship2
- Note: Two families (FID=1 and FID=2), 54 individuals total. Family 1 has 41
  individuals across 4 generations with consanguinity (individuals 103 and 138
  are siblings, both children of 135+136). Family 2 has 14 individuals. This is
  the standard reference pedigree for testing pedigree layout algorithms.
- Conversion: R `affected` column (0/1/NA) mapped to PHENO (1/2/0) per standard
  PED spec.

### `historic/habsburg.ped`
Reconstructed by hand from **Figure 1** of Alvarez G, Ceballos FC, Quinteiro C (2009).
The Role of Inbreeding in the Extinction of a European Royal Dynasty. PLoS ONE 4(4):
e5174. doi:10.1371/journal.pone.0005174 (CC BY).
- 33 individuals, 9 generation rows: the 31 people in the figure plus two parents the
  chain-of-descent figure omits (Albert V of Bavaria, Maria Anna of Bavaria) so that
  every non-founder has both parents.
- Exercises: nested uncle-niece (Philip II + Anna of Austria, Philip IV + Mariana),
  double first cousin (Philip II + Mary of Portugal), first cousin and first cousin
  once removed marriages; couples that span generations (Philip II and Philip IV
  are each drawn twice, once beside each wife's row).
- Inbreeding of Charles II on this partial pedigree is F = 0.217 (kinship2); the
  paper reports 0.254 on its full 16-generation tree of 3,000+ individuals.

### `historic/queen_victoria.ped`
Haemophilia B among Queen Victoria's descendants. Primary source: Rogaev EI et al.
(2009). Genotype Analysis Identifies the Cause of the "Royal Disease". Science
326(5954): 817. doi:10.1126/science.1180660, Figure S1. The supplement is behind
the publisher's paywall; the structure and affection status here were cross-checked
against the main-text Figure 1 and the Wikipedia article "Haemophilia in European
royalty", which follows Stevens RF (1999) Br J Haematol 105: 25, Rogaev's reference 1.
- 49 individuals, 4 generations. Victoria's nine children, the Hesse, Albany and
  Battenberg lines with their Prussian, Russian, Teck and Spanish descendants, and
  Henry of Prussia (son of Victoria, Princess Royal), whose marriage to his first
  cousin Irene of Hesse closes a loop.
- PHENO 2 = haemophiliac (9). PHENO 0 for Maurice of Battenberg (disputed) and
  Maurice of Teck (died in infancy). Obligate carriers are unaffected in PED;
  the in-app example carries the carrier flags.
- Exercises: wide sibships (9 and 7), many married-in founders, a consanguineous
  loop, X-linked pattern.

### `historic/tutankhamun.ped`
Hawass Z et al. (2010). Ancestry and Pathology in King Tutankhamun's Family. JAMA
303(7): 638. doi:10.1001/jama.2010.121, Figure 2.
- 10 individuals, 5 generations. KV55 (most probably Akhenaten) and KV35YL are full
  siblings, both children of Amenhotep III and Tiye, and the parents of Tutankhamun.
  KV21A as mother of the two KV62 fetuses is the paper's tentative assignment.
- PHENO is missing (0) except Tutankhamun, affected (2): the paper reports Köhler
  disease II and clubfoot. Mainly a full-sib consanguinity example.

### `fiction/targaryen.ped`
House Targaryen from George R. R. Martin's A Song of Ice and Fire, as set out in Fire &
Blood (2018) and The World of Ice and Fire (2014), cross-checked against Wikidata
(members of House Targaryen, P53, with their father P22 and mother P25). Wikidata is
missing several links (the parents of Viserys I and Daemon, the line from Aegon III
to Aerys II) and gives Harwin Strong as Jacaerys's father, so it was not used as is.
- 96 individuals, 16 generations, Aerion and Valaena to Daenerys and Jon Snow.
- Bloodline only: married-in spouses are founders, childless marriages (Maegor's six
  wives, Baelor I and Daena) are left out. Children are listed under their officially
  recorded father. Jon Snow's parents are Rhaegar and Lyanna, as confirmed in the TV series.
- PHENO 2 = the "Targaryen madness" (Aerys II, Aerion Brightflame), for fun.
- Exercises: brother-sister, uncle-niece, first cousin and cousin-once-removed marriages,
  people drawn twice (Daemon, Viserys I, Rhaenyra), a 17-wide row (Jaehaerys I and
  Alysanne's 13 children), and a married-in spouse inside a sibship's span, which
  caught an overlap in the post-QP centering pass. kinship2 gives Daenerys F = 0.375.

### `fiction/buendia.ped`
The Buendía family of Macondo, Gabriel García Márquez, One Hundred Years of Solitude
(1967).
- 30 individuals, 9 generation rows: seven generations of Buendías plus two of founders.
- The novel says José Arcadio Buendía and Úrsula Iguarán are cousins, and that her aunt
  and his uncle had a son with a pig's tail, without giving the links. The unnamed
  grandparents and parents are our scaffold: two Buendía brothers marry two Iguarán
  sisters, and Úrsula's father is their brother. The header says so.
- PHENO 2 = born with a pig's tail: that cousin, and the last Aureliano, son of
  Amaranta Úrsula and her nephew Aureliano Babilonia (F = 0.125 in kinship2).
- Exercises: first cousin and aunt-nephew marriages, a woman with children by two
  brothers (Pilar Ternera), people drawn twice.

### `fiction/atreides.ped`
House Atreides, Frank Herbert, Dune (1965), Dune Messiah (1969), Children of Dune (1976).
- 33 individuals, 5 generation rows. Atreides, Harkonnen, Kynes and Corrino lines.
- A few names the novels do not give are from the Brian Herbert and Kevin J. Anderson
  prequels (Helena Richese, Dmitri Harkonnen, Emmi Rabban, Mohiam as Jessica's mother,
  Anirul); parents named in neither are unnamed founders.
- Ghanima and Farad'n's descendants are one unknown-sex node. Without it the Corrinos
  would be a separate component (component ordering is #39) joined only by Paul and
  Irulan's childless marriage, which PED cannot express.
- PHENO 2 = Kwisatz Haderach (Paul, Leto II). The in-app example tags the four Bene
  Gesserit (Mohiam, Jessica, Anirul, Irulan) with a "BG" text tag.

### Jicaque pedigree (not included)
Chapman AM, Jacquard A (1971), Un isolat d'Amérique Centrale: les Indiens Jicaques
du Honduras, is a French book chapter that is not available online, and the only
reproductions found are datasets inside GPL-licensed R packages (ribd, 22
individuals; GENLIB, a "modified" 29-individual version). Since the structure could
not be verified against a readable primary source without copying from those
packages, it is left out.

### All other files
Hand-authored for this test suite. No external attribution required.

---

## File inventory

### `simple/` — Basic structures, clean input

| File | Individuals | Families | Description |
|------|-------------|----------|-------------|
| `nuclear_family.ped` | 4 | 1 | Father + Mother + Son (affected) + Daughter |
| `three_generation.ped` | 10 | 1 | Two sets of grandparents (1+2 and 3+4), one parental couple (5+6), four children (7–10, two affected). Standard 3-gen non-consanguineous pedigree. |
| `single_individual.ped` | 1 | 1 | Single founder, unknown sex, missing phenotype |
| `founders_only.ped` | 5 | 1 | Five founders, no parent links |
| `unknown_sex.ped` | 5 | 1 | Mix of SEX=0, SEX=1, SEX=2 |

### `consanguineous/` — Related individuals who form partnerships

| File | Individuals | Families | Description |
|------|-------------|----------|-------------|
| `sibling_mating.ped` | 5 | 1 | Full siblings (3+4) have an affected child (5). Most direct consanguinity. |
| `first_cousin.ped` | 9 | 1 | Grandparents (1+2) have son (3) and daughter (4). Son (3) + unrelated woman (5) → son (7). Unrelated man (6) + daughter (4) → daughter (8). First cousins (7+8) → affected son (9). |
| `double_first_cousin.ped` | 11 | 1 | Two pairs of founders (1+2 and 3+4) each have one son and one daughter. The sons marry the other family's daughters: son (5) + daughter (8) → son (9); son (7) + daughter (6) → daughter (10). Double first cousins (9+10) → affected son (11). |
| `uncle_niece.ped` | 7 | 1 | Grandparents (1+2) have son-uncle (3) and daughter (4). Unrelated man (5) + daughter (4) → niece (6). Uncle (3) + niece (6) → affected son (7). |
| `half_sibling_mating.ped` | 6 | 1 | Individual (1) has children (4) with partner (2) and children (5) with different partner (3). Half-siblings (4+5) have an affected child (6). |

### `historic/`: published pedigrees, reconstructed from primary sources

Attribution for each file is in the section above. IIDs are names, not numbers.
Each has a kinship2 oracle in `layout-engine/tests/oracle/` (see
`layout-engine/scripts/kinship2-oracle.R`) compared by
`frontend/src/io/__tests__/kinship2Oracle.test.ts`.

| File | Individuals | Families | Description |
|------|-------------|----------|-------------|
| `habsburg.ped` | 33 | 1 | Spanish Habsburgs from Ferdinand and Isabella to Charles II (Alvarez et al. 2009, Fig. 1). Nested uncle-niece, double first cousin and first cousin marriages; nine generation rows. |
| `queen_victoria.ped` | 49 | 1 | Haemophilia B in Queen Victoria's descendants (Rogaev et al. 2009). Four generations, wide sibships, nine affected males, one cousin marriage. |
| `tutankhamun.ped` | 10 | 1 | Tutankhamun's family (Hawass et al. 2010, Fig. 2). Brother-sister parents, five generations. |

### `fiction/`: fictional pedigrees

Has a kinship2 oracle like `historic/`.

| File | Individuals | Families | Description |
|------|-------------|----------|-------------|
| `targaryen.ped` | 96 | 1 | House Targaryen, 16 generations of sibling, uncle-niece and cousin marriages. |
| `buendia.ped` | 30 | 1 | The Buendías, One Hundred Years of Solitude. Cousin and aunt-nephew marriages, two children with a pig's tail. |
| `atreides.ped` | 33 | 1 | House Atreides, Dune. Jessica is Baron Harkonnen's daughter; one unknown-sex node for Ghanima's descendants. |

### `classic/`: textbook relationships with known kinship coefficients

Hand-authored. The pair (or child) the relationship is named for has PHENO 2 so it
stands out when drawn. Each has a kinship2 oracle like `historic/`. Kinship
coefficients are for issue #32.

| File | Individuals | Families | Description |
|------|-------------|----------|-------------|
| `three_quarter_siblings.ped` | 7 | 1 | A and B share a mother; their fathers are brothers. Kinship 3/16. Mother has two partners. |
| `five_eighths_siblings.ped` | 8 | 1 | A and B share a mother; their fathers are paternal half brothers. Kinship 5/32. Two people with two partners each. |
| `full_sib_mating.ped` | 5 | 1 | Brother and sister have a child. F(C) = 1/4. |
| `half_sib_triangle.ped` | 10 | 1 | Four founders in a row, every adjacent pair with a child, then every adjacent pair of half siblings with a child, down to one person. Every parent pair are half siblings. |
| `double_first_cousins.ped` | 10 | 1 | Brother and sister from family A marry sister and brother from family B. Kinship(X, Y) = 1/8. |
| `double_second_cousins_a.ped` | 18 | 1 | Fathers are first cousins through one lineage, mothers first cousins through another. Kinship 1/32. |
| `double_second_cousins_b.ped` | 14 | 1 | Fathers are double first cousins, mothers unrelated. Kinship 1/32, different identity coefficients from variant A. |
| `quad_half_first_cousins.ped` | 10 | 1 | Two men and two women with four children in a cycle of partnerships; each parent of X is a half sibling of each parent of Y. Kinship 1/8. Every founder has two partners, so the top row needs duplicates. |
| `grandparent_grandchild_partner.ped` | 8 | 1 | A grandfather has a child with his grandson's partner. One couple spans two generations. |
| `two_lineages_joined_twice.ped` | 14 | 1 | Two founder families linked by a marriage in one generation and another a generation later. c1 and c2 are double first cousins once removed. |

### `large/` — Multi-individual, multi-family files

| File | Individuals | Families | Description |
|------|-------------|----------|-------------|
| `kinship2_sample.ped` | 54 | 2 | Standard kinship2 reference pedigree. See attribution above. |
| `multi_family.ped` | 25 | 3 | Three unrelated families in one file (FAM1, FAM2, FAM3). Tests multi-FID import. |

### `edge_cases/` — Valid but unusual input

| File | Individuals | Expected issues |
|------|-------------|-----------------|
| `phantom_parents.ped` | 2 (+ 2 phantom) | `PHANTOM_PARENT` warnings for IID=1 and IID=2 |
| `single_parent.ped` | 4 | `SINGLE_PARENT` warnings for IID=3 (father only) and IID=4 (mother only) |
| `half_siblings.ped` | 7 | Clean. Two children (4,6) by mother (2) and two (5,7) by mother (3), all with same father (1). |
| `multiple_partnerships.ped` | 7 | Clean. Individual (1) has children with both (2) and (3). |
| `sex_mismatch.ped` | 3 | `SEX_MISMATCH` warning: PAT IID=1 has SEX=2 (female) |
| `extra_columns.ped` | 4 | `EXTRA_COLUMNS_IGNORED` info: 10 genotype columns silently dropped |
| `header_line.ped` | 4 | Clean. `#FID IID PAT MAT SEX PHENO` header skipped. |
| `comment_lines.ped` | 4 | Clean. `#`-comment lines skipped. |
| `zero_iid.ped` | 3 | `ZERO_IID` warning: IID=0 is valid but confusing (normally means "missing" for parents) |
| `windows_crlf.ped` | 3 | Clean. CRLF line endings normalised. |
| `bom.ped` | 3 | Clean. UTF-8 BOM stripped. |
| `mixed_whitespace.ped` | 3 | Clean. Spaces and tabs both work as delimiters. |
| `non_numeric_sex.ped` | 4 | Clean. M/F/U (and male/female/unknown, any case) read as male, female, unknown with no warning. |
| `leading_trailing_spaces.ped` | 3 | Clean. Trimmed before splitting. |

### `variants/` — The 4/5-column `id fid mid sex [aff]` dialect

Produced by R pedigree packages (pedtools `as.data.frame(ped)`, kinship2 data frames)
and by hand. Differences from the 6-column PLINK layout: a header line naming the
columns, no family ID column (or an optional leading `famid`), no phenotype column
(or an optional trailing `aff`), tab separation with spaces allowed inside IDs, and
founders that may be omitted when only referenced as parents. All hand-authored.
The parser accepts both layouts (GitHub issue #31): it splits on tabs only when the
first line contains a tab, maps columns by name when the first line is a header
(an `id` column plus a `sex` column), and otherwise reads 4 columns as
`id fid mid sex`, 5 as `id fid mid sex aff` (or `famid id fid mid sex` when the
first column repeats in every row of a file with two or more rows), and 6+ as PLINK.
Every row must split into as many cells as the header (or, without a header, the
widest row), or the import is blocked. A parent of `NA` means missing. Files without a family
column import as family `1`; without an affection column everyone is "missing".

| File | Individuals | Expected behaviour |
|------|-------------|--------------------|
| `four_col_header_tab.ped` | 7 | Header `id fid mid sex`, tab-separated, no family ID, no phenotype. Clean. |
| `five_col_aff_header_tab.ped` | 7 | As above plus `aff` column (1/2). Clean; 2, 4, 6 affected. |
| `four_col_no_header_space.ped` | 6 | Four columns, no header, space-separated. Clean. |
| `famid_header_tab.ped` | 4 | Header `famid id fid mid sex aff`. The header must not be read as a data row. Clean. |
| `uppercase_header_tab.ped` | 4 | Header `ID FID MID SEX AFF`. Header detection is case-insensitive. Clean. |
| `names_with_spaces_tab.ped` | 6 | Tab-separated with spaces inside IDs (`Carol Able Baker`). Must split on tabs only when the file is tab-delimited. |
| `missing_founders_four_col.ped` | 3 (+3 phantom) | Parents 1, 2 and 5 referenced but not listed. `PHANTOM_PARENT` warnings, phantoms created as founders. |
| `famid_no_header_repeat.ped` | 4 | Five columns, no header, first column identical in every row (`FAM1`). Ambiguous between `famid id fid mid sex` and `id fid mid sex aff`; a repeated first column should be read as a family ID. |
| `na_parents_tab.ped` | 4 (+1 phantom) | Missing parents written as `NA` (pedtools, kinship2). Read as missing: no "NA" individual, no NA = NA couple. One `SINGLE_PARENT` warning (4 has father 1 only). |
| `kinship2_names.ped` | 5 | kinship2's own header `id dadid momid sex affected`, space-separated. `affected` is kinship2-coded (0 = unaffected, 1 = affected, NA = missing) and is recoded with an `AFFECTION_RECODED` info; 2 and 3 affected. |
| `two_families_no_famid.ped` | 7 | Five columns with header, no family ID, two disconnected components (1-4 and X1-X3). Should import as two families, or one pedigree with two components. |
| `aff_trailing_tab_trimmed.ped` | 4 | Header `id fid mid sex aff`, tab-separated. Rows 1 and 3 have no `aff` cell at all (a text editor stripped the trailing tab) and row 4 has an empty one. All four import, with 1, 3 and 4 as missing affection and no warnings (#71). |

### `malformed/` — Input that should fail with errors

| File | Individuals | Expected error |
|------|-------------|----------------|
| `empty.ped` | 0 | `EMPTY_FILE` |
| `only_comments.ped` | 0 | `EMPTY_FILE` |
| `missing_columns.ped` | 0 | `TOO_FEW_COLUMNS` (rows 2 and 3 fail, so the import is blocked; row 1 alone has 5 columns and would parse as `famid id fid mid sex`) |
| `invalid_sex_code.ped` | 3 | No hard error; `UNKNOWN_SEX_CODE` warnings only (these parse but have bad SEX) |
| `invalid_pheno_code.ped` | 3 | No hard error; `UNKNOWN_PHENO_CODE` warnings only |
| `self_as_parent.ped` | 4 | `SELF_AS_PARENT` errors for IID=3 and IID=4 |
| `circular_ancestry.ped` | 2 | `CIRCULAR_ANCESTRY` error: 1→2→1 |
| `duplicate_iid.ped` | 3 unique | `DUPLICATE_INDIVIDUAL` error: IID=1 appears twice |
| `mixed_delimiters.ped` | 0 | `COLUMN_COUNT_MISMATCH` on every row: the header is space-separated, the rows are tab-separated with spaces inside IDs |
| `spaces_in_ids_no_tabs.ped` | 0 | `COLUMN_COUNT_MISMATCH` on every row: spaces inside IDs in a space-separated file |
| `parent_both_sexes.ped` | 5 | `PARENT_BOTH_SEXES` error: 3 is both father and mother of 5 |

**Note:** `invalid_sex_code.ped` and `invalid_pheno_code.ped` do not hard-block import
(warnings only). They are in `malformed/` because the data is technically invalid per the
PED spec, not because the parser rejects them.

---

## Adding new test files

1. Add the `.ped` file to the appropriate subdirectory.
2. Add a row to the table above.
3. Add a corresponding test case in `frontend/src/io/__tests__/roundtrip.test.ts`.
