import type { Pedigree, Individual } from "@pedigree-editor/layout-engine";
import { deidentify } from "./deidentify";
import type { SvgExportOptions } from "./types";

// Controlled by SvgExportOptions.debugSpine at runtime

// ── Spine constants ──────────────────────────────────────────────────────────
const U_ROW_HEIGHT = 70;
const U_CHILD_VERT_SPACING = 60;
const U_CHILD_OUTWARD = 70;
const U_ARM_GAP = 200;
const U_PADDING = 60;
const COUPLE_GAP = 80;

const NODE_SIZE = 40;
const STROKE = 2;
const DECEASED_OVERHANG = 4;
const PROBAND_TAIL = 18;
const LABEL_FONT_SIZE = 10;
const LABEL_LINE_HEIGHT = 13;
const LABEL_OFFSET_Y = NODE_SIZE / 2 + 4;

// ── Types ────────────────────────────────────────────────────────────────────

interface SpinePoint {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
}

interface SpineConfig {
  leftStemX: number;
  rightStemX: number;
  foundersY: number;
  curveRadius: number;
}

interface NodePosition { x: number; y: number; }

interface BloodNode {
  id: string;
  generation: number;
  arm: "left" | "right" | "root";
  spouse?: string;
  spouseChildren: string[];
}

type BloodTree = Map<string, BloodNode>;

// ── Spine geometry ───────────────────────────────────────────────────────────
// Root couple at BOTTOM (positive y). Curve dips down from arm bases (y=0).
// Arms go UP (negative y) from arm bases.

function spinePoint(
  arcDist: number,
  arm: "left" | "right",
  config: SpineConfig,
): SpinePoint {
  const { leftStemX, rightStemX, foundersY, curveRadius } = config;
  const centreX = (leftStemX + rightStemX) / 2;
  const curveHalfArc = (Math.PI * curveRadius) / 2;

  if (arcDist <= curveHalfArc) {
    // On the curved portion at the bottom
    const theta = arcDist / curveRadius;
    const sign = arm === "left" ? -1 : 1;

    // Curve dips DOWN (positive y) from arm bases
    const x = centreX + sign * curveRadius * Math.sin(theta);
    const y = foundersY + curveRadius * Math.cos(theta);

    // Tangent: direction of increasing arc (toward arm tips = upward)
    const tx = sign * Math.cos(theta);
    const ty = -Math.sin(theta);

    // Normal: perpendicular, pointing outward from U centre
    const normalX = arm === "left" ? ty : -ty;
    const normalY = arm === "left" ? -tx : tx;

    return { x, y, tx, ty, nx: normalX, ny: normalY };
  } else {
    // Straight arm portion going UP (negative y)
    const straightDist = arcDist - curveHalfArc;
    const stemX = arm === "left" ? leftStemX : rightStemX;

    return {
      x: stemX,
      y: foundersY - straightDist,
      tx: 0,
      ty: -1,
      nx: arm === "left" ? -1 : 1,
      ny: 0,
    };
  }
}

// ── Blood tree extraction ────────────────────────────────────────────────────

function computeGenerations(pedigree: Pedigree): Map<string, number> {
  const childToPartnership = new Map<string, string>();
  for (const [pid, children] of Object.entries(pedigree.parentOf)) {
    for (const cid of children) {
      childToPartnership.set(cid, pid);
    }
  }

  const gen = new Map<string, number>();
  for (const ind of pedigree.individuals) {
    if (!childToPartnership.has(ind.id)) {
      gen.set(ind.id, 0);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, children] of Object.entries(pedigree.parentOf)) {
      const partnership = pedigree.partnerships.find(p => p.id === pid)!;
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

function findPartnershipWithChildren(pedigree: Pedigree, individualId: string): string | undefined {
  for (const p of pedigree.partnerships) {
    if (p.individual1 === individualId || p.individual2 === individualId) {
      if ((pedigree.parentOf[p.id] || []).length > 0) {
        return p.id;
      }
    }
  }
  return undefined;
}

function computeBloodSet(pedigree: Pedigree, rootMale: string, rootFemale: string): Set<string> {
  const blood = new Set<string>();
  blood.add(rootMale);
  blood.add(rootFemale);

  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, children] of Object.entries(pedigree.parentOf)) {
      const p = pedigree.partnerships.find(pp => pp.id === pid)!;
      if (blood.has(p.individual1) || blood.has(p.individual2)) {
        for (const cid of children) {
          if (!blood.has(cid)) {
            blood.add(cid);
            changed = true;
          }
        }
      }
    }
  }

  return blood;
}

