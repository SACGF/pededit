import { alignPedigree } from "@pedigree-editor/layout-engine";
import type { Pedigree, LayoutResult, Individual } from "@pedigree-editor/layout-engine";
import { SLOT_WIDTH, ROW_HEIGHT, NODE_SIZE } from "../../pedigree/constants";
import { deidentify } from "./deidentify";
import type { SvgExportOptions } from "./types";

const STROKE = 2;
const CONSANG_GAP = 4;       // px gap between consanguineous double lines
const DECEASED_OVERHANG = 4; // matches DeceasedSlash in symbols.tsx
const PROBAND_TAIL = 18;     // matches ProbandArrow in symbols.tsx
const LABEL_FONT_SIZE = 10;
const LABEL_LINE_HEIGHT = 13;
const LABEL_OFFSET_Y = NODE_SIZE / 2 + 4; // below symbol centre

// ── Slot positions ────────────────────────────────────────────────────────────

type SlotPos = Map<string, { x: number; y: number }>;

/**
 * Build a map from "level-slot" → canvas pixel position.
 * Pinned individuals use their stored position; others use the algorithm result.
 */
function buildSlotPositions(pedigree: Pedigree, result: LayoutResult): SlotPos {
  const map: SlotPos = new Map();
  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const nid = Math.floor(result.nid[level][slot]);
      const ind = pedigree.individuals[nid - 1];
      const pinned = pedigree.pinnedPositions?.[ind.id];
      map.set(`${level}-${slot}`, pinned ?? {
        x: result.pos[level][slot] * SLOT_WIDTH,
        y: level * ROW_HEIGHT,
      });
    }
  }
  return map;
}

// ── Bounds ────────────────────────────────────────────────────────────────────

interface CanvasBounds {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

function computeBounds(
  pedigree: Pedigree,
  slotPos: SlotPos,
  options: SvgExportOptions,
): CanvasBounds {
  const padding = options.padding ?? 40;
  const titleHeight = options.title ? 24 : 0;

  let rawMinX = Infinity, rawMaxX = -Infinity;
  let rawMinY = Infinity, rawMaxY = -Infinity;
  for (const { x, y } of slotPos.values()) {
    if (x < rawMinX) rawMinX = x;
    if (x > rawMaxX) rawMaxX = x;
    if (y < rawMinY) rawMinY = y;
    if (y > rawMaxY) rawMaxY = y;
  }

  const hasProband = pedigree.individuals.some(i => i.proband);
  const probandExtra = hasProband ? PROBAND_TAIL + 4 : 0;

  const hasDob = pedigree.individuals.some(i => i.dob);
  const labelHeight = LABEL_OFFSET_Y + LABEL_LINE_HEIGHT + (hasDob ? LABEL_LINE_HEIGHT : 0);

  const offsetX = padding + NODE_SIZE / 2 + probandExtra - rawMinX;
  const offsetY = padding + NODE_SIZE / 2 + titleHeight - rawMinY;

  const contentW = rawMaxX - rawMinX + NODE_SIZE + probandExtra;
  const contentH = rawMaxY - rawMinY + NODE_SIZE + labelHeight + probandExtra;

  return {
    offsetX,
    offsetY,
    width:  Math.ceil(contentW + 2 * padding),
    height: Math.ceil(contentH + 2 * padding + titleHeight),
  };
}

// ── SVG defs ──────────────────────────────────────────────────────────────────

function svgDefs(): string {
  return `<defs>
  <marker id="proband-arrowhead" markerWidth="6" markerHeight="6"
          refX="6" refY="3" orient="auto">
    <path d="M 0 0 L 6 3 L 0 6 Z" fill="black"/>
  </marker>
</defs>`;
}

// ── Couple lines ──────────────────────────────────────────────────────────────

function renderCoupleLines(result: LayoutResult, slotPos: SlotPos): string[] {
  const lines: string[] = [];
  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level] - 1; slot++) {
      const sp = result.spouse[level][slot];
      if (sp === 0) continue;

      const left  = slotPos.get(`${level}-${slot}`)!;
      const right = slotPos.get(`${level}-${slot + 1}`)!;

      if (sp === 1) {
        lines.push(`<line x1="${left.x}" y1="${left.y}" x2="${right.x}" y2="${right.y}" stroke="black" stroke-width="${STROKE}"/>`);
      } else {
        // Consanguineous: two parallel lines offset perpendicular to the connecting vector
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len * (CONSANG_GAP / 2); // normal vector, scaled to half-gap
        const ny =  dx / len * (CONSANG_GAP / 2);
        lines.push(`<line x1="${left.x + nx}" y1="${left.y + ny}" x2="${right.x + nx}" y2="${right.y + ny}" stroke="black" stroke-width="${STROKE}"/>`);
        lines.push(`<line x1="${left.x - nx}" y1="${left.y - ny}" x2="${right.x - nx}" y2="${right.y - ny}" stroke="black" stroke-width="${STROKE}"/>`);
      }
    }
  }
  return lines;
}

// ── Sibship lines ─────────────────────────────────────────────────────────────

function seg(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${STROKE}"/>`;
}

