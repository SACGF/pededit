import type { Pedigree, Individual } from "@pedigree-editor/layout-engine";
import { deidentify } from "./deidentify";
import type { SvgExportOptions } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// U-shape (horseshoe / "house of parliament") pedigree export.
//
// The founder couple sits at the bottom centre. Blood descendants only are
// drawn (married-in spouses are removed, which is what makes the horseshoe
// readable). Each generation is a concentric arc above the founder; a subtree
// is allocated an angular slice proportional to the number of leaf descendants
// it contains, so leaves end up evenly spread around the outer rim. Children of
// a blood ancestor fan out perpendicular to the ring (a radial spur from the
// parent to a sibship arc carrying the children).
//
// Orientation: angle 0 points straight DOWN (the founder's descent line); the
// fan wraps wide to both sides so the founder at radius 0 sits in the middle of
// the figure and the deepest generations form the horseshoe rim, with the gap
// (opening) at the top. y grows downward (SVG).
// ─────────────────────────────────────────────────────────────────────────────

// ── Layout constants ──────────────────────────────────────────────────────────
const HALF_SPAN = (145 * Math.PI) / 180; // half the fan; ~290° total, gap at top
const BASE_RING_GAP = 120;              // min radial distance between generations
const MIN_NODE_ARC = 64;                // min spacing between siblings on a ring
const COUPLE_GAP = 46;                  // founder couple horizontal separation

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
  weight: number;      // number of leaf descendants
  angle: number;       // radians, 0 = straight up
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
    const first = pedigree.individuals[0];
    return {
      nodes: new Map(),
      rootMale: first?.id || "",
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
  nodes.set(rootMale, { id: rootMale, depth: 0, children: [], weight: 1, angle: 0 });

  const queue: string[] = [rootMale];
  // Seed with the founder partnership's children explicitly (the founder node
  // represents the couple, so use the couple's children directly).
  const seedKids = [...new Set(pedigree.parentOf[rootPid] || [])]
    .sort((a, b) => sibOrderOf(a) - sibOrderOf(b));
  const rootNode = nodes.get(rootMale)!;
  for (const kid of seedKids) {
    if (assigned.has(kid)) continue;
    assigned.add(kid);
    nodes.set(kid, { id: kid, depth: 1, children: [], weight: 1, angle: 0 });
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
      nodes.set(kid, { id: kid, depth: node.depth + 1, children: [], weight: 1, angle: 0 });
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

// ── Weight + angular allocation ───────────────────────────────────────────────

function computeWeights(tree: BloodTree, rootMale: string): number {
  const node = tree.nodes.get(rootMale);
  if (!node) return 1;
  if (node.children.length === 0) {
    node.weight = 1;
    return 1;
  }
  let w = 0;
  for (const c of node.children) w += computeWeights(tree, c);
  node.weight = w;
  return w;
}

function allocateAngles(tree: BloodTree, id: string, lo: number, hi: number): void {
  const node = tree.nodes.get(id);
  if (!node) return;
  node.angle = (lo + hi) / 2;
  if (node.children.length === 0) return;
  const total = node.weight || 1;
  let a = lo;
  for (const c of node.children) {
    const cw = tree.nodes.get(c)!.weight;
    const span = (cw / total) * (hi - lo);
    allocateAngles(tree, c, a, a + span);
    a += span;
  }
}

/** Choose a radial gap so the narrowest node slice still clears MIN_NODE_ARC. */
function computeRingGap(tree: BloodTree, rootWeight: number): number {
  let gap = BASE_RING_GAP;
  const fullSpan = 2 * HALF_SPAN;
  for (const node of tree.nodes.values()) {
    if (node.depth < 1) continue;
    const sliceAngle = (node.weight / rootWeight) * fullSpan;
    if (sliceAngle <= 0) continue;
    // width at this ring = depth * gap * sliceAngle  ≥  MIN_NODE_ARC
    const need = MIN_NODE_ARC / (node.depth * sliceAngle);
    if (need > gap) gap = need;
  }
  return gap;
}

// ── Position assignment ───────────────────────────────────────────────────────

function assignPositions(tree: BloodTree, ringGap: number): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  // Founder couple at the bottom centre.
  pos.set(tree.rootMale, { x: -COUPLE_GAP / 2, y: 0 });
  if (tree.rootFemale && tree.rootFemale !== tree.rootMale) {
    pos.set(tree.rootFemale, { x: COUPLE_GAP / 2, y: 0 });
  }
  for (const node of tree.nodes.values()) {
    if (node.depth === 0) continue;
    const R = node.depth * ringGap;
    pos.set(node.id, { x: R * Math.sin(node.angle), y: R * Math.cos(node.angle) });
  }
  return pos;
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

function r(n: number): number { return Math.round(n * 10) / 10; }

function seg(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="black" stroke-width="${STROKE}"/>`;
}

function point(angle: number, R: number): Pos {
  // angle 0 = straight down; positive sweeps toward the right.
  return { x: R * Math.sin(angle), y: R * Math.cos(angle) };
}

/** Circular arc (centred on the origin) from angle a1 to a2 at radius R. */
function arcPath(a1: number, a2: number, R: number): string {
  const p1 = point(a1, R);
  const p2 = point(a2, R);
  const large = Math.abs(a2 - a1) > Math.PI ? 1 : 0;
  const sweep = a2 >= a1 ? 0 : 1; // increasing angle = counter-clockwise on screen
  return `<path d="M ${r(p1.x)} ${r(p1.y)} A ${r(R)} ${r(R)} 0 ${large} ${sweep} ${r(p2.x)} ${r(p2.y)}" fill="none" stroke="black" stroke-width="${STROKE}"/>`;
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

function renderConnectors(tree: BloodTree, pos: Map<string, Pos>, ringGap: number): string[] {
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

    const childRadius = (node.depth + 1) * ringGap;
    const childAngles = node.children.map(c => tree.nodes.get(c)!.angle);
    const aMin = Math.min(...childAngles);
    const aMax = Math.max(...childAngles);

    // Radial spur from the parent (or founder couple midpoint) out to the
    // children's ring, at the parent's angle.
    const start = node.depth === 0 ? { x: 0, y: 0 } : pos.get(node.id)!;
    const spurEnd = point(node.angle, childRadius);
    lines.push(seg(start.x, start.y, spurEnd.x, spurEnd.y));

    // Sibship arc joining the children along their ring.
    if (node.children.length > 1) {
      lines.push(arcPath(aMin, aMax, childRadius));
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

// ── Debug rings (the invisible spine made visible) ────────────────────────────

function renderDebugRings(maxDepth: number, ringGap: number): string {
  const lines: string[] = [];
  for (let g = 1; g <= maxDepth; g++) {
    const R = g * ringGap;
    const p1 = point(-HALF_SPAN, R);
    const p2 = point(HALF_SPAN, R);
    const large = 2 * HALF_SPAN > Math.PI ? 1 : 0;
    lines.push(
      `<path d="M ${r(p1.x)} ${r(p1.y)} A ${r(R)} ${r(R)} 0 ${large} 0 ${r(p2.x)} ${r(p2.y)}" fill="none" stroke="red" stroke-width="0.75" stroke-dasharray="4 3"/>`,
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

  const rootWeight = computeWeights(tree, tree.rootMale);
  allocateAngles(tree, tree.rootMale, -HALF_SPAN, HALF_SPAN);
  const ringGap = computeRingGap(tree, rootWeight);
  const pos = assignPositions(tree, ringGap);

  const maxDepth = Math.max(0, ...[...tree.nodes.values()].map(n => n.depth));
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
    out.push(renderDebugRings(maxDepth, ringGap));
  }
  out.push(...renderConnectors(tree, pos, ringGap));
  out.push(...renderSymbols(working, pos, drawn));
  out.push(...renderLabels(working, pos, drawn));
  out.push(`</g>`);
  out.push(`</svg>`);

  return out.join("\n");
}
