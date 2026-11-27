# Phenopackets test files

GA4GH Phenopackets v2 `Pedigree` and `Family` messages as protobuf JSON, read
by `frontend/src/io/phenopackets/`. The format:
https://phenopacket-schema.readthedocs.io/en/latest/family.html

- `pedigree.json`: a bare `Pedigree` message (`{ "persons": [...] }`). The
  four people are the example on the specification's pedigree page, written
  as JSON; founders have `"0"` for both parents, as there.
- `family.json`: a whole `Family` message, with a proband (Ines, with one
  phenotypic feature) and no relatives. Invented names. It writes a missing parent three ways (field left out, `""`, `"0"`), leaves
  out `affectedStatus` (the default, `MISSING`) and `sex` (the default,
  `UNKNOWN_SEX`) once each, has an unknown-sex child, and one child (Noor)
  with only a mother, who gets an invented father as a PED import does.
- `family_full.json`: a Family as another tool might write it, with
  invented names: MONDO diseases with onsets as an age and an age range, one
  excluded; a relative deceased with an age at death and one with a date; a
  date of birth and an age at the last encounter; gender as a SNOMED CT term
  and as a label only; `consanguinousParents` for parents the pedigree does
  not show to be related; and fields PedEdit does not read
  (`interpretations`, `subject.taxonomy`, a phenotypic feature's onset),
  which the import lists.
