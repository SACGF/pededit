# Bugs found by agent testing with the page-check harness

First run of the browser harness from #63 (`frontend/scripts/browser/`) against
the ten issues labelled "Needs Testing", on 2026-11-06, at origin/main 8e96e91.
Five agents, two issues each, drove the real app in headless chromium with
`console.mjs`, `shot.mjs`, `eval.mjs` and a few throwaway playwright scripts
built on `harness.mjs`. Screenshots were written to
`frontend/test-output/browser/agent-{a..e}/` (gitignored, local only).

No issue passed cleanly. Every feature exists and does its main job; each has
bugs or gaps. Verdicts: all ten "Pass with problems".

Priority: P1 loses data or draws a wrong pedigree, P2 blocks or misleads a
user, P3 cosmetic or a spec gap.

## Cross-cutting

### P1: backend drops `lifeStatus` on every save (#13, #17)
`IndividualSerializer` in `backend/api/serializers.py` has no `lifeStatus`
field, so pregnancy and loss symbols revert to plain symbols after auto-save
and reload. The same serializer strips unknown fields on individuals,
partnerships and the pedigree, although `docs/pedigree-json-format.md` says
they are "preserved as-is", and it adds `deceased/carrier/proband/consanguineous:
false` where they were absent (21 fields added on the test file). Fixture mode
skips the backend, which is why the PR's own checks missed it.

```
curl -s -X POST localhost:8000/api/pedigrees/ -H 'Content-Type: application/json' \
  -d '{"title":"x","data":{"individuals":[{"id":"a","sex":"unknown","affected":false,"sibOrder":0,"lifeStatus":"miscarriage"}],"partnerships":[],"parentOf":{},"siblingOrder":{"mode":"insertion","affectedFirst":false}}}'
# response has no lifeStatus
```

### P1: duplicate individuals dropped by `layoutToFlow` (#33, #5)
When kinship2 places one person twice in a row, `findOrphanDuplicates` /
`adjustOrphanPositions` in `frontend/src/pedigree/layoutToFlow.ts` keep the
first copy that has a couple line and drop or move the rest, even when the
other copy has its own couple line. The layout itself matches R slot for slot;
the breakage is downstream, so the kinship2 oracle test passes.

Mis-drawn in-app examples (7 of the 13 added for #33):
- Habsburg: John III = Catherine double line runs through Isabella and Charles
  I; its drop is at the same x as Isabella/Charles, so Mary of Portugal reads
  as Philip II's sister.
- Double second cousins A: P1, P2, Q1, Q2 joined by one continuous line
  (reads as same-sex couples).
- 3/4 siblings: A and F1 disconnected.
- Quadruple half first cousins: C floats alone, M1 and M2 have no parents.
- Double first cousins, double second cousins B, two lineages joined twice.

Also hit with 3+ partners when the partners remarry: in a man with three wives
where two remarry, only one W3 is drawn, her couple line ends at a missing
node and her child has no parent line. Same in a cousin-hop case.

Repro: `node frontend/scripts/browser/shot.mjs --fixture example:18` and look;
agent E's structural check (lines through symbols, lines to missing nodes,
children with no parent line) lists them all.

### P2: menus and dialogs run off screen (#19, #3)
The more menu with "Add children..." is 704px tall with no max height or
scroll; at 1366x768 the stepper's + button sits at y=-56 and cannot be
reached, at 1440x900 its heading is clipped. The Legend dialog has the same
problem with tags present: at 1280x720 it spans y=-78 to 798, title and close
button unreachable.

```
node frontend/scripts/browser/shot.mjs --fixture example:0 --viewport 1366x768 \
  --hover '[data-individual-id="c1"]' --click 'button[title="More options"]' --click 'text=Add children...'
```

### P3: numeric inputs act on every keystroke (#19, #7)
The child-count box clamps per keystroke (End, Backspace, 4 gives 10). The
grid-size box applies each keystroke: typing 45 snaps to 4 then 45, two undo
entries, pins rounded twice, and the field cannot be cleared.

## Per issue

### #37 Compact layout mode: Pass with problems
Met: 70% rows / 85% slots (120 to 84, 80 to 68 measured), not in pedigree
JSON, localStorage across reload, toggle beside minimap, edges follow, export
toggle defaults to the canvas setting.
- P2: compact and snap fight. Pins are snapped in normal coordinates then
  scaled, so they show off-grid in compact; a node dragged with snap on in
  compact is stored off-grid (429.41, 271.43).
- P3: long names overlap more at 68px slots; the 100-person example still
  does not fit at minimum zoom.

### #7 Snap to grid: Pass with problems
Met: 5px default, enabling snap rounds existing pins in one undo step, drags
land on multiples of 5.
- P2: auto-placed nodes are not snapped (8 of 16 off-grid in example 2, e.g.
  x=93.333), so a dragged node still cannot line up under them, which is the
  alignment problem the issue raised.
- P3: grid-size input per keystroke (above). Background dots stay at React
  Flow's 20px regardless of grid size.

