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
| `non_numeric_sex.ped` | 4 | `UNKNOWN_SEX_CODE` warnings for M/F/U; converter treats M→male, F→female, U→unknown. |
| `leading_trailing_spaces.ped` | 3 | Clean. Trimmed before splitting. |

### `malformed/` — Input that should fail with errors

| File | Individuals | Expected error |
|------|-------------|----------------|
| `empty.ped` | 0 | `EMPTY_FILE` |
| `only_comments.ped` | 0 | `EMPTY_FILE` |
| `missing_columns.ped` | 0 | `TOO_FEW_COLUMNS` (all 3 rows fail; no valid rows) |
| `invalid_sex_code.ped` | 3 | No hard error; `UNKNOWN_SEX_CODE` warnings only (these parse but have bad SEX) |
| `invalid_pheno_code.ped` | 3 | No hard error; `UNKNOWN_PHENO_CODE` warnings only |
| `self_as_parent.ped` | 4 | `SELF_AS_PARENT` errors for IID=3 and IID=4 |
| `circular_ancestry.ped` | 2 | `CIRCULAR_ANCESTRY` error: 1→2→1 |
| `duplicate_iid.ped` | 3 unique | `DUPLICATE_INDIVIDUAL` error: IID=1 appears twice |

**Note:** `invalid_sex_code.ped` and `invalid_pheno_code.ped` do not hard-block import
(warnings only). They are in `malformed/` because the data is technically invalid per the
PED spec, not because the parser rejects them.

---

## Adding new test files

1. Add the `.ped` file to the appropriate subdirectory.
2. Add a row to the table above.
3. Add a corresponding test case in `frontend/src/io/__tests__/roundtrip.test.ts`.
