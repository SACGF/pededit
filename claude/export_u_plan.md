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

Only the blood descendants of one founder couple. Married-in partners and
unrelated families are left out, so the only couple line is the founders'.
The founders are the founder couple with the most descendants. A child of two
blood relatives hangs from whichever parent is closer to the founders, so every
individual appears once. `layoutUShape()` reports who was omitted and the dialog
shows the count.

## How it works

It is an ordinary tidy tree in a bent coordinate system.

- `u` is position along the U. 0 is the bottom centre, negative runs up the left
  arm, positive up the right arm. It is arc length on the founder track.
- `depth` is position across the U. Founders are on the innermost track (radius
  `r0`). Each generation is one `ringGap` further out.

`trackPoint(u, offset)` maps that to x/y plus the outward normal. A sibship bar
is a path along a track (`trackPath`, true SVG arcs on the curve, straight lines
on the arms). A descent line is a segment along the normal. Symbols and labels
are rotated so "down" points outward. Because lines only run along tracks or
straight across the gap between two tracks, they cannot cross a symbol.

Packing (`packSide`) works outward from the founders, one side at a time. Each
node goes as close to the centre as the previous node on its own track allows,
and a parent sits over the middle of its children. If that would put a parent
on top of its neighbour, its children are pushed outward and re-packed.
Spacing is measured in real pixels on the node's own track (`advance`). Outer
tracks are longer around the curve, so the curve holds more of the outer
generations, which is where most of the people are.

Two things make the figure a usable shape:

- Level arms. The founders' children are split between the two sides, and the
  founders slide along the U (`u0`, found by bisection) until both arms end at
  the same height. The split and the slide are chosen together. A family that
  fits on the curve keeps its founders at the bottom centre. A very lopsided
  family can push its founders part way up one arm. That is deliberate: level
  arms keep the figure compact, which is the point of the option.
- Aspect ratio. A larger `r0` gives a wider, shorter figure. `build()` grows
  `r0` until height / width is at most `TARGET_ASPECT` (1.35, a portrait page).

Label size drives spacing: more label lines widen `ringGap`, longer names widen
the slot along the track (capped at `MAX_SLOT`).

## Not done

- Consanguineous matings below the founders are not marked. The child is drawn
  once, under one parent, with no double line to the other.
- Half-siblings are drawn as one sibship under their shared blood parent.
- Small families come out as a fan rather than a U. That is expected: the option
  exists for pedigrees too wide to print.
- The middle of the U is empty. It is a natural place for a legend.