### #19 Add several children: Pass with problems
Met: stepper (1 to 10) for sons/daughters/unknown in the more menu, unknown-sex
pill button, sibling order appended, one undo step per batch, placeholder
partner for someone single.
- P2: menu off screen (above).
- P3: count input clamps per keystroke (above).
- P3: for someone with several partners the batch always goes to the first
  partnership; no way to choose (same as single add-child).
- P3 (pre-existing): new individuals are labelled with their UUIDs and the
  labels overlap in a batch.

### #14 Carrier status: Pass with problems
Met: more-menu toggle, edit-panel checkbox, dot drawn, undo, persists through
the real backend, CSV `carrier` column.
- Gap: the "+/-" gene result tag preset was not implemented.

### #17 Lossless JSON: Pass with problems
Met: Download JSON in toolbar, `.json` accepted by both import dialogs,
`importJson`/`exportJson` byte-lossless on their own, schema validates
downloads and rejects bad input, linked from README.
- P1: backend drops `lifeStatus` and unknown fields (above), so the app round
  trip is not lossless.
- P3: anonymous pedigrees download as `pedigree.json` with title "pedigree"
  (title comes from the signed-in list only).
- Gap: schema is hand-written, not generated from the TS type as the issue
  asked. It currently matches `types.ts`.

### #31 PED dialect: Pass with problems
Met: all nine `test-data/ped/variants/` files including both silent cases;
header case variants, 4/5 columns, famid with and without header, CRLF,
comments, `#id` header, omitted founders (warnings); bad column counts block
import.
- P2: a file with a 4/5-column header whose rows split into more cells still
  imports nonsense with warnings only and Import enabled (space-separated
  header with tab data, or spaces in IDs and no tabs). The issue says this
  must be impossible.
  `printf 'id fid mid sex\nAlice Able\t0\t0\t2\nBob Baker\t0\t0\t1\nCarol B\tBob Baker\tAlice Able\t2\n'`
- Gap: kinship2's own names (`id dadid momid sex affected`) rejected, with a
  clear error.
- Gap: `exportPed({dialect: "r"})` exists but the UI always exports PLINK.
- P3: a single-row 5-column file `X 1 0 0 1` is read as famid X.

### #13 Pregnancy and loss symbols: Pass with problems
Met: all five statuses settable from the more menu, NSGC-correct symbols
(P, triangle, triangle with slash, slash with SB, ECT), affected fill, layout
unchanged, legend, both SVG exports, owner's restrictions (greyed actions).
- P1: lost on save (above).
- P3: "Add child (unknown sex)" still enabled on a loss; clicking only logs a
  console warning.
- P3: line from the sibship bar stops about 16px above a triangle's apex
  (canvas and exports).
- P3: SB caption overlaps the symbol's bottom edge in standard SVG export.
- P3: on affected termination/stillbirth the slash vanishes into the fill.

### #3 Tags and colouring: Pass with problems
Met: per-pedigree tags (add, rename, colour, style quadrant/dot/text,
reorder, delete), per-user library across pedigrees, tagging from edit panel
and more menu, several tags per node (fixed quadrants, fifth tag splits into
slices, clipped to triangle and diamond), legend lists only used tags,
persists through backend, export key.
- P2: affected individuals with quadrant tags lose their black fill while the
  legend still lists Affected.
- P2: Legend dialog off screen (above).
- P3: text tags in the export key have no gap ("c.68delBRCA1").
- Gap: no hatched or dotted fills, no monochrome pattern export (owner's
  comment).

### #5 Three or more partners: Pass with problems
Met: "Multiple partners" example renders cleanly; 3, 4, 5 partners with
children each hop correctly and match R kinship2 slot positions, including a
consanguineous variant.
- P1: partners who remarry lose duplicate copies (above).
- P3: a hop past a consanguineous couple takes its line style from the slots
  it passes, so a first-cousin marriage drawn as a hop gets a single line
  (R does the same; clinically wrong).
- P3: with five partners the two left-hand hop lines rise from the same x and
  overlap.

### #33 Historic and classic pedigrees: Pass with problems
Met: Habsburg, Queen Victoria, Tutankhamun and ten classic relationships as
fixtures with provenance in `test-data/ped/README.md` (Jicaque deliberately
omitted, only GPL sources); R reproduces all 19 oracle files byte for byte;
kinship coefficients check out (3/4 sibs 3/16, 5/8 sibs 5/32, double first
cousins 1/8, double second cousins 1/32, quadruple half first cousins 1/8,
Charles II F=0.217 with the README explaining the paper's 0.254); examples 8
to 20 on the landing page with citations; layout-engine 90/90 and frontend
437/437 pass.
- P1: 7 of 13 examples mis-drawn (above). Needs a render-level regression
  check, not only the layout oracle.

## Pre-existing, not from these issues
- After choosing a more-menu item its hover toolbar stays stuck on that node,
  which also made a harness `--click` hit the wrong node silently.
- Name labels overlap symbols in standard SVG export.
