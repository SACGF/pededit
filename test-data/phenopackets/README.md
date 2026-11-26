# Phenopackets pedigree test files

GA4GH Phenopackets v2 `Pedigree` and `Family` messages as protobuf JSON, read
by `frontend/src/io/phenopackets/`. The format:
https://phenopacket-schema.readthedocs.io/en/latest/pedigree.html

- `pedigree.json`: a bare `Pedigree` message (`{ "persons": [...] }`). The
  four people are the example on the specification's pedigree page, written
  as JSON; founders have `"0"` for both parents, as there.
- `family.json`: a whole `Family` message. Only `pedigree` is read; `id`,
  `proband` and `metaData` are reported as not read. Invented names. It
  writes a missing parent three ways (field left out, `""`, `"0"`), leaves
  out `affectedStatus` (the default, `MISSING`) and `sex` (the default,
  `UNKNOWN_SEX`) once each, has an unknown-sex child, and one child (Noor)
  with only a mother, who gets an invented father as a PED import does.
