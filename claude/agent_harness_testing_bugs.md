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

# Second run

Same ten issues, on 2026-11-06, at origin/main 10e36b0 (the harness work from
#63's future-work list; no app fixes landed between the runs, so most bugs
were expected to remain). Five agents again, two issues each, screenshots in
`frontend/test-output/browser/agent-{a..e}/`. Every agent confirmed the
`served: 10e36b0 main, origin/main 10e36b0` line. Midway through, the served
line showed uncommitted files: the harness fixes for the friction below were
being made in the same checkout. Only `renderLint.ts` among app files changed,
and agent E's first lint run on the clean tree matched its later ones.

New harness pieces that found or confirmed bugs this time: `--fixture-via-api`
reported the `lifeStatus` drop with no extra steps, `lint.mjs --all-examples`
flagged the seven mis-drawn examples plus two new problems, and step
ambiguity checks caught the stuck hover toolbar instead of clicking the wrong
node.

Verdicts: #17 and #13 Fail (P1 data loss on save); the other eight Pass with
problems. None passed cleanly.

## First-run bugs

| Bug | Status |
| --- | --- |
| P1 backend drops `lifeStatus` and unknown fields, adds `false` defaults (#13, #17) | Still present. Also hits the landing-page JSON import, which loses `lifeStatus` at once |
| P1 duplicate individuals dropped by `layoutToFlow` (#33, #5) | Still present, all 7 examples. Three wives where two remarry: both remarried wives lose their second couple |
| P2 more menu and Legend dialog off screen (#19, #3) | Still present (menu at y=-136 at 1366x768; Legend y=-56 at 1280x720) |
| P3 numeric inputs act per keystroke (#19, #7) | Still present (typing 45 in grid size gives 3 undo entries) |
| #37 P2 compact and snap fight | Still present, worse: see "compact rows off the grid" below |
| #37 P3 long names overlap, 100-person example does not fit | Still present |
| #7 P2 auto-placed nodes not snapped | Still present (i2a x=93.333) |
| #7 P3 background dots fixed at 20px | Still present |
| #19 P3 batch always goes to the first partnership | Still present |
| #19 P3 new individuals labelled with UUIDs, labels overlap | Still present |
| #14 gap: "+/-" gene result tag preset | Still missing |
| #17 P3 anonymous download named `pedigree.json` | Still present |
| #17 gap: schema hand-written, not generated | Still present |
| #31 P2 mis-split header/data imports nonsense with Import enabled | Still present |
| #31 gaps: kinship2 header names rejected, R dialect export not in UI | Still present |
| #31 P3 single row `X 1 0 0 1` read as famid X | Still present |
| #13 P3 "Add child (unknown sex)" enabled on a loss | Still present (found again from #19) |
| #13 P3 sibship line stops above a triangle apex | Still present |
| #13 P3 SB caption overlaps symbol in SVG export | Still present, and black on black for an affected stillbirth |
| #13 P3 slash vanishes into fill on affected termination/stillbirth | Still present |
| #3 P2 affected fill lost with quadrant tags | Not reproduced as described: black now shows in untagged sectors. Still lost when all four quadrants are tagged, so the person reads as unaffected |
| #3 P3 no gap after text tags in export key | Still present |
| #3 gap: hatched fills, monochrome export | Still missing |
| #5 P3 consanguineous hop drawn with a single line | Still present |
| #5 P3 five partners: two hop risers overlap | Still present |
| Pre-existing: hover toolbar stuck after a more-menu action | Still present; the harness now reports "matched 2 visible elements" instead of acting on the wrong node |
| Pre-existing: name labels overlap symbols in standard SVG export | Still present |

## New bugs

### P1: childless partnerships get no couple line (#5, pre-existing)
A partnership with no children is never passed to kinship2 as a spouse hint
(`__pededit.align()` has spouse 0 for the pair), so it gets no couple line,
and a non-founder's new partner lands in the founder row. "Add partner" in the
UI does this, which breaks adding a third partner for #5. The engine at
9e386e6 does the same, so it predates #5. `frontend/AGENTS.md` lists childless
partnerships as handled. Example 2 ("Multi-branch family", i3c = i3f) shows
it; the render lint found it.
```
node frontend/scripts/browser/shot.mjs --fixture example:0 --hover '[data-individual-id="c1"]' \
  --click 'button[title="More options"]' --click 'text=Add partner' --mouse-away
```

### P1: PED parent id `NA` (or any id used as both father and mother) (#31)
`id fid mid sex` with rows `1 NA NA 1`, `2 NA NA 2`, `3 1 2 1` creates two
individuals with id "NA", a partnership "NA = NA", and draws 1 and 2 as a
consanguineous couple. A shared parent id that is defined in the file gives a
self-partnership with only a sex-mismatch warning. Should be an error, and `NA`
should probably mean missing (pedtools and kinship2 write it).
```
printf 'id\tfid\tmid\tsex\n1\tNA\tNA\t1\n2\tNA\tNA\t2\n3\t1\t2\t1\n' > frontend/test-output/na.ped
node frontend/scripts/browser/shot.mjs --fixture frontend/test-output/na.ped
```

### P1: compact mode makes symbols overlap (#37)
The duplicate fixup puts a1 half a slot from a2; at 68px compact slots they
overlap ("Double first cousins", "Double second cousins (B)"). Root cause is
the duplicate P1, but compact turns it into overlapping symbols.
`node frontend/scripts/browser/lint.mjs --all-examples --compact`

### P2: compact rows are off the snap grid (#37, #7)
Compact rows sit at 84, 168, 252, not multiples of 5, so with snap on even a
horizontal drag moves a node off its row (84 to 85) and its couple line
slants.
```
node frontend/scripts/browser/shot.mjs --fixture example:2 --local-storage compactLayout=true \
  --click 'button[title="Pedigree settings"]' --click 'label:has-text("Nodes moveable") input' \
  --click 'label:has-text("Snap to grid") input' --press Escape \
  --drag '[data-individual-id="i2e"]=>30,0' --mouse-away --measure-flow '[data-individual-id="i2e"]'
```

### P2: sibship drop does not follow a child pinned off its row (repositioning)
`SibshipEdge` draws every drop to the first child's row, so a child dragged
vertically is left with a gap above it, on the canvas and in the SVG export.
The render lint now reports it as `child-off-row`.
```
node frontend/scripts/browser/shot.mjs --fixture example:2 --click 'button[title="Pedigree settings"]' \
  --click 'label:has-text("Nodes moveable") input' --press Escape \
  --drag '[data-individual-id="i2c"]=>0,40' --mouse-away
```

### P2: pregnancy plus carrier: the P and the dot collide (#13, #14)
Both are drawn at the symbol centre, on the canvas and in the SVG export, so
the symbol cannot be read.

### P2: PED export turns pregnancies and losses into ordinary children (#13)
Export PED writes a miscarriage as a living child (`1 k2 f m 0 1`) with no
warning. CSV carries a `life_status` column.

### P2: TypeScript layout differs from R for a partner chain (#5)
H1, H2, H3 with W1, and H2, H3 with W2 (`F H1 0 0 1 1`, `F W1 0 0 2 1`,
`F H2 0 0 1 1`, `F W2 0 0 2 1`, `F H3 0 0 1 1`, `F a H1 W1 1 1`,
`F b H2 W1 2 1`, `F c H2 W2 1 1`, `F d H3 W2 2 1`, `F e H3 W1 1 2`): slot 7
is H2 in R and W2 in TS, the spouse rows differ, d sits at 5.5 in R and 6.5 in
TS. Compare `Rscript layout-engine/scripts/kinship2-oracle.R` with
`eval.mjs --fixture FILE '__pededit.align()'`.

### P3
- #37: turning compact on does not refit the view; a large pedigree stays clipped.
- #31: `M`, `F`, `male`, `female` sex codes warn "unrecognised SEX value ...
  treated as unknown" but import correctly (`validator.ts` accepts only 0/1/2,
  `converter.ts` accepts letters and words).
- #31: phantom parents show internal ids (`__phantom_mother_1571aaef`) as labels.
- #17: the "newer version" import warning says unknown fields will be kept,
  which is false once saved.
- #14: carrier can be set on a loss triangle or an affected person but is not
  drawn and the user gets no feedback.
- #13, #3: the SVG export key lists tags only: no Affected, Deceased or
  pregnancy/loss entries, so a pedigree with losses and no tags exports with
  no key.
- #3: five or more quadrant tags split every symbol into fifths, leaving empty
  wedges on people with four or fewer tags.
- #3: the first new tag defaults to black, which is invisible on an affected
  person and reads as affected-quadrant shading on anyone else.
- #5: `Partnership.consanguineous` is ignored for line style even without a
  hop; the line comes from kinship2's spouse code while the legend uses the flag.
- SVG export: the title text overlaps the top-left symbol.

## Harness friction from the second run

Fixed on main after the run: `--measure`/`--measure-flow` take playwright
selectors (they used `querySelectorAll`); downloads go to `--out-dir`, now a
common flag; a key holding `undefined` no longer shows as a persistence
difference; `exportPed`/`exportJson` on `__pededit`; `shot.mjs FILE.svg`
renders a saved export; contact-sheet labels use the file name; the lint also
reports slanted couple lines and children off their siblings' row; README
shows `{ nodes, coupleEdges, sibshipEdges }` and dialog-scoped selectors.

Still open:
- Agents share one checkout, so the served code can change mid-run when
  anyone edits tracked files. Testing runs need a frozen worktree with its own
  Vite (`PEDEDIT_BASE` makes the tools follow it).
- The lint misses overlapping hop risers, line style versus the
  consanguineous flag, a child that looks as if it hangs from the wrong parent
  (example 20's c2), and label overlap.
- `missing-node` names a slot id (`1-3`), not the person who is missing.
- No `--oracle` to compare a fixture's `align()` with R kinship2.
- `--clip` on `.react-flow__viewport` is offset (it carries the transform).
- Pretty-printed eval output is long; a compact JSON flag would help.