function buildBloodTree(pedigree: Pedigree): {
  bloodTree: BloodTree;
  rootMale: string;
  rootFemale: string;
} {
  const gen = computeGenerations(pedigree);

  let rootPid: string | undefined;
  let bestDepth = -1;
  for (const p of pedigree.partnerships) {
    if (gen.get(p.individual1) === 0 && gen.get(p.individual2) === 0) {
      const children = pedigree.parentOf[p.id] || [];
      if (children.length > 0) {
        const depth = maxDescendantDepth(pedigree, p.id, gen);
        if (depth > bestDepth) {
          bestDepth = depth;
          rootPid = p.id;
        }
      }
    }
  }

  if (!rootPid) {
    for (const p of pedigree.partnerships) {
      if ((pedigree.parentOf[p.id] || []).length > 0) {
        rootPid = p.id;
        break;
      }
    }
  }

  if (!rootPid) {
    const first = pedigree.individuals[0];
    return {
      bloodTree: new Map(),
      rootMale: first?.id || "",
      rootFemale: pedigree.individuals[1]?.id || first?.id || "",
    };
  }

  const rootP = pedigree.partnerships.find(p => p.id === rootPid)!;
  const ind1 = pedigree.individuals.find(i => i.id === rootP.individual1)!;
  const rootMale = ind1.sex === "male" ? rootP.individual1 : rootP.individual2;
  const rootFemale = ind1.sex === "male" ? rootP.individual2 : rootP.individual1;

  const rootChildren = pedigree.parentOf[rootPid] || [];
  const bloodTree: BloodTree = new Map();

  bloodTree.set(rootMale, {
    id: rootMale, generation: 0, arm: "root",
    spouse: rootFemale, spouseChildren: rootChildren,
  });

  const leftStart = rootChildren[0];
  const rightStart = rootChildren.length > 1 ? rootChildren[1] : undefined;

  function processChain(startId: string, arm: "left" | "right") {
    let currentId: string | undefined = startId;
    let generation = 1;

    while (currentId) {
      const pid = findPartnershipWithChildren(pedigree, currentId);
      let spouse: string | undefined;
      let children: string[] = [];

      if (pid) {
        const p = pedigree.partnerships.find(pp => pp.id === pid)!;
        spouse = p.individual1 === currentId ? p.individual2 : p.individual1;
        children = pedigree.parentOf[pid] || [];
      }

      bloodTree.set(currentId, {
        id: currentId, generation, arm, spouse, spouseChildren: children,
      });

      currentId = undefined;
      for (const childId of children) {
        if (findPartnershipWithChildren(pedigree, childId)) {
          currentId = childId;
          break;
        }
      }
      generation++;
    }
  }

  if (leftStart) processChain(leftStart, "left");
  if (rightStart) processChain(rightStart, "right");

  return { bloodTree, rootMale, rootFemale };
}

function maxDescendantDepth(pedigree: Pedigree, partnershipId: string, gen: Map<string, number>): number {
  let maxD = 0;
  const children = pedigree.parentOf[partnershipId] || [];
  for (const cid of children) {
    const d = gen.get(cid) || 0;
    if (d > maxD) maxD = d;
    for (const p of pedigree.partnerships) {
      if (p.individual1 === cid || p.individual2 === cid) {
        const childDepth = maxDescendantDepth(pedigree, p.id, gen);
        if (childDepth > maxD) maxD = childDepth;
      }
    }
  }
  return maxD;
}

// ── Coordinate assignment ────────────────────────────────────────────────────

