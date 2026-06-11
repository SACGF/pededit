import type { Pedigree, Individual } from "@pedigree-editor/layout-engine";
import { deidentify } from "./deidentify";
import type { SvgExportOptions } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// U-shape (horseshoe / "house of parliament") pedigree export.
//
// Blood descendants only are drawn (married-in spouses are removed, which is
// what makes the horseshoe readable).
//
// Model: the blood tree is laid out as a tidy tree, then bent around a U-shaped
// spine (two vertical arms + a semicircular bottom). The youngest generation
// sits on the outer rim; each older generation is offset inward (toward the U
// interior) by a fixed step, so the founder ends up in the centre of the U
// opening with its descent line pointing down, and the family wraps around the
// horseshoe. This keeps the arms parallel (unlike a radial fan) and generalises
// to arbitrary branching because placement along the rim is just an in-order
// leaf ordering. y grows downward (SVG); the opening is at the top.
// ─────────────────────────────────────────────────────────────────────────────

// ── Layout constants ──────────────────────────────────────────────────────────
const RING_GAP = 66;        // perpendicular (inward) distance between generations
const MIN_LEAF_ARC = 58;    // min spacing between nodes along the rim
const ARM_RATIO = 1.7;      // arm height as a multiple of the curve radius
const INNER_PAD = 34;       // curve radius slack so the founder ring stays open
const MIN_W = 90;           // min half-width (curve radius / half arm separation)
const COUPLE_GAP = 44;      // founder couple horizontal separation

const NODE_SIZE = 40;
const STROKE = 2;
const DECEASED_OVERHANG = 4;
const PROBAND_TAIL = 18;
const LABEL_FONT_SIZE = 10;
const LABEL_LINE_HEIGHT = 13;
const LABEL_OFFSET_Y = NODE_SIZE / 2 + 12;
const CONSANG_OFFSET = 4;
const PADDING = 48;

// ── Types ────────────────────────────────────────────────────────────────────

interface Pos { x: number; y: number; }

interface TreeNode {
  id: string;
  depth: number;       // tree depth; 0 = founder
  children: string[];  // assigned blood children (forms a tree even with loops)
  frac: number;        // position along the rim, 0 = left tip … 1 = right tip
}

interface BloodTree {
  nodes: Map<string, TreeNode>;
  rootMale: string;
  rootFemale: string;
  rootPartnership?: string;
  consang: boolean;     // founder partnership is consanguineous
}

// ── Generation assignment (longest path from a founder) ───────────────────────

function computeGenerations(pedigree: Pedigree): Map<string, number> {
  const childToPartnership = new Map<string, string>();
  for (const [pid, children] of Object.entries(pedigree.parentOf)) {
    for (const cid of children) childToPartnership.set(cid, pid);
  }

  const gen = new Map<string, number>();
  for (const ind of pedigree.individuals) {
    if (!childToPartnership.has(ind.id)) gen.set(ind.id, 0);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, children] of Object.entries(pedigree.parentOf)) {
      const partnership = pedigree.partnerships.find(p => p.id === pid);
      if (!partnership) continue;
      const g1 = gen.get(partnership.individual1);
      const g2 = gen.get(partnership.individual2);
      if (g1 === undefined || g2 === undefined) continue;
      const parentGen = Math.max(g1, g2);
      for (const cid of children) {
        const existing = gen.get(cid);
        if (existing === undefined || existing < parentGen + 1) {
          gen.set(cid, parentGen + 1);
          changed = true;
        }
      }
    }
  }
  return gen;
}

function countDescendants(pedigree: Pedigree, partnershipId: string, seen: Set<string>): number {
  let count = 0;
  for (const cid of pedigree.parentOf[partnershipId] || []) {
    if (seen.has(cid)) continue;
    seen.add(cid);
    count++;
    for (const p of pedigree.partnerships) {
      if (p.individual1 === cid || p.individual2 === cid) {
        count += countDescendants(pedigree, p.id, seen);
      }
    }
  }
  return count;
}

// ── Blood-descendant tree extraction ──────────────────────────────────────────

