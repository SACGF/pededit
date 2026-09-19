# U-shape (horseshoe) export, issue #2

Very wide pedigrees do not fit a journal figure. This export bends the pedigree
around a U so the widest generations run up both arms and around the curve.

It is an export option only ("Render in U shape" in the export dialog). It never
affects the editor layout.

Code: `frontend/src/io/svg/uShapeExporter.ts`. Tests:
`frontend/src/io/svg/__tests__/uShapeExporter.test.ts`.

## Looking at the output

This is a visual problem, so look at it. From `frontend/`:

    ./render-u.sh            # all fixtures
    ./render-u.sh 1800 synth # only names containing "synth", overview max 1800px

It renders a battery of pedigrees (`src/io/svg/__tests__/_uShapeRender.dev.ts`)
to `frontend/test-output/` (git-ignored):

- `dev-NAME.svg`: the export itself, with the generation tracks overlaid in red
- `dev-NAME.full.png`: 1:1 screenshot, crop this to check detail
- `dev-NAME.png`: whole figure shrunk to fit

Screenshots come from headless Chromium. Do not use ImageMagick to rasterise the
SVG. Its built-in renderer draws arcs and rotated groups wrongly, which makes a
correct layout look broken.

`src/fixtures/syntheticFamily.ts` generates seeded random families with
married-in partners, which is where the large test pedigrees come from.

## What is drawn

A descendant chart of one founder couple: the founders, their blood
descendants, and (by default) each descendant's partners, drawn beside them on
the same track. Each sibship hangs from the middle of its parents' couple
line, as in an ordinary pedigree. Ancestors and other relatives of a
married-in partner are not drawn. `layoutUShape()` reports who was omitted and
the dialog shows the count.