function assignCoordinates(
  pedigree: Pedigree,
  bloodTree: BloodTree,
  bloodSet: Set<string>,
  rootMale: string,
  rootFemale: string,
  config: SpineConfig,
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const curveHalfArc = (Math.PI * config.curveRadius) / 2;

  // Root couple on TOP of the curve at arm base level
  const centreX = (config.leftStemX + config.rightStemX) / 2;
  positions.set(rootMale, {
    x: centreX - COUPLE_GAP / 2,
    y: config.foundersY,
  });
  positions.set(rootFemale, {
    x: centreX + COUPLE_GAP / 2,
    y: config.foundersY,
  });

  // Place root couple's children
  const rootNode = bloodTree.get(rootMale);
  if (rootNode) {
    // Place spine children (on their arm)
    for (const childId of rootNode.spouseChildren) {
      if (!bloodSet.has(childId)) continue;
      const childBlood = bloodTree.get(childId);
      if (childBlood) {
        const arcDist = curveHalfArc + 1 * U_ROW_HEIGHT;
        const sp = spinePoint(arcDist, childBlood.arm as "left" | "right", config);
        positions.set(childId, { x: sp.x, y: sp.y });
      }
    }

    // Place non-spine children of root couple
    // Centered on root couple's y (foundersY), between the curve and gen 1
    const nonSpineRootChildren = rootNode.spouseChildren.filter(
      cid => bloodSet.has(cid) && !bloodTree.has(cid) && !positions.has(cid),
    );

    if (nonSpineRootChildren.length > 0) {
      // Place between root couple and gen 1, split between arms
      const leftChildren = nonSpineRootChildren.filter((_, i) => i % 2 === 0);
      const rightChildren = nonSpineRootChildren.filter((_, i) => i % 2 === 1);

      // y position: at arm base level (same y as root couple)
      const rootChildY = config.foundersY;

      for (const [children, stemX, nx] of [
        [leftChildren, config.leftStemX, -1],
        [rightChildren, config.rightStemX, 1],
      ] as const) {
        if (children.length === 0) continue;
        const totalHeight = (children.length - 1) * U_CHILD_VERT_SPACING;
        const startY = rootChildY - totalHeight / 2;
        for (let i = 0; i < children.length; i++) {
          positions.set(children[i], {
            x: stemX + nx * U_CHILD_OUTWARD,
            y: startY + i * U_CHILD_VERT_SPACING,
          });
        }
      }
    }
  }

  // Place blood descendants and their non-spine children
  for (const arm of ["left", "right"] as const) {
    const armNodes = [...bloodTree.values()]
      .filter(n => n.arm === arm)
      .sort((a, b) => a.generation - b.generation);

    for (const node of armNodes) {
      if (!positions.has(node.id)) {
        const arcDist = curveHalfArc + node.generation * U_ROW_HEIGHT;
        const sp = spinePoint(arcDist, arm, config);
        positions.set(node.id, { x: sp.x, y: sp.y });
      }

      // Non-spine children: centered vertically on parent's y,
      // outward offset increases with generation so levels don't overlap
      if (node.spouseChildren.length > 0) {
        const parentArc = curveHalfArc + node.generation * U_ROW_HEIGHT;
        const parentSpine = spinePoint(parentArc, arm, config);

        const nonSpineChildren = node.spouseChildren.filter(
          cid => bloodSet.has(cid) && !bloodTree.has(cid) && !positions.has(cid),
        );

        if (nonSpineChildren.length > 0) {
          const outward = (node.generation + 1) * U_CHILD_OUTWARD;
          const totalHeight = (nonSpineChildren.length - 1) * U_CHILD_VERT_SPACING;
          const startY = parentSpine.y - totalHeight / 2;

          for (let i = 0; i < nonSpineChildren.length; i++) {
            const childId = nonSpineChildren[i];
            positions.set(childId, {
              x: parentSpine.x + parentSpine.nx * outward,
              y: startY + i * U_CHILD_VERT_SPACING,
            });
          }
        }
      }
    }
  }

  return positions;
}

// ── Bounding box ─────────────────────────────────────────────────────────────

interface CanvasBounds { offsetX: number; offsetY: number; width: number; height: number; }