function buildBloodTree(pedigree: Pedigree): BloodTree {
  const gen = computeGenerations(pedigree);

  // Pick the founder partnership: both partners generation 0, with children,
  // and the most descendants. Fall back to any partnership with children.
  let rootPid: string | undefined;
  let bestCount = -1;
  for (const p of pedigree.partnerships) {
    const hasKids = (pedigree.parentOf[p.id] || []).length > 0;
    if (!hasKids) continue;
    const founders = gen.get(p.individual1) === 0 && gen.get(p.individual2) === 0;
    const count = countDescendants(pedigree, p.id, new Set());
    // Prefer founder couples; among those (or otherwise), prefer more descendants.
    const score = (founders ? 1_000_000 : 0) + count;
    if (score > bestCount) {
      bestCount = score;
      rootPid = p.id;
    }
  }

  if (!rootPid) {
    // No partnership with children: just the founder (single) or a childless
    // couple. Seed a lone founder node so the layout has a valid root.
    const first = pedigree.individuals[0];
    const rootMale = first?.id || "";
    const nodes = new Map<string, TreeNode>();
    if (rootMale) nodes.set(rootMale, { id: rootMale, depth: 0, children: [], frac: 0.5 });
    return {
      nodes,
      rootMale,
      rootFemale: pedigree.individuals[1]?.id || first?.id || "",
      consang: false,
    };
  }

  const rootP = pedigree.partnerships.find(p => p.id === rootPid)!;
  const ind1 = pedigree.individuals.find(i => i.id === rootP.individual1);
  const rootMale = ind1?.sex === "male" ? rootP.individual1 : rootP.individual2;
  const rootFemale = ind1?.sex === "male" ? rootP.individual2 : rootP.individual1;

  const sibOrderOf = (id: string) =>
    pedigree.individuals.find(i => i.id === id)?.sibOrder ?? 0;

  // Collect the blood children of an individual across all their partnerships.
  const childrenOf = (id: string): string[] => {
    const kids: string[] = [];
    for (const p of pedigree.partnerships) {
      if (p.individual1 === id || p.individual2 === id) {
        for (const c of pedigree.parentOf[p.id] || []) kids.push(c);
      }
    }
    return kids;
  };

  // BFS from the founder. A child is attached to whichever blood parent reaches
  // it first, so consanguineous loops still yield a single spanning tree.
  const nodes = new Map<string, TreeNode>();
  const assigned = new Set<string>([rootMale, rootFemale]);
  nodes.set(rootMale, { id: rootMale, depth: 0, children: [], frac: 0 });

  const queue: string[] = [rootMale];
  // Seed with the founder partnership's children explicitly (the founder node
  // represents the couple, so use the couple's children directly).
  const seedKids = [...new Set(pedigree.parentOf[rootPid] || [])]
    .sort((a, b) => sibOrderOf(a) - sibOrderOf(b));
  const rootNode = nodes.get(rootMale)!;
  for (const kid of seedKids) {
    if (assigned.has(kid)) continue;
    assigned.add(kid);
    nodes.set(kid, { id: kid, depth: 1, children: [], frac: 0 });
    rootNode.children.push(kid);
    queue.push(kid);
  }

  let head = 1; // rootMale already processed via seed
  while (head < queue.length) {
    const id = queue[head++];
    const node = nodes.get(id)!;
    const kids = [...new Set(childrenOf(id))]
      .filter(c => !assigned.has(c))
      .sort((a, b) => sibOrderOf(a) - sibOrderOf(b));
    for (const kid of kids) {
      assigned.add(kid);
      nodes.set(kid, { id: kid, depth: node.depth + 1, children: [], frac: 0 });
      node.children.push(kid);
      queue.push(kid);
    }
  }

  return {
    nodes,
    rootMale,
    rootFemale,
    rootPartnership: rootPid,
    consang: !!rootP.consanguineous,
  };
}

// ── Rim ordering (in-order leaf placement) ────────────────────────────────────

/**
 * Assign each node a fractional rim position in [0,1] via an in-order DFS:
 * leaves are spread evenly along the rim, internal nodes are centred over their
 * descendants. Returns the leaf count and the deepest generation.
 */