The founders are a founder couple whose line shows the proband if there is
one (as a descendant or as a descendant's partner), and otherwise the founder
couple with the most descendants.

"Include married-in partners" in the dialog (`uShapePartners`, default on)
switches partners off. Then only blood descendants are drawn, and children
hang from their blood parent's symbol. This is the compact form from the
original issue, for very wide families. Couples who are both blood relatives
are still drawn as couples.

At most two partners fit beside one symbol (one each side). Further
partnerships are omitted with their children and counted as omitted.

## How it works

It is an ordinary tidy tree in a bent coordinate system.

- `u` is position along the U. 0 is the bottom centre, negative runs up the left
  arm, positive up the right arm. It is distance along the founder track.
- `depth` is position across the U. Founders are on the innermost track. Each
  generation is one `ringGap` further out.

The U is a flat bottom of half-length `flat`, a quarter circle of radius `r0`
each side, and two vertical arms. The founders always stand on the flat, so
they are upright. If generation 1 is small (half-width up to `MAX_FLAT`) the
flat is made long enough for it too, so a small family reads like an ordinary
pedigree.

`trackPoint(u, offset)` maps that to x/y plus the outward normal. A sibship bar
or couple line is a path along a track (`trackPath`, true SVG arcs on the
curve, straight lines elsewhere). A descent line is a segment along the
normal. Symbols and labels are rotated so "down" points outward. Because lines
only run along tracks or straight across the gap between two tracks, they
cannot cross a symbol.

A tree node (`TNode`) is one blood individual plus the partners standing
beside them (`members`, with pixel offsets `dx` from the blood member). Each
partnership is a `Union` with its own children. `arrange()` decides who stands
on which side: male on the left for a single partner, first partnership on the
left for two.

Packing (`packSide`) works outward from the centre, one side at a time. Each
node goes as close to the centre as the previous node on its own track allows,
allowing for the partners on both. A couple sits over the middle of its
children. A person with two sibships stands over the boundary between them, so
neither descent line crosses the other sibship's bar. If a parent would land
on its neighbour, its children are pushed outward and re-packed. Spacing is
measured in real pixels on the node's own track (`advance`). Outer tracks are
longer around the curve, so the curve holds more of the outer generations,
which is where most of the people are.

What shape the figure takes (`build()`):

- Fan. If the family fits on a page (`FAN_MAX_WIDTH`) around the curve alone,
  with no arms, it is drawn that way with the founders at the bottom centre,
  however lopsided it is. `r0` grows until it fits. Sliding the founders to
  balance a small family only skews it.
- U. Otherwise it needs the arms. The founders' children are split between the
  two sides and the founders slide along the U (`u0`, found by bisection) until
  both arms end at the same height. The split and the slide are chosen
  together. A very lopsided family can push its founders part way up one arm.
  That is deliberate: level arms keep the figure compact, which is the point
  of the option. `r0` grows until height / width is at most `TARGET_ASPECT`
  (1.35, a portrait page).

Label size drives spacing: more label lines widen `ringGap`, longer names widen
the slot along the track (capped at `MAX_SLOT`).

## Consanguinity

A child of two blood relatives hangs from whichever parent is closer to the
founders (the host). The couple is always drawn with a double line.

- Same track. `tryJoin()` reorders siblings up the tree so the two become
  neighbours facing each other with nobody between, and the couple line runs
  straight from one to the other (`Union.kind === "join"`). First cousins,
  double first cousins, siblings and half-siblings all come out this way. The
  reorder is undone if it would break an earlier join or there is no free
  side. This overrides the sibling order setting where it has to.
- Anything else (uncle and niece, or a join that was not possible). A second
  copy of the relative is drawn beside the host as a partner (`kind ===
  "dup"`), on the side nearer the original, and a thin dashed line links the
  two copies. On one track the link follows the track just inside the symbols.
  Across tracks it is a straight line drawn under the symbols. Copies are in
  `UShapeLayout.duplicates` and carry `data-dup-of` in the SVG. A married-in
  partner who has children with two people in the tree is handled the same way.

Details that keep joins clean: the descent line from a joined couple comes
down beyond the last child of the inner partner and before the first child of
the outer one. The founders' children are not split between two joined
partners if that would run the couple's sibship into another one. If there is
no clean split the whole family goes on one side.

## Founders with two partners

If a founder has children with a second partner, the founder is drawn between
both partners (spouse, shared parent, spouse) with each couple's children on
its own side of the U, under the middle of its own couple line. Only one extra
partnership is drawn. Children of any further partnerships of the founders are
omitted (and counted as omitted) rather than drawn under the wrong couple.

## Checking it

`./render-u.sh 1800 ped-` runs every file in `test-data/ped/` and every in-app
example (`src/data/examples.ts`) through the exporter, writes
`test-output/ped-*.png`, and prints a sanity report (exceptions, NaN,
overlapping symbols including duplicates, who was omitted).

The test suite also lays out 80 random families with random matings between
blood relatives, with partners on and off, and checks that no symbols overlap
and no two sibship bars on a level run into each other.

## Fixed 2026-09-19

Numbering follows the list this section replaced.

1. Consanguineous matings below the founders were invisible. Now joined
   directly or drawn with a linked duplicate, see Consanguinity above. Every
   file in `test-data/ped/consanguineous/` shows its loop.
2. Married-in partners vanished, sometimes including a proband's parent. They
   are now drawn, and the root prefers the proband's line.
   `simple/three_generation.ped` now shows the mother. Still open: see below.
3. Lopsided small families came out as a skewed spiral with the founders up an
   arm. They are now fans under upright founders (`kinship2_sample` family 1).
4. Pedigrees with nobody to descend from drew one person. The dialog now
   disables the option for them and says why. It also states how many of how
   many individuals are left out.
5. Tilted founders in small figures. The flat bottom keeps the founders, and a
   small generation 1, upright.
6. The dangling `FAME_80237.ped` reference is gone from the render harness.

Earlier the same day: small families put one child on the left and every other
child on the right, and a founder's children by a second partner were drawn as
children of the first couple.

## Not done

- **Only one founder lineage.** When two founder lineages marry, the partner
  is drawn but their parents and siblings are not. `double_first_cousin.ped`
  shows both cousins joined but not the second pair of grandparents (3 and 4),
  so the "double" is not visible. `kinship2_sample` family 1 still omits 17 of
  41 and the in-app "Large family" 63 of 100. The U shape is a descendant
  chart. Drawing several lineages needs either ancestors hung inward from a
  married-in partner (the middle of the U is empty) or a user-chosen root.
- More than two partners of one person: the rest are omitted with their
  children.
- With partners off, half-siblings are drawn as one sibship under their shared
  blood parent. Ambiguous rather than wrong.
- A dashed duplicate link across tracks is a straight line under the symbols.
  It can pass behind an unrelated symbol or label.
- A lopsided family drawn as a fan is a lopsided fan (most of it to one side
  of the founders). That is the price of upright founders.
- `single_parent.ped` has two unrelated single-parent lines and only one is
  drawn. The dialog reports 3 of 6 left out.
- The middle of the U is empty. It is a natural place for a legend.