function renderSibshipLines(result: LayoutResult, slotPos: SlotPos): string[] {
  const lines: string[] = [];

  for (let level = 1; level < result.n.length; level++) {
    const groups = new Map<number, number[]>();
    for (let slot = 0; slot < result.n[level]; slot++) {
      const f = result.fam[level][slot];
      if (f === 0) continue;
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f)!.push(slot);
    }

    for (const [f, slots] of groups) {
      const leftPos  = slotPos.get(`${level - 1}-${f - 1}`)!;
      const rightPos = slotPos.get(`${level - 1}-${f}`)!;
      const coupleX  = (leftPos.x + rightPos.x) / 2;
      const coupleY  = (leftPos.y + rightPos.y) / 2;
      const childY   = slotPos.get(`${level}-${slots[0]}`)!.y;
      const sibBarY  = (coupleY + childY) / 2;

      const childXs = slots.map(s => slotPos.get(`${level}-${s}`)!.x);
      const sibLeftX  = Math.min(...childXs);
      const sibRightX = Math.max(...childXs);

      // 1. Vertical drop from couple midpoint to sibship bar
      lines.push(seg(coupleX, coupleY, coupleX, sibBarY));
      // 2. Horizontal sibship bar
      lines.push(seg(sibLeftX, sibBarY, sibRightX, sibBarY));
      // 3. Vertical drops from bar to top of each child symbol
      for (const cx of childXs) {
        lines.push(seg(cx, sibBarY, cx, childY - NODE_SIZE / 2));
      }
    }
  }
  return lines;
}

// ── Symbols ───────────────────────────────────────────────────────────────────

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
  const tipX = -half, tipY = half;
  const tailX = tipX - PROBAND_TAIL, tailY = tipY + PROBAND_TAIL;
  return `<line x1="${tailX}" y1="${tailY}" x2="${tipX}" y2="${tipY}" stroke="black" stroke-width="${STROKE}" marker-end="url(#proband-arrowhead)"/>`;
}

function renderDuplicateMark(): string {
  const half = NODE_SIZE / 2;
  return `<text x="${half + 2}" y="${-half + 8}" font-family="sans-serif" font-size="9" fill="black">¹</text>`;
}

function renderSymbols(pedigree: Pedigree, result: LayoutResult, slotPos: SlotPos): string[] {
  const elems: string[] = [];
  const seen = new Set<number>();

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const nid = Math.floor(result.nid[level][slot]);
      const ind = pedigree.individuals[nid - 1];
      const { x: cx, y: cy } = slotPos.get(`${level}-${slot}`)!;
      const isDuplicate = seen.has(nid);
      seen.add(nid);

      elems.push(`<g transform="translate(${cx} ${cy})">`);
      elems.push(renderShape(ind));
      if (ind.deceased) elems.push(renderDeceasedSlash());
      if (ind.proband)  elems.push(renderProbandArrow());
      if (isDuplicate)  elems.push(renderDuplicateMark());
      elems.push(`</g>`);
    }
  }
  return elems;
}

// ── Labels ────────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderLabels(pedigree: Pedigree, result: LayoutResult, slotPos: SlotPos): string[] {
  const elems: string[] = [];
  const seen = new Set<number>();

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const nid = Math.floor(result.nid[level][slot]);
      if (seen.has(nid)) continue;
      seen.add(nid);

      const ind = pedigree.individuals[nid - 1];
      const { x: cx, y: cy } = slotPos.get(`${level}-${slot}`)!;
      const labelBaseY = cy + LABEL_OFFSET_Y;

      if (ind.name) {
        elems.push(`<text x="${cx}" y="${labelBaseY}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${escapeXml(ind.name)}</text>`);
      }
      if (ind.dob) {
        const dobY = labelBaseY + (ind.name ? LABEL_LINE_HEIGHT : 0);
        elems.push(`<text x="${cx}" y="${dobY}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${escapeXml(ind.dob)}</text>`);
      }
    }
  }
  return elems;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function exportSvg(pedigree: Pedigree, options: SvgExportOptions = {}): string {
  if (pedigree.individuals.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect width="200" height="100" fill="white"/>
</svg>`;
  }

  const working = options.deidentify ? deidentify(pedigree, options) : pedigree;
  const result  = alignPedigree(working);
  const slotPos = buildSlotPositions(working, result);
  const bounds  = computeBounds(working, slotPos, options);
  const { offsetX, offsetY, width, height } = bounds;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    svgDefs(),
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];

  if (options.title) {
    const padding = options.padding ?? 40;
    lines.push(
      `<text x="${width / 2}" y="${padding + 16}" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold" fill="black">${escapeXml(options.title)}</text>`,
    );
  }

  lines.push(`<g transform="translate(${offsetX} ${offsetY})">`);
  lines.push(...renderCoupleLines(result, slotPos));
  lines.push(...renderSibshipLines(result, slotPos));
  lines.push(...renderSymbols(working, result, slotPos));
  lines.push(...renderLabels(working, result, slotPos));
  lines.push(`</g>`);
  lines.push(`</svg>`);

  return lines.join("\n");
}
