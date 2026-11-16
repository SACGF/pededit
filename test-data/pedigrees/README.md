# Pedigree test data set

Pedigree JSON documents covering the edge cases (#167), beside the PED corpus
in `test-data/ped/`. One set for every level of testing: the frontend unit
sweeps, the backend tests and the page checks all read these files.

Invented names only. Each file is small and built round one thing.

| Folder | What is in it |
|---|---|
| `structure/` | Family shapes: one person, a childless couple, a single parent, three partners, half siblings, couples who are related, someone drawn twice, unconnected families, a sibship of twelve, eight generations |
| `reproduction/` | Triplets of each zygosity, two fathers with a donor and a surrogate. Twins, adoption, pregnancies, losses and the NSGC Fig. 3 cases are in `drawn/couples.json` and `drawn/reproduction.json` |
| `drawn/` | The feature fixtures (#140): every symbol, mark, line and label, in both notations and both fill modes, with pins, snap to grid, pedigree numbers, hidden descendants and each view filter |
| `text/` | Markup characters in names, other scripts, partial dates, free-text ages, very long text, ids that are not UUIDs |
| `problems/` | Data that triggers every rule in `RULES` (`frontend/src/pedigree/validation.ts`) |
| `old/` | Old and foreign data that must still open: no notation setting, the old carrier flag, `null` for optional fields, unknown fields, a stale pin, no envelope, a newer envelope version |
| `refused/` | One file for each error the JSON importer reports. None of them may import |
| `size/` | Generated families of about 100, 200 and 500 people (101, 238 and 513), for timing: `frontend/scripts/browser/perf.mjs` (#180) measures the editor on them. Left out of the browser sweep |

## The manifest

`manifest.json` says, for every file, what the code does with it: the
importer's issues, whether it is valid, what the server does with it, the
number of people, the editor's problems (as `rule:subject`, with "today"
fixed at the manifest's `today`), and the render and export lint codes. A file
with expectations is a test: when any of those changes, the frontend test
fails until the manifest is rewritten on purpose.

`server` is `accepted` (stored and returned unchanged), `refused` (400),
`not-sent` (the fault is in the file or its envelope, which the server never
sees) or `accepted-unchecked` (the importer refuses it, the server stores it:
see #170).

## The files are generated

The source is `frontend/src/fixtures/dataset.ts` (and
`frontend/src/fixtures/features.ts` for `drawn/`). Do not edit the JSON by
hand: the test would put it back.

To add a file:

1. Add a case to the right group in `dataset.ts`. Give it a `must` saying
   what it is there to show (an importer code, a rule, a kinship value) when
   that is the point of it.
2. `npm -w frontend run test -- -u dataset` writes the file and the manifest.
3. Read the new manifest entry: it is now the expectation. Commit the
   source, the file and the manifest together.

A new rule in `RULES` or a new importer issue code fails the coverage test
until a file triggers it.

## What runs over it

- `frontend/src/fixtures/__tests__/dataset.test.ts`: writes and checks the
  files and manifest; every valid file imports, exports and imports again to
  the same pedigree, lays out, draws through both lints and the U-shape, and
  keeps through PED what PED can carry; coverage of rules and importer codes.
- `frontend/src/fixtures/__tests__/featureFixtures.test.ts`: every drawn
  field of the data model is set by a file in `drawn/`.
- `backend/api/tests.py`, `PedigreeDataSetTests`: the server stores every
  valid file unchanged and refuses what the manifest says it refuses.
- `node frontend/scripts/browser/console.mjs --all-test-data --fixture-via-api`
  (in CI): every valid file is saved through the API, opened in the editor,
  reloaded and compared, with no JavaScript error and a clean render lint.
- `node frontend/scripts/browser/flows.mjs` (in CI): the end-to-end flows,
  several of which start from these files.