function computeUBounds(
  positions: Map<string, NodePosition>,
  bloodTree: BloodTree,
  config: SpineConfig,
): CanvasBounds {
  const padding = U_PADDING;
  const nodeHalf = NODE_SIZE / 2;

  const hasArmNodes = [...bloodTree.values()].some(n => n.arm === "left" || n.arm === "right");
  if (!hasArmNodes) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pos of positions.values()) {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    }
    if (minX === Infinity) { minX = maxX = minY = maxY = 0; }
    return {
      offsetX: padding + nodeHalf - minX,
      offsetY: padding + nodeHalf - minY,
      width: Math.ceil(maxX - minX + 2 * (padding + nodeHalf)),
      height: Math.ceil(maxY - minY + 2 * (padding + nodeHalf) + 30),
    };
  }

  // Top: highest arm tip (smallest y)
  const maxGen = Math.max(0, ...[...bloodTree.values()].map(n => n.generation));
  const curveHalfArc = (Math.PI * config.curveRadius) / 2;
  const topArcDist = curveHalfArc + (maxGen + 1) * U_ROW_HEIGHT;
  const topSpine = spinePoint(topArcDist, "left", config);
  const armTipY = topSpine.y;

  // Bottom: curve bottom (root couple area)
  const curveBottomY = config.foundersY + config.curveRadius;

  // Width: outermost positions
  let minX = Infinity, maxX = -Infinity;
  for (const pos of positions.values()) {
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
  }

  const labelExtra = 30;
  const probandExtra = PROBAND_TAIL + 4;

  return {
    offsetX: padding + nodeHalf + probandExtra - minX,
    offsetY: padding + nodeHalf - armTipY,
    width: Math.ceil(maxX - minX + 2 * (padding + nodeHalf) + probandExtra),
    height: Math.ceil(curveBottomY - armTipY + 2 * (padding + nodeHalf) + labelExtra),
  };
}

// ── Rendering helpers ────────────────────────────────────────────────────────

function r(n: number): number { return Math.round(n * 10) / 10; }