function assignFractions(tree: BloodTree): { leafCount: number; maxDepth: number } {
  const root = tree.rootMale;
  const leaves: string[] = [];
  let maxDepth = 0;

  const collect = (id: string) => {
    const n = tree.nodes.get(id)!;
    maxDepth = Math.max(maxDepth, n.depth);
    if (n.children.length === 0) { leaves.push(id); return; }
    for (const c of n.children) collect(c);
  };
  collect(root);

  const N = Math.max(1, leaves.length);
  leaves.forEach((id, i) => { tree.nodes.get(id)!.frac = (i + 0.5) / N; });

  const setFrac = (id: string): number => {
    const n = tree.nodes.get(id)!;
    if (n.children.length === 0) return n.frac;
    let sum = 0;
    for (const c of n.children) sum += setFrac(c);
    n.frac = sum / n.children.length;
    return n.frac;
  };
  setFrac(root);

  return { leafCount: N, maxDepth };
}

// ── U-spine geometry ──────────────────────────────────────────────────────────

interface Geom { W: number; armH: number; L: number; curveLen: number; }

function computeGeom(leafCount: number, maxDepth: number): Geom {
  // Curve radius W must clear the deepest inward offset so no inner ring inverts
  // through the centre (the founder, at maxDepth·gap inward, sits just inside).
  const wDepth = maxDepth * RING_GAP + INNER_PAD;
  // Rim length must also hold every leaf at MIN_LEAF_ARC spacing: L = (2·ratio+π)·W.
  const k = 2 * ARM_RATIO + Math.PI;
  const wLeaves = (MIN_LEAF_ARC * leafCount) / k;
  const W = Math.max(MIN_W, wDepth, wLeaves);
  const armH = ARM_RATIO * W;
  const curveLen = Math.PI * W;
  return { W, armH, L: 2 * armH + curveLen, curveLen };
}

interface SpinePoint { x: number; y: number; nx: number; ny: number; } // nx,ny = inward normal

/** Point on the rim at arc-length s (0 = left tip), plus the inward normal. */
function spineAt(s: number, g: Geom): SpinePoint {
  const { W, armH, curveLen } = g;
  if (s <= armH) {
    // Left arm: top tip (s=0) down to the curve junction (s=armH).
    return { x: -W, y: -armH + s, nx: 1, ny: 0 };
  } else if (s <= armH + curveLen) {
    // Bottom semicircle, centred on the origin, radius W.
    const phi = (s - armH) / W;          // 0 … π
    const x = -W * Math.cos(phi);
    const y = W * Math.sin(phi);
    return { x, y, nx: -x / W, ny: -y / W };
  } else {
    // Right arm: junction (y=0) up to the right tip.
    const u = s - (armH + curveLen);     // 0 … armH
    return { x: W, y: -u, nx: -1, ny: 0 };
  }
}

/** Final position of a node: on its rim slot, offset inward by its generation. */
function nodePos(frac: number, depth: number, g: Geom, maxDepth: number): Pos {
  const sp = spineAt(frac * g.L, g);
  const inward = (maxDepth - depth) * RING_GAP;
  return { x: sp.x + sp.nx * inward, y: sp.y + sp.ny * inward };
}

function assignPositions(tree: BloodTree, g: Geom, maxDepth: number): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  for (const node of tree.nodes.values()) {
    if (node.depth === 0) continue;
    pos.set(node.id, nodePos(node.frac, node.depth, g, maxDepth));
  }
  // Founder couple straddle the founder's rim slot, side by side.
  const f = nodePos(tree.nodes.get(tree.rootMale)!.frac, 0, g, maxDepth);
  pos.set(tree.rootMale, { x: f.x - COUPLE_GAP / 2, y: f.y });
  if (tree.rootFemale && tree.rootFemale !== tree.rootMale) {
    pos.set(tree.rootFemale, { x: f.x + COUPLE_GAP / 2, y: f.y });
  }
  return pos;
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

function r(n: number): number { return Math.round(n * 10) / 10; }

