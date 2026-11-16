# @pedigree-editor/layout-engine

Automatic layout for pedigrees (genetic family trees), and kinship and
inbreeding coefficients, in TypeScript. No DOM, no framework: a family goes
in, and rows of slots with horizontal positions come out, ready to draw as SVG
or on a canvas with whatever you use.

The layout is a port of `align.pedigree` from the
[kinship2](https://cran.r-project.org/package=kinship2) R package by Jason
Sinnwell, Terry Therneau and Daniel Schaid, the algorithm behind most
published pedigree figures. It handles what simple tree layouts get wrong:
several partners, marriages between relatives, marriages across generations,
and parents centred over their children by a quadratic program.

It is the layout engine of [PedEdit](https://pededit.com), an open source
pedigree editor, and lives in
[its repository](https://github.com/SACGF/pededit/tree/main/layout-engine).

## Install

```
npm install @pedigree-editor/layout-engine
```

ES modules with TypeScript declarations, for browsers and Node 20 or later.
One runtime dependency, [quadprog](https://www.npmjs.com/package/quadprog).
There is no CommonJS build: `require()` of an ES module works in Node 20.19
and later. Bundled for a browser with Vite it is about 35 kB minified, 13 kB
gzipped, quadprog included.

## A minimal example

```ts
import { alignPedigree, type Pedigree } from "@pedigree-editor/layout-engine";

// A couple and their three children.
const pedigree: Pedigree = {
  individuals: [
    { id: "father", sex: "male", affected: false, sibOrder: 0 },
    { id: "mother", sex: "female", affected: false, sibOrder: 1 },
    { id: "son", sex: "male", affected: true, sibOrder: 2 },
    { id: "daughter", sex: "female", affected: false, sibOrder: 3 },
    { id: "youngest", sex: "unknown", affected: false, sibOrder: 4 },
  ],
  partnerships: [{ id: "couple", individual1: "father", individual2: "mother" }],
  parentOf: { couple: ["son", "daughter", "youngest"] },
  siblingOrder: { mode: "insertion", affectedFirst: false },
};

console.log(alignPedigree(pedigree));
```

prints

```
{
  n: [ 2, 3 ],
  nid: [ [ 1, 2 ], [ 3, 4, 5 ] ],
  pos: [ [ 0.49999996535898433, 1.4999999653589844 ], [ 0, 1, 2 ] ],
  fam: [ [ 0, 0 ], [ 1, 1, 1 ] ],
  spouse: [ [ 1, 0 ], [ 0, 0, 0 ] ]
}
```

Two rows: the parents at 0.5 and 1.5, centred over three children at 0, 1
and 2.

## The input

A `Pedigree` is a graph: people, the partnerships between them, and each
partnership's children.

- `individuals`: each has an `id`, a `sex` (`"male"`, `"female"` or
  `"unknown"`, the biological sex), `affected`, and `sibOrder`, which orders
  siblings from left to right.
- `partnerships`: `{ id, individual1, individual2 }`. A couple needs no
  children to be laid out as a couple.
- `parentOf`: partnership id to the ids of its children. A child has two
  parents or none.
- `siblingOrder`: how siblings are ordered. `mode` `"insertion"` or
  `"manual"` orders them by `sibOrder`, `"birthDate"` by `dob` where it is
  given, and `affectedFirst: true` puts affected siblings first.

Everything else on these types is optional. Most of it is what the PedEdit
editor records and draws (names, dates, conditions, settings) and does not
change the layout. The fields that do are `Individual.dob` (with the
`"birthDate"` order), `Partnership.twins`, `Partnership.leftPartner` (which
partner is drawn on the left), and `Individual.carriedBy` and
`socialParents` (assisted reproduction).

For data in PED form (id, father, mother, sex), `buildPedigreeFromFlat` makes
the `Pedigree`:

```ts
import { alignPedigree, buildPedigreeFromFlat } from "@pedigree-editor/layout-engine";

// A man (1) with a son by one woman (2) and a daughter by another (3).
const pedigree = buildPedigreeFromFlat([
  { id: 1, father: 0, mother: 0, sex: 1 },
  { id: 2, father: 0, mother: 0, sex: 2 },
  { id: 3, father: 0, mother: 0, sex: 2 },
  { id: 4, father: 1, mother: 2, sex: 1 },
  { id: 5, father: 1, mother: 3, sex: 2 },
]);
console.log(JSON.stringify(alignPedigree(pedigree)));
```

```
{"n":[3,2],"nid":[[2,1,3],[4,5]],"pos":[[0,0.9999999999999997,1.9999999999999998],[0.4999999900000003,1.4999999900000003]],"fam":[[0,0,0],[1,2]],"spouse":[[1,1,0],[0,0]]}
```

The man sits between his two partners, and each child hangs from its own
parents.

## Reading the result

`LayoutResult` holds five arrays, all indexed `[level][slot]` from 0. Level 0
is the oldest generation, and slots run left to right.

| Field | Meaning |
|---|---|
| `n[level]` | Number of slots in the row. |
| `nid[level][slot]` | Who is drawn there: a 1-based index, so the person is `pedigree.individuals[Math.floor(nid) - 1]`. |
| `pos[level][slot]` | Horizontal position. Neighbours are 1 apart or more. Multiply by your slot width. |
| `fam[level][slot]` | 0 for no parents drawn. Otherwise the parents are in the row above, the left one at slot `fam - 1` and the right one at slot `fam` (`fam` is 1-based). Siblings share a `fam` value. |
| `spouse[level][slot]` | 0 for none, 1 when the slot to the right is this person's partner, 2 when that partner is also a relative (draw the couple line double). Only the left partner carries the mark. |

Three things to know before drawing:

- **Positions are not integers.** A quadratic program places parents over
  their children, so expect 0.5, and expect 0.49999996 where 0.5 was meant.
  Round if you need tidy numbers.
- **A person can fill two slots.** Someone whose partners cannot all sit
  beside them, or who marries a relative from another branch, is drawn once
  in each place. Draw every slot (the usual convention joins the copies with
  a dashed arc) and key your elements by level and slot, not by person.
- **Three or more partners.** They are laid out as one run of slots with a
  `spouse` mark on each but the last, for example `wife2, man, wife1, wife3`.
  The mark between `wife1` and `wife3` is the man's couple line passing
  through, not a couple. `resolveCouple(result, partners, level, slot)`
  returns the two slots a mark really joins and `hop: true` when the line has
  to pass over someone, with `partners` from
  `buildPartnerSetFromPedigree(pedigree)`.

Drawing takes three rules: a symbol per slot, a couple line wherever `spouse`
is set, and a sibship line from the middle of each couple down to their
children. Here they are as a function that returns an SVG string. `cousins`
is a nine person family in which two first cousins have a child:

```ts
// cousins.ts
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";

let order = 0;
const person = (id: string, sex: Individual["sex"], affected = false): Individual =>
  ({ id, sex, affected, sibOrder: order++ });

/** Grandparents, their son and daughter, and a marriage between two first cousins. */
export const cousins: Pedigree = {
  individuals: [
    person("grandfather", "male"), person("grandmother", "female"),
    person("uncle", "male"), person("aunt", "female"),
    person("mother", "female"), person("father", "male"),
    person("cousin", "male"), person("daughter", "female"),
    person("child", "female", true),
  ],
  partnerships: [
    { id: "p1", individual1: "grandfather", individual2: "grandmother" },
    { id: "p2", individual1: "uncle", individual2: "aunt" },
    { id: "p3", individual1: "father", individual2: "mother" },
    { id: "p4", individual1: "cousin", individual2: "daughter" },
  ],
  parentOf: {
    p1: ["uncle", "mother"],
    p2: ["cousin"],
    p3: ["daughter"],
    p4: ["child"],
  },
  siblingOrder: { mode: "insertion", affectedFirst: false },
};
```

```ts
// draw.ts
import { alignPedigree, type Pedigree } from "@pedigree-editor/layout-engine";
import { cousins } from "./cousins.js";

const SLOT = 80, ROW = 100, HALF = 20;

export function drawSvg(pedigree: Pedigree): string {
  const { n, nid, pos, fam, spouse } = alignPedigree(pedigree);
  const x = (level: number, slot: number) => pos[level][slot] * SLOT;
  const y = (level: number) => level * ROW;
  const out: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);

  for (let level = 0; level < n.length; level++) {
    const sibships = new Map<number, number[]>(); // fam value to child slots
    for (let slot = 0; slot < n[level]; slot++) {
      const cx = x(level, slot), cy = y(level);

      // Rule 1: one symbol per slot. nid is 1-based.
      const person = pedigree.individuals[Math.floor(nid[level][slot]) - 1];
      const fill = person.affected ? "black" : "white";
      if (person.sex === "male") {
        out.push(`<rect x="${cx - HALF}" y="${cy - HALF}" width="${2 * HALF}" height="${2 * HALF}" fill="${fill}"/>`);
      } else if (person.sex === "female") {
        out.push(`<circle cx="${cx}" cy="${cy}" r="${HALF}" fill="${fill}"/>`);
      } else {
        out.push(`<path d="M${cx},${cy - HALF} L${cx + HALF},${cy} L${cx},${cy + HALF} L${cx - HALF},${cy} Z" fill="${fill}"/>`);
      }

      // Rule 2: a couple line to the slot on the right, double when related.
      if (spouse[level][slot] > 0) {
        const x2 = x(level, slot + 1) - HALF;
        if (spouse[level][slot] === 2) {
          line(cx + HALF, cy - 3, x2, cy - 3);
          line(cx + HALF, cy + 3, x2, cy + 3);
        } else {
          line(cx + HALF, cy, x2, cy);
        }
      }

      const f = fam[level][slot];
      if (f > 0) sibships.set(f, [...(sibships.get(f) ?? []), slot]);
    }

    // Rule 3: each sibship hangs from the middle of its parents' couple line.
    // The parents are slots f - 1 and f (0-based) of the row above.
    for (const [f, slots] of sibships) {
      const mid = (x(level - 1, f - 1) + x(level - 1, f)) / 2;
      const barY = y(level) - ROW / 2;
      const xs = slots.map((slot) => x(level, slot));
      line(mid, y(level - 1), mid, barY);
      line(Math.min(mid, ...xs), barY, Math.max(mid, ...xs), barY);
      for (const cx of xs) line(cx, barY, cx, y(level) - HALF);
    }
  }

  const width = Math.max(...pos.flat()) * SLOT + 2 * HALF + 20;
  const height = (n.length - 1) * ROW + 2 * HALF + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-HALF - 10} ${-HALF - 10} ${width} ${height}" `
    + `width="${width}" height="${height}" stroke="black" stroke-width="2" fill="none">${out.join("")}</svg>`;
}

console.log(drawSvg(cousins));
```

The layout it draws from, `JSON.stringify(alignPedigree(cousins))`:

```
{"n":[2,4,2,1],"nid":[[1,2],[3,4,6,5],[7,8],[9]],"pos":[[0.9999999575770774,1.999999957577078],[0,0.9999999999999992,1.9999999999999996,3.000000000005874],[0.4999999999999996,2.5000000000029368],[1.4999999625015776]],"fam":[[0,0],[1,0,0,1],[1,3],[1]],"spouse":[[1,0],[1,0,1,0],[2,0],[0]]}
```

The third row is the two cousins, `spouse` 2 between them. The example
leaves out what a full renderer adds: the dashed arc between two copies of a
person, the raised line for three or more partners, and twins.

## React

`pedigreeToGeometry` does the three rules for you and returns pixel
coordinates: `nodes`, `couples`, `sibships` and `bounds`. A component that
draws them:

```tsx
import { pedigreeToGeometry, type Pedigree } from "@pedigree-editor/layout-engine";

export function PedigreeSvg({ pedigree }: { pedigree: Pedigree }) {
  const { nodes, couples, sibships, bounds } = pedigreeToGeometry(pedigree);
  const pad = 10;
  const viewBox = [bounds.minX - pad, bounds.minY - pad, bounds.width + 2 * pad, bounds.height + 2 * pad].join(" ");

  return (
    <svg viewBox={viewBox} width={bounds.width + 2 * pad} stroke="black" strokeWidth={2} fill="none">
      {couples.map((c, i) =>
        c.kind === "consanguineous" ? (
          <path key={i} d={`M${c.x1},${c.y - 3} H${c.x2} M${c.x1},${c.y + 3} H${c.x2}`} />
        ) : (
          <path key={i} d={`M${c.x1},${c.y} H${c.x2}`} />
        ),
      )}
      {sibships.map((s, i) => {
        const xs = [s.coupleX, ...s.childXs];
        // The drops run to each child's centre; the symbols are drawn over them.
        const drops = s.childXs.map((x) => `M${x},${s.sibBarY} V${s.childY}`).join(" ");
        return (
          <path
            key={i}
            d={`M${s.coupleX},${s.coupleY} V${s.sibBarY} M${Math.min(...xs)},${s.sibBarY} H${Math.max(...xs)} ${drops}`}
          />
        );
      })}
      {nodes.map((n) => {
        const key = `${n.level}-${n.slot}`; // a person can be drawn in two slots
        const fill = n.affected ? "black" : "white";
        if (n.sex === "male") {
          return <rect key={key} x={n.cx - n.half} y={n.cy - n.half} width={2 * n.half} height={2 * n.half} fill={fill} />;
        }
        if (n.sex === "female") {
          return <circle key={key} cx={n.cx} cy={n.cy} r={n.half} fill={fill} />;
        }
        const d = `M${n.cx},${n.cy - n.half} L${n.cx + n.half},${n.cy} L${n.cx},${n.cy + n.half} L${n.cx - n.half},${n.cy} Z`;
        return <path key={key} d={d} fill={fill} />;
      })}
    </svg>
  );
}
```

`<PedigreeSvg pedigree={cousins} />` draws the same chart as `drawSvg`
above. Sizes come from the second argument,
`pedigreeToGeometry(pedigree, { slotWidth: 80, rowHeight: 120, nodeSize: 40 })`
being the defaults. Each couple and sibship also has a `hopHeight`, above 0
when the couple line has to rise over someone in between (three or more
partners); this component ignores it.

## Several families

`alignPedigree` packs unrelated families into the same rows at ordinary
spacing, as kinship2 does, so they read as one family.
`alignPedigreeByFamily` lays out each family alone and sets them side by
side with a gap (`FAMILY_GAP`, 2.5 slots), people with no relatives last. It
also turns on the layout improvements PedEdit has made beyond kinship2 (the
`improve` option). With one family and no improvements to make it returns
what `alignPedigree` does. `splitFamilies(pedigree)` gives the families as
lists of ids.

## Kinship and inbreeding

```ts
import { kinshipCoefficients } from "@pedigree-editor/layout-engine";
import { cousins } from "./cousins.js";

const k = kinshipCoefficients(cousins);
console.log(k.kinship("uncle", "mother"));     // siblings
console.log(k.kinship("cousin", "daughter"));  // first cousins
console.log(k.inbreeding("child"));            // their child

const x = kinshipCoefficients(cousins, { chromosome: "X" });
console.log(x.kinship("cousin", "daughter"));
console.log(x.inbreeding("child"));
```

```
0.25
0.0625
0.0625
0
0
```

The kinship coefficient of two people is the chance that an allele drawn at
random from one is identical by descent to one drawn from the other; a
person's inbreeding coefficient is the kinship of their parents. The method
is the recursion kinship2's `kinship()` uses, and the values are tested
against it. Kinship follows blood, not the drawing: someone with
`adopted: "in"` is a founder, and monozygotic twins (`Partnership.twins`)
count as one genome. X-linked values that depend on a sex the pedigree does
not record are `NaN`. Time and memory are quadratic in the number of people.

## API

Stable, and covered by semantic versioning from 1.0:

- `alignPedigree(pedigree, options?)`: the kinship2 layout. Options:
  `align` (default true, the quadratic program), `packed` (default true),
  `width` (default 10), `widthSlack` (default 0, extra slots of width the
  drawing may take to centre sibships), `improve` (default false).
- `alignPedigreeByFamily(pedigree, options?)`, `splitFamilies(pedigree)`,
  `FAMILY_GAP`.
- `pedigreeToGeometry(pedigree, constants?)`: pixel geometry, built on
  `alignPedigree`.
- `resolveCouple`, `buildPartnerSetFromPedigree`: which slots a `spouse`
  mark joins.
- `kinshipCoefficients(pedigree, options?)`.
- `buildPedigreeFromFlat(rows)`: PED-style rows to a `Pedigree`.
- Types: `Pedigree`, `Individual`, `Partnership`, `LayoutResult`,
  `AlignOptions` and those of the functions above.

Also exported, for the PedEdit editor, and free to change in any release:
the steps of the pipeline and their 1-based working types (`kindepth`,
`autohint`, `buildLayoutInput`, `buildPartnerSet`, `isPartnerPair`,
`LayoutInput`, `Hints`), the editor's hooks into the layout
(`applyPartnerSides`, `drawnLeftPartner`, `placementParentOf`,
`carrierAbove`, `RELAXED_WIDTH_SLACK`), `isAffected` and `isConditionTag`,
and the optional fields of the data model that only the editor reads.

## Limits

- It computes positions. It draws nothing: symbols, lines and labels are
  yours (PedEdit's follow the NSGC pedigree nomenclature).
- A child has two parents or none. For a single known parent, add the other
  as a person of unknown name.
- A pedigree in which someone is their own ancestor throws an `Error`. An
  id in `parentOf` that belongs to nobody is ignored without a message, so
  check your data first.
- The layout is deterministic, and not incremental: any edit is a new
  layout.
- Before 1.0, a minor version may change the API.

## Differences from kinship2

With default options, who sits in which slot (`n`, `nid`, `fam`, `spouse`)
matches R's `align.pedigree` exactly on our test corpus of PED files, and
the test suite holds it there. The deliberate differences:

- **Couples without children are couples.** kinship2 learns of a couple only
  from a shared child. Here every partnership is laid out and marked in
  `spouse`.
- **People with no relatives are kept.** kinship2 drops them; here they are
  added at the right of their row, after the optimisation.
- **Positions differ a little.** A centring pass runs after the quadratic
  program, so `pos` can differ from R where the slots agree.
- **Parents by role, not sex.** Couples are oriented by the father and
  mother role each person holds, so couples of the same sex or of unknown
  sex are drawn once, where R needs one male and one female.
- **A marriage into a lower generation.** kinship2's generation alignment
  marks every couple of the person it moved as done, which left a second
  partner in the founder row; here only the couple just handled is.
- **When `autohint` fails** kinship2 falls back to an order that is `NA`
  for all but the first person (a bug); here the fallback is the plain
  order it meant.
- **Twins** come from `Partnership.twins`, not a relation matrix.
- **Not ported:** `plot.pedigree` (drawing), `pedigree.shrink`, `pedigree.trim`
  and the rest of the package. Only `align.pedigree` with its helpers
  (`kindepth`, `autohint`, `alignped1` to `alignped4`) and `kinship`.
- **X-linked kinship with unknown sex.** kinship2 gives `NA` for the whole
  row of a child of unknown sex. Here the value is worked out both ways and
  is `NaN` only where the answers differ.

## Credit and licence

The layout algorithm is a translation into TypeScript of code from kinship2:

> Sinnwell JP, Therneau TM, Schaid DJ. The kinship2 R package for pedigree
> data. Human Heredity. 2014;78(2):91-93. doi:10.1159/000363105

kinship2 is copyright its authors and licensed GPL (version 2 or later). If
you publish figures laid out with this package, please cite their paper.

This package is licensed under the GNU Affero General Public License,
version 3 or (at your option) any later version (`AGPL-3.0-or-later`), the
licence of the PedEdit repository; the full text is in `LICENSE`. The code derived from kinship2 is used under version 3
of the GPL, which allows it to be combined with work under the AGPL
(section 13 of both licences). The AGPL is a copyleft licence: read it
before using this package in software you distribute, or offer over a
network, under other terms.

Bugs and questions: https://github.com/SACGF/pededit/issues