function seg(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="black" stroke-width="${STROKE}"/>`;
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
    const r = NODE_SIZE * 0.15;
    overlay = `<circle cx="0" cy="0" r="${r}" fill="black"/>`;
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
  // Standard rotated 90° CW: arrow at top-left pointing down-right toward symbol
  const tipX = -half, tipY = -half;
  const tailX = tipX - PROBAND_TAIL, tailY = tipY - PROBAND_TAIL;
  return `<line x1="${tailX}" y1="${tailY}" x2="${tipX}" y2="${tipY}" stroke="black" stroke-width="${STROKE}" marker-end="url(#proband-arrowhead)"/>`;
}

// ── Debug spine ──────────────────────────────────────────────────────────────

function renderDebugSpine(config: SpineConfig, maxGen: number, show: boolean): string {
  if (!show) return "";
  const curveHalfArc = (Math.PI * config.curveRadius) / 2;
  const maxArc = curveHalfArc + (maxGen + 1) * U_ROW_HEIGHT;
  const steps = 60;
  const lines: string[] = [];

  for (const arm of ["left", "right"] as const) {
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const arc = (i / steps) * maxArc;
      const sp = spinePoint(arc, arm, config);
      points.push(`${sp.x.toFixed(1)},${sp.y.toFixed(1)}`);
    }
    lines.push(
      `<polyline points="${points.join(" ")}" fill="none" stroke="red" stroke-width="1" stroke-dasharray="4 2"/>`,
    );

    for (let gen = 0; gen <= maxGen + 1; gen++) {
      const arc = gen === 0 ? 0 : curveHalfArc + gen * U_ROW_HEIGHT;
      if (arc > maxArc) break;
      const sp = spinePoint(arc, arm, config);
      const tickLen = 15;
      lines.push(
        `<line x1="${sp.x}" y1="${sp.y}" x2="${sp.x + sp.nx * tickLen}" y2="${sp.y + sp.ny * tickLen}" stroke="blue" stroke-width="0.5"/>`,
      );
    }
  }
  return lines.join("\n");
}

// ── Backbone rendering ──────────────────────────────────────────────────────

function renderUBackbone(
  positions: Map<string, NodePosition>,
  bloodTree: BloodTree,
  config: SpineConfig,
): string[] {
  const lines: string[] = [];
  const { leftStemX, rightStemX, foundersY, curveRadius } = config;

  const hasArmNodes = [...bloodTree.values()].some(n => n.arm === "left" || n.arm === "right");
  if (!hasArmNodes) return lines;

  // Semicircular curve at the bottom connecting the two arm bases
  // sweep=0 (CCW on screen) = curve dips DOWN
  lines.push(
    `<path d="M ${leftStemX} ${foundersY} A ${curveRadius} ${curveRadius} 0 0 0 ${rightStemX} ${foundersY}" ` +
    `fill="none" stroke="black" stroke-width="${STROKE}"/>`,
  );

  // Vertical connector from root couple midpoint down to curve bottom
  const centreX = (leftStemX + rightStemX) / 2;
  const curveBottomY = foundersY + curveRadius;
  lines.push(seg(centreX, foundersY, centreX, curveBottomY));

  // Vertical arm segments going UP (negative y)
  for (const arm of ["left", "right"] as const) {
    const armNodes = [...bloodTree.values()]
      .filter(n => n.arm === arm)
      .sort((a, b) => a.generation - b.generation);

    const stemX = arm === "left" ? leftStemX : rightStemX;
    let prevY = foundersY;

    for (const node of armNodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;
      if (Math.abs(pos.y - prevY) > 1) {
        lines.push(seg(stemX, prevY, stemX, pos.y));
      }
      prevY = pos.y;
    }

    // No backbone extension needed: child connectors handle
    // the vertical drop from spine to children's y level
  }

  return lines;
}

// ── Root couple line ─────────────────────────────────────────────────────────

function renderRootCoupleLine(
  positions: Map<string, NodePosition>,
  rootMale: string,
  rootFemale: string,
): string[] {
  if (rootMale === rootFemale) return [];
  const mPos = positions.get(rootMale);
  const fPos = positions.get(rootFemale);
  if (!mPos || !fPos) return [];
  if (Math.hypot(mPos.x - fPos.x, mPos.y - fPos.y) < 1) return [];
  return [seg(mPos.x, mPos.y, fPos.x, fPos.y)];
}

// ── Child connector lines ───────────────────────────────────────────────────

function renderChildConnectors(
  positions: Map<string, NodePosition>,
  bloodTree: BloodTree,
  bloodSet: Set<string>,
  config: SpineConfig,
): string[] {
  const lines: string[] = [];
  const renderedChildren = new Set<string>();

  for (const [id, node] of bloodTree) {
    if (node.arm === "root") continue;
    if (node.spouseChildren.length === 0) continue;
    const parentPos = positions.get(id);
    if (!parentPos) continue;

    const childrenKey = node.spouseChildren.join(",");
    if (renderedChildren.has(childrenKey)) continue;
    renderedChildren.add(childrenKey);

    const stemX = node.arm === "left" ? config.leftStemX : config.rightStemX;

    const placedChildren = node.spouseChildren
      .filter(cid => bloodSet.has(cid) && !bloodTree.has(cid) && positions.has(cid))
      .map(cid => positions.get(cid)!);

    if (placedChildren.length === 0) continue;

    // Children are centered vertically on parent's y, at a fixed outward x
    const barX = placedChildren[0].x; // all at same x
    const ys = placedChildren.map(p => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Horizontal stem from parent on spine outward to the bar
    lines.push(seg(stemX, parentPos.y, barX, parentPos.y));

    // Vertical sibship bar connecting children
    if (placedChildren.length > 1) {
      lines.push(seg(barX, minY, barX, maxY));
    }
  }

  // Root couple's non-spine children connectors
  const rootNode = [...bloodTree.values()].find(n => n.arm === "root");
  if (rootNode) {
    for (const arm of ["left", "right"] as const) {
      const stemX = arm === "left" ? config.leftStemX : config.rightStemX;
      const armChildren = rootNode.spouseChildren
        .filter(cid => bloodSet.has(cid) && !bloodTree.has(cid) && positions.has(cid))
        .map(cid => positions.get(cid)!)
        .filter(p => arm === "left" ? p.x < stemX : p.x > stemX);

      if (armChildren.length === 0) continue;

      const barX = armChildren[0].x;
      const ys = armChildren.map(p => p.y);
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;

      // Horizontal stem from arm base outward to bar
      lines.push(seg(stemX, midY, barX, midY));

      // Vertical sibship bar
      if (armChildren.length > 1) {
        lines.push(seg(barX, Math.min(...ys), barX, Math.max(...ys)));
      }
    }
  }

  return lines;
}

// ── Symbol rendering (blood only) ────────────────────────────────────────────

function renderUSymbols(
  pedigree: Pedigree,
  positions: Map<string, NodePosition>,
  bloodSet: Set<string>,
  config: SpineConfig,
): string[] {
  const elems: string[] = [];
  for (const ind of pedigree.individuals) {
    if (!bloodSet.has(ind.id)) continue;
    const pos = positions.get(ind.id);
    if (!pos) continue;
    elems.push(`<g transform="translate(${r(pos.x)} ${r(pos.y)})">`);
    elems.push(renderShape(ind));
    if (ind.deceased) elems.push(renderDeceasedSlash());
    if (ind.proband) elems.push(renderProbandArrow());
    elems.push(`</g>`);
  }
  return elems;
}

// ── Label rendering (blood only) ─────────────────────────────────────────────

function renderULabels(
  pedigree: Pedigree,
  positions: Map<string, NodePosition>,
  bloodSet: Set<string>,
): string[] {
  const elems: string[] = [];
  for (const ind of pedigree.individuals) {
    if (!bloodSet.has(ind.id)) continue;
    const pos = positions.get(ind.id);
    if (!pos) continue;
    const labelBaseY = r(pos.y + LABEL_OFFSET_Y);
    if (ind.name) {
      elems.push(
        `<text x="${r(pos.x)}" y="${labelBaseY}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${escapeXml(ind.name)}</text>`,
      );
    }
    if (ind.dob) {
      const dobY = r(labelBaseY + (ind.name ? LABEL_LINE_HEIGHT : 0));
      elems.push(
        `<text x="${r(pos.x)}" y="${dobY}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${escapeXml(ind.dob)}</text>`,
      );
    }
  }
  return elems;
}