function seg(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="black" stroke-width="${STROKE}"/>`;
}

/**
 * A polyline following the inward-offset rim curve between two fractional
 * positions, at a given generation depth. Used for sibship bars so they hug the
 * U on the curved bottom and stay straight on the arms.
 */
function offsetCurvePath(f1: number, f2: number, depth: number, g: Geom, maxDepth: number): string {
  const span = Math.abs(f2 - f1) * g.L;
  const steps = Math.max(1, Math.ceil(span / 16));
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = f1 + ((f2 - f1) * i) / steps;
    const p = nodePos(f, depth, g, maxDepth);
    pts.push(`${r(p.x)},${r(p.y)}`);
  }
  return `<polyline points="${pts.join(" ")}" fill="none" stroke="black" stroke-width="${STROKE}"/>`;
}

function svgDefs(): string {
  return `<defs>
  <marker id="proband-arrowhead" markerWidth="6" markerHeight="6"
          refX="6" refY="3" orient="auto">
    <path d="M 0 0 L 6 3 L 0 6 Z" fill="black"/>
  </marker>
</defs>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderShape(ind: Individual): string {
  const half = NODE_SIZE / 2;
  const fill = ind.affected ? "black" : "white";
  let shape: string;
  if (ind.sex === "male") {
    shape = `<rect x="${-half}" y="${-half}" width="${NODE_SIZE}" height="${NODE_SIZE}" stroke="black" stroke-width="${STROKE}" fill="${fill}"/>`;
  } else if (ind.sex === "female") {
    shape = `<circle cx="0" cy="0" r="${half - 1}" stroke="black" stroke-width="${STROKE}" fill="${fill}"/>`;
  } else {
    const pts = `0,${-(half - 1)} ${half - 1},0 0,${half - 1} ${-(half - 1)},0`;
    shape = `<polygon points="${pts}" stroke="black" stroke-width="${STROKE}" fill="${fill}"/>`;
  }
  let overlay = "";
  if (ind.carrier && !ind.affected) {
    const dot = NODE_SIZE * 0.15;
    overlay = `<circle cx="0" cy="0" r="${dot}" fill="black"/>`;
  }
  return shape + overlay;
}

function renderDeceasedSlash(): string {
  const o = DECEASED_OVERHANG;
  const half = NODE_SIZE / 2;
  return `<line x1="${-half - o}" y1="${-half - o}" x2="${half + o}" y2="${half + o}" stroke="black" stroke-width="${STROKE}"/>`;
}

function renderProbandArrow(): string {
  const half = NODE_SIZE / 2;
  const tipX = -half, tipY = -half;
  const tailX = tipX - PROBAND_TAIL, tailY = tipY - PROBAND_TAIL;
  return `<line x1="${tailX}" y1="${tailY}" x2="${tipX}" y2="${tipY}" stroke="black" stroke-width="${STROKE}" marker-end="url(#proband-arrowhead)"/>`;
}

// ── Connectors ────────────────────────────────────────────────────────────────

function renderConnectors(tree: BloodTree, pos: Map<string, Pos>, g: Geom, maxDepth: number): string[] {
  const lines: string[] = [];

  // Founder couple line (double if consanguineous).
  const mPos = pos.get(tree.rootMale);
  const fPos = pos.get(tree.rootFemale);
  if (mPos && fPos && tree.rootMale !== tree.rootFemale) {
    if (tree.consang) {
      lines.push(seg(mPos.x, mPos.y - CONSANG_OFFSET / 2, fPos.x, fPos.y - CONSANG_OFFSET / 2));
      lines.push(seg(mPos.x, mPos.y + CONSANG_OFFSET / 2, fPos.x, fPos.y + CONSANG_OFFSET / 2));
    } else {
      lines.push(seg(mPos.x, mPos.y, fPos.x, fPos.y));
    }
  }

  for (const node of tree.nodes.values()) {
    if (node.children.length === 0) continue;

    const childDepth = node.depth + 1;
    const childFracs = node.children.map(c => tree.nodes.get(c)!.frac);
    const fMin = Math.min(...childFracs);
    const fMax = Math.max(...childFracs);

    // Descent line: from the parent (couple midpoint for the founder) inward-
    // out to the children's generation level, at the parent's rim slot.
    const start = node.depth === 0
      ? nodePos(node.frac, 0, g, maxDepth)
      : pos.get(node.id)!;
    const sibAttach = nodePos(node.frac, childDepth, g, maxDepth);
    lines.push(seg(start.x, start.y, sibAttach.x, sibAttach.y));

    // Sibship bar: the offset rim curve at the children's level, joining them.
    if (node.children.length > 1) {
      lines.push(offsetCurvePath(fMin, fMax, childDepth, g, maxDepth));
    }
  }

  return lines;
}

// ── Symbols + labels ──────────────────────────────────────────────────────────

function renderSymbols(pedigree: Pedigree, pos: Map<string, Pos>, ids: Set<string>): string[] {
  const elems: string[] = [];
  for (const ind of pedigree.individuals) {
    if (!ids.has(ind.id)) continue;
    const p = pos.get(ind.id);
    if (!p) continue;
    elems.push(`<g transform="translate(${r(p.x)} ${r(p.y)})">`);
    elems.push(renderShape(ind));
    if (ind.deceased) elems.push(renderDeceasedSlash());
    if (ind.proband) elems.push(renderProbandArrow());
    elems.push(`</g>`);
  }
  return elems;
}

function renderLabels(pedigree: Pedigree, pos: Map<string, Pos>, ids: Set<string>): string[] {
  const elems: string[] = [];
  for (const ind of pedigree.individuals) {
    if (!ids.has(ind.id)) continue;
    const p = pos.get(ind.id);
    if (!p) continue;
    const baseY = r(p.y + LABEL_OFFSET_Y);
    if (ind.name) {
      elems.push(
        `<text x="${r(p.x)}" y="${baseY}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${escapeXml(ind.name)}</text>`,
      );
    }
    if (ind.dob) {
      const dobY = r(baseY + (ind.name ? LABEL_LINE_HEIGHT : 0));
      elems.push(
        `<text x="${r(p.x)}" y="${dobY}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${escapeXml(ind.dob)}</text>`,
      );
    }
  }
  return elems;
}

// ── Debug spine (the invisible rim curves made visible) ───────────────────────

function renderDebugRings(maxDepth: number, g: Geom): string {
  const lines: string[] = [];
  for (let d = 0; d <= maxDepth; d++) {
    lines.push(
      offsetCurvePath(0, 1, d, g, maxDepth)
        .replace('stroke="black"', 'stroke="red"')
        .replace(`stroke-width="${STROKE}"`, 'stroke-width="0.75" stroke-dasharray="4 3"'),
    );
  }
  return lines.join("\n");
}

// ── Bounds ────────────────────────────────────────────────────────────────────

interface Bounds { offsetX: number; offsetY: number; width: number; height: number; }

function computeBounds(pos: Map<string, Pos>, ids: Set<string>): Bounds {
  const half = NODE_SIZE / 2;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const id of ids) {
    const p = pos.get(id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (minX === Infinity) { minX = maxX = minY = maxY = 0; }

  const labelPad = 28; // room for name/DOB under bottom row
  const probandPad = PROBAND_TAIL + 6;
  return {
    offsetX: PADDING + half + probandPad - minX,
    offsetY: PADDING + half + probandPad - minY,
    width: Math.ceil(maxX - minX + 2 * (PADDING + half) + 2 * probandPad),
    height: Math.ceil(maxY - minY + 2 * (PADDING + half) + probandPad + labelPad),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportUShapeSvg(
  pedigree: Pedigree,
  options: SvgExportOptions = {},
): string {
  if (pedigree.individuals.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect width="200" height="100" fill="white"/>
</svg>`;
  }

  const working = options.deidentify ? deidentify(pedigree, options) : pedigree;

  const tree = buildBloodTree(working);

  // Set of individuals we actually draw: founder couple + all blood descendants.
  const drawn = new Set<string>(tree.nodes.keys());
  drawn.add(tree.rootMale);
  if (tree.rootFemale) drawn.add(tree.rootFemale);

  const { leafCount, maxDepth } = assignFractions(tree);
  const geom = computeGeom(leafCount, maxDepth);
  const pos = assignPositions(tree, geom, maxDepth);

  const bounds = computeBounds(pos, drawn);
  const { offsetX, offsetY, width, height } = bounds;

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    svgDefs(),
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];

  if (options.title) {
    out.push(
      `<text x="${width / 2}" y="${PADDING - 8}" text-anchor="middle" ` +
      `font-family="sans-serif" font-size="14" font-weight="bold" ` +
      `fill="black">${escapeXml(options.title)}</text>`,
    );
  }

  out.push(`<g transform="translate(${r(offsetX)} ${r(offsetY)})">`);
  if (options.debugSpine && maxDepth > 0) {
    out.push(renderDebugRings(maxDepth, geom));
  }
  out.push(...renderConnectors(tree, pos, geom, maxDepth));
  out.push(...renderSymbols(working, pos, drawn));
  out.push(...renderLabels(working, pos, drawn));
  out.push(`</g>`);
  out.push(`</svg>`);

  return out.join("\n");
}