// ── Main export function ─────────────────────────────────────────────────────

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

  const { bloodTree, rootMale, rootFemale } = buildBloodTree(working);
  const bloodSet = computeBloodSet(working, rootMale, rootFemale);

  const config: SpineConfig = {
    leftStemX: U_PADDING + 200,
    rightStemX: U_PADDING + 200 + U_ARM_GAP,
    foundersY: 0,
    curveRadius: U_ARM_GAP / 2,
  };

  const positions = assignCoordinates(working, bloodTree, bloodSet, rootMale, rootFemale, config);
  const maxGen = Math.max(0, ...[...bloodTree.values()].map(n => n.generation));
  const bounds = computeUBounds(positions, bloodTree, config);
  const { offsetX, offsetY, width, height } = bounds;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    svgDefs(),
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];

  if (options.title) {
    lines.push(
      `<text x="${width / 2}" y="${U_PADDING + 16}" text-anchor="middle" ` +
      `font-family="sans-serif" font-size="14" font-weight="bold" ` +
      `fill="black">${escapeXml(options.title)}</text>`,
    );
  }

  lines.push(`<g transform="translate(${offsetX} ${offsetY})">`);

  const hasArmNodes = [...bloodTree.values()].some(n => n.arm === "left" || n.arm === "right");
  if (hasArmNodes) {
    lines.push(renderDebugSpine(config, maxGen, !!options.debugSpine));
  }

  lines.push(...renderUBackbone(positions, bloodTree, config));
  lines.push(...renderChildConnectors(positions, bloodTree, bloodSet, config));
  lines.push(...renderRootCoupleLine(positions, rootMale, rootFemale));
  lines.push(...renderUSymbols(working, positions, bloodSet, config));
  lines.push(...renderULabels(working, positions, bloodSet));

  lines.push(`</g>`);
  lines.push(`</svg>`);

  return lines.join("\n");
}
