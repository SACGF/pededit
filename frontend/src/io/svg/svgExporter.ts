import { alignPedigreeByFamily, buildPartnerSetFromPedigree, resolveCouple } from "@pedigree-editor/layout-engine";
import type { Pedigree, LayoutResult, Individual, PartnerSet } from "@pedigree-editor/layout-engine";
import { NODE_SIZE } from "../../pedigree/constants";
import { couplePathD, consanguineousPathsD, duplicateArcD, hopGeometry } from "../../pedigree/couplePath";
import { sibshipPaths, twinForkMarks } from "../../pedigree/sibshipPath";
import { twinMembership, TWIN_QUESTION_FONT_SIZE } from "../../pedigree/twins";
import { wrapLabel, labelMaxWidth, LABEL_FONT_SIZE } from "../../pedigree/labels";
import { layoutSpacing } from "../../pedigree/spacing";
import { adoptionBracketSegments, ADOPTION_DASH } from "../../pedigree/adoption";
import { activeChildless, childlessMarkSegments, childlessReasonBaselineY, CHILDLESS_REASON_FONT_SIZE } from "../../pedigree/childless";
import { layoutToFlow } from "../../pedigree/layoutToFlow";
import { consanguinityTest } from "../../pedigree/consanguinity";
import type { FlowData } from "../../pedigree/layoutToFlow";
import { deidentify } from "./deidentify";
import type { SvgExportOptions } from "./types";
import {
  renderSectorsSvg, renderAnnotationRowSvg, renderExportKeySvg,
  needsAffectedCore, renderAffectedCoreSvg,
  hasAnnotationRow, sectorsFor, ANNOTATION_ROW_HEIGHT,
} from "../../pedigree/tags";
import {
  usesLossTriangle, lifeStatusCaption, CAPTION_FONT_SIZE,
  lossTrianglePoints, lossSlashEnds, pregnancyFontSize, pregnancyBaselineY,
  carrierDot, symbolTopInset, CAPTION_ROW_HEIGHT, CARRIER_RIM,
} from "../../pedigree/lifeStatus";

const STROKE = 2;
const CONSANG_GAP = 4;       // px gap between consanguineous double lines
const DECEASED_OVERHANG = 4; // matches DeceasedSlash in symbols.tsx
const PROBAND_TAIL = 18;     // matches ProbandArrow in symbols.tsx
const LABEL_LINE_HEIGHT = 13;
// Baseline of the first line under the symbol, below its centre. Leaves a gap
// between the symbol edge and the cap height of a 10px label.
const LABEL_OFFSET_Y = NODE_SIZE / 2 + 12;
// Extra drop for the name when a tag annotation row sits between it and the symbol.
const ANNOTATION_SHIFT = ANNOTATION_ROW_HEIGHT + 8;
// Extra drop for everything under a symbol with an "SB" / "ECT" caption.
const CAPTION_SHIFT = CAPTION_ROW_HEIGHT + 3;

// ── Slot positions ────────────────────────────────────────────────────────────

type SlotPos = Map<string, { x: number; y: number }>;

/**
 * Map from "level-slot" to canvas pixel position, taken from the canvas's own
 * layoutToFlow so the export matches it: pins applied (to the nearest copy of
 * someone drawn twice), and copies with no line left out. A slot missing from
 * the map is not drawn.
 */
function buildSlotPositions(flow: FlowData): SlotPos {
  return new Map(flow.nodes.map(n => [n.id, n.position]));
}

/** Dashed arcs joining the copies of anyone drawn more than once. */
function renderDuplicateArcs(flow: FlowData, slotPos: SlotPos): string[] {
  const half = NODE_SIZE / 2;
  return flow.duplicateEdges.map(e => {
    const a = slotPos.get(e.source)!, b = slotPos.get(e.target)!;
    const d = duplicateArcD(a.x, a.y, b.x, b.y, e.data?.bulge ?? 28, half);
    return `<path d="${d}" stroke="black" stroke-width="1.5" stroke-dasharray="6 4" fill="none"/>`;
  });
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
  // The title's baseline is at padding + 16; the band below it must clear a
  // deceased slash, which reaches DECEASED_OVERHANG above the top row.
  const titleHeight = options.title ? 24 + DECEASED_OVERHANG + 8 : 0;

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
  const hasAnnotations = pedigree.individuals.some(i => hasAnnotationRow(i, pedigree));
  const hasCaption = pedigree.individuals.some(i => lifeStatusCaption(i.lifeStatus));
  // Names wrap to the slot width (#68), so allow for the most lines any name takes.
  const labelMax = labelMaxWidth(layoutSpacing(options.compact).slotWidth);
  const nameLines = Math.max(1, ...pedigree.individuals.map(i => wrapLabel(i.name, labelMax).length));
  const labelHeight = LABEL_OFFSET_Y + nameLines * LABEL_LINE_HEIGHT + (hasDob ? LABEL_LINE_HEIGHT : 0)
    + (hasAnnotations ? ANNOTATION_SHIFT : 0) + (hasCaption ? CAPTION_SHIFT : 0);

  const offsetX = padding + NODE_SIZE / 2 + probandExtra - rawMinX;
  const offsetY = padding + NODE_SIZE / 2 + titleHeight - rawMinY;

  const contentW = rawMaxX - rawMinX + NODE_SIZE + probandExtra;
  const contentH = rawMaxY - rawMinY + NODE_SIZE + labelHeight + probandExtra;

  // The tag key sits under the pedigree, bottom-left, inside the padding.
  const legend = renderExportKeySvg(pedigree, 0, 0);
  const legendExtra = legend.height > 0 ? legend.height + padding / 2 : 0;

  return {
    offsetX,
    offsetY,
    width:  Math.ceil(Math.max(contentW, legend.width) + 2 * padding),
    height: Math.ceil(contentH + 2 * padding + titleHeight + legendExtra),
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

/**
 * Rise of the couple line for the spouse marker at (level, slot): 0 when the
 * adjacent slots are partners, otherwise enough to clear the slots between the
 * real partners (someone with three or more partners).
 */
function hopAt(result: LayoutResult, partners: PartnerSet, level: number, slot: number) {
  const rc = resolveCouple(result, partners, level, slot);
  return hopGeometry(rc.hop ? rc.rightSlot - rc.leftSlot : 1);
}

function hopHeightAt(result: LayoutResult, partners: PartnerSet, level: number, slot: number): number {
  return hopAt(result, partners, level, slot).hopHeight;
}

function renderCoupleLines(pedigree: Pedigree, result: LayoutResult, partners: PartnerSet, slotPos: SlotPos): string[] {
  const lines: string[] = [];
  const related = consanguinityTest(pedigree);
  const idAt = (level: number, slot: number) => pedigree.individuals[result.nid[level][slot] - 1]!.id;
  const path = (d: string) => `<path d="${d}" stroke="black" stroke-width="${STROKE}" fill="none"/>`;
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const partnershipOf = new Map(pedigree.partnerships.map(p => [pairKey(p.individual1, p.individual2), p]));
  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level] - 1; slot++) {
      const sp = result.spouse[level][slot];
      if (sp === 0) continue;

      // Join the real partners; a marker between two non-partners is a line
      // passing through to a further partner and hops over the slots between.
      const rc    = resolveCouple(result, partners, level, slot);
      const left  = slotPos.get(`${level}-${rc.leftSlot}`)!;
      const right = slotPos.get(`${level}-${rc.rightSlot}`)!;
      const { hopHeight: hop, hopInset } = hopAt(result, partners, level, slot);

      const a = idAt(level, rc.leftSlot), b = idAt(level, rc.rightSlot);
      const consang = related(a, b);
      if (!consang) {
        lines.push(path(couplePathD(left.x, left.y, right.x, right.y, hop, hopInset)));
      } else {
        for (const d of consanguineousPathsD(left.x, left.y, right.x, right.y, hop, CONSANG_GAP, hopInset)) lines.push(path(d));
      }
      // Childless couple mark (#15), hung from the middle of the line.
      const partnership = partnershipOf.get(pairKey(a, b));
      const childless = partnership && activeChildless(partnership, pedigree);
      if (partnership && childless) {
        const cx = (left.x + right.x) / 2;
        const topY = (left.y + right.y) / 2 - hop + (consang ? CONSANG_GAP / 2 : 0);
        for (const [x1, y1, x2, y2] of childlessMarkSegments(cx, topY, childless)) lines.push(seg(x1, y1, x2, y2));
        if (partnership.childlessReason) {
          lines.push(`<text x="${cx}" y="${childlessReasonBaselineY(topY)}" text-anchor="middle" font-family="sans-serif" font-size="${CHILDLESS_REASON_FONT_SIZE}" fill="black">${escapeXml(partnership.childlessReason)}</text>`);
        }
      }
    }
  }
  return lines;
}

// ── Sibship lines ─────────────────────────────────────────────────────────────

function seg(x1: number, y1: number, x2: number, y2: number, dashed = false): string {
  const dash = dashed ? ` stroke-dasharray="${ADOPTION_DASH}"` : "";
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${STROKE}"${dash}/>`;
}

/** Brackets round an adopted individual's symbol, centred on the origin. Shared with the U-shape exporter. */
export function renderAdoptionBrackets(ind: Individual): string {
  if (!ind.adopted) return "";
  const half = NODE_SIZE / 2;
  return `<g data-adopted="${ind.adopted}">` + adoptionBracketSegments(NODE_SIZE, -half, -half).map(([x1, y1, x2, y2]) => seg(x1, y1, x2, y2)).join("") + `</g>`;
}

function renderSibshipLines(pedigree: Pedigree, result: LayoutResult, partners: PartnerSet, slotPos: SlotPos): string[] {
  const lines: string[] = [];
  const twins = twinMembership(pedigree);

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
      const hop      = hopHeightAt(result, partners, level - 1, f - 1);
      const children = slots.map(s => {
        const child = pedigree.individuals[Math.floor(result.nid[level][s]) - 1];
        return {
          ...slotPos.get(`${level}-${s}`)!,
          topInset: symbolTopInset(child?.lifeStatus, NODE_SIZE),
          dashed: child?.adopted === "in",
          ...(child ? twins.get(child.id) ?? {} : {}),
        };
      });
      const { solid, dashed } = sibshipPaths(coupleX, coupleY, hop, children);
      for (const [x1, y1, x2, y2] of solid) lines.push(seg(x1, y1, x2, y2));
      for (const [x1, y1, x2, y2] of dashed) lines.push(seg(x1, y1, x2, y2, true));
      for (const m of twinForkMarks(coupleY, children)) {
        if (m.kind === "bar") lines.push(seg(m.segment[0], m.segment[1], m.segment[2], m.segment[3]));
        else lines.push(`<text x="${m.x}" y="${m.y + TWIN_QUESTION_FONT_SIZE * 0.35}" text-anchor="middle" font-family="sans-serif" font-size="${TWIN_QUESTION_FONT_SIZE}" font-weight="bold" fill="black">?</text>`);
      }
    }
  }
  return lines;
}

// ── Symbols ───────────────────────────────────────────────────────────────────

function renderShape(ind: Individual, pedigree: Pedigree, clipId: string): string {
  const half = NODE_SIZE / 2;
  const fill = ind.affected ? "black" : "white";

  // Geometry without paint, reused for the clipPath, the filled base and the
  // re-stroked outline that keeps the border crisp over tag sectors.
  const triangle = lossTriangleGeom(ind);
  let geom: string;
  if (triangle) {
    geom = triangle;
  } else if (ind.sex === "male") {
    geom = `<rect x="${-half}" y="${-half}" width="${NODE_SIZE}" height="${NODE_SIZE}"`;
  } else if (ind.sex === "female") {
    geom = `<circle cx="0" cy="0" r="${half - 1}"`;
  } else {
    const pts = `0,${-(half - 1)} ${half - 1},0 0,${half - 1} ${-(half - 1)},0`;
    geom = `<polygon points="${pts}"`;
  }
  const stroke = `stroke="black" stroke-width="${STROKE}"`;

  let shape = `${geom} ${stroke} fill="${fill}"/>`;
  const sectors = sectorsFor(ind, pedigree);
  if (sectors.length > 0) {
    shape = `<clipPath id="${clipId}">${geom}/></clipPath>` + shape
      + renderSectorsSvg(ind, pedigree, NODE_SIZE, clipId)
      + (needsAffectedCore(ind, sectors) ? renderAffectedCoreSvg(geom) : "")
      + `${geom} ${stroke} fill="none"/>`;
  }

  return renderAdoptionBrackets(ind) + shape + renderCarrierDot(ind, sectors.length > 0) + renderLifeStatusMarks(ind, geom, clipId)
    + renderAnnotationRowSvg(ind, pedigree, NODE_SIZE, captionShift(ind));
}

/** Drop for everything under the symbol when it has an "SB" / "ECT" caption line. */
function captionShift(ind: Individual): number {
  return lifeStatusCaption(ind.lifeStatus) ? CAPTION_SHIFT : 0;
}

/**
 * Carrier dot, centred on the origin's symbol. Not drawn on an affected
 * (filled) symbol. Shared with the U-shape exporter.
 */
/** Carrier dot; with `rim` (tag colours behind it) it gets a white rim, as on the canvas. */
export function renderCarrierDot(ind: Individual, rim = false): string {
  if (!ind.carrier || ind.affected) return "";
  const half = NODE_SIZE / 2;
  const d = carrierDot(ind.lifeStatus, NODE_SIZE, -half, -half);
  return rim
    ? `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r + CARRIER_RIM / 2}" fill="black" stroke="white" stroke-width="${CARRIER_RIM}"/>`
    : `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="black"/>`;
}

/**
 * Where a sibship drop meets the child: the top of the symbol box, lowered to
 * the apex for a loss triangle. Relative to the symbol centre.
 */
export function childDropEndOffset(ind: Individual | undefined): number {
  return -NODE_SIZE / 2 + symbolTopInset(ind?.lifeStatus, NODE_SIZE);
}

/*
 * Pregnancy / pregnancy-loss symbols (NSGC 2008), centred on the origin.
 * Mirror SymbolShape in symbols.tsx and are shared with the U-shape exporter.
 * The "SB" / "ECT" caption is a label line, see lifeStatusCaption.
 */

/**
 * Unpainted outline of the small loss triangle (miscarriage, termination,
 * ectopic), in the same open-tag form as the sex symbol geometry so callers
 * can reuse it for the clipPath and the outline. Null when the individual is
 * drawn with their sex symbol.
 */
export function lossTriangleGeom(ind: Individual): string | null {
  if (!usesLossTriangle(ind.lifeStatus)) return null;
  const half = NODE_SIZE / 2;
  return `<polygon points="${lossTrianglePoints(NODE_SIZE, -half, -half)}"`;
}

/**
 * "P", the termination slash or the stillbirth slash drawn over the symbol.
 * Empty when born. `geom` is the unpainted symbol outline (see renderShape):
 * on an affected symbol the part of a slash inside it is redrawn in white,
 * clipped to that outline, so the slash does not vanish into the fill.
 */
export function renderLifeStatusMarks(ind: Individual, geom: string, clipId: string): string {
  const status = ind.lifeStatus;
  if (!status) return "";
  const half = NODE_SIZE / 2;
  const slash = (s: { x1: number; y1: number; x2: number; y2: number }) => {
    const attrs = `x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke-width="${STROKE}"`;
    let out = `<line ${attrs} stroke="black"/>`;
    if (ind.affected) {
      const id = `${clipId}-slash`;
      out += `<clipPath id="${id}">${geom}/></clipPath><line ${attrs} stroke="white" clip-path="url(#${id})"/>`;
    }
    return out;
  };
  if (status === "termination") return slash(lossSlashEnds(NODE_SIZE, -half, -half));
  if (status === "pregnancy") {
    const textFill = ind.affected ? "white" : "black";
    const carrier = !!ind.carrier && !ind.affected;
    return `<text x="0" y="${pregnancyBaselineY(NODE_SIZE, -half, carrier)}" text-anchor="middle" font-family="sans-serif" font-size="${pregnancyFontSize(NODE_SIZE, carrier)}" font-weight="bold" fill="${textFill}">P</text>`;
  }
  if (status === "stillbirth") {
    const o = half + DECEASED_OVERHANG;
    return slash({ x1: -o, y1: -o, x2: o, y2: o });
  }
  return "";
}

/** "SB" / "ECT" caption as a label line at the given baseline, centred on cx. */
export function renderLifeStatusCaption(caption: string, cx: number, y: number): string {
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="${CAPTION_FONT_SIZE}" fill="black">${caption}</text>`;
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

/** Copy number of someone drawn more than once, top right, as DuplicateSuperscript on the canvas. */
function renderDuplicateMark(index: number): string {
  const half = NODE_SIZE / 2;
  return `<text x="${half + 2}" y="${-half + 2}" font-family="sans-serif" font-size="10" fill="black">${index}</text>`;
}

function renderSymbols(pedigree: Pedigree, result: LayoutResult, slotPos: SlotPos, flow: FlowData): string[] {
  const elems: string[] = [];
  // Every drawn copy is numbered 1, 2, ... in the same order as on the canvas.
  const copyIndex = new Map(flow.nodes.map(n => [n.id, n.data.isDuplicate ? n.data.duplicateIndex : undefined]));

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const pos = slotPos.get(`${level}-${slot}`);
      if (!pos) continue; // a copy with no line, not drawn
      const nid = Math.floor(result.nid[level][slot]);
      const ind = pedigree.individuals[nid - 1];
      const { x: cx, y: cy } = pos;
      const dupIndex = copyIndex.get(`${level}-${slot}`);

      elems.push(`<g transform="translate(${cx} ${cy})">`);
      elems.push(renderShape(ind, pedigree, `symbol-clip-${level}-${slot}`));
      if (ind.deceased) elems.push(renderDeceasedSlash());
      if (ind.proband)  elems.push(renderProbandArrow());
      if (dupIndex !== undefined) elems.push(renderDuplicateMark(dupIndex));
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

function renderLabels(pedigree: Pedigree, result: LayoutResult, slotPos: SlotPos, labelMax: number): string[] {
  const elems: string[] = [];
  const seen = new Set<number>();

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const pos = slotPos.get(`${level}-${slot}`);
      const nid = Math.floor(result.nid[level][slot]);
      if (!pos || seen.has(nid)) continue;
      seen.add(nid);

      const ind = pedigree.individuals[nid - 1];
      const { x: cx, y: cy } = pos;
      // Under the symbol, top to bottom: "SB" / "ECT" caption, tag annotation row, name, DOB.
      const caption = lifeStatusCaption(ind.lifeStatus);
      if (caption) elems.push(renderLifeStatusCaption(caption, cx, cy + LABEL_OFFSET_Y));
      const labelBaseY = cy + LABEL_OFFSET_Y + captionShift(ind)
        + (hasAnnotationRow(ind, pedigree) ? ANNOTATION_SHIFT : 0);

      // The name wraps to the slot width (#68); the full name is kept as a <title>.
      const lines = wrapLabel(ind.name, labelMax);
      lines.forEach((line, k) => {
        const title = k === 0 && line !== ind.name ? `<title>${escapeXml(ind.name!)}</title>` : "";
        elems.push(`<text x="${cx}" y="${labelBaseY + k * LABEL_LINE_HEIGHT}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${title}${escapeXml(line)}</text>`);
      });
      if (ind.dob) {
        const dobY = labelBaseY + lines.length * LABEL_LINE_HEIGHT;
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
  const result  = alignPedigreeByFamily(working);
  const flow    = layoutToFlow(working, { compact: options.compact });
  const slotPos = buildSlotPositions(flow);
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
  const partners = buildPartnerSetFromPedigree(working);
  lines.push(...renderCoupleLines(working, result, partners, slotPos));
  lines.push(...renderSibshipLines(working, result, partners, slotPos));
  lines.push(...renderDuplicateArcs(flow, slotPos));
  lines.push(...renderSymbols(working, result, slotPos, flow));
  lines.push(...renderLabels(working, result, slotPos, labelMaxWidth(layoutSpacing(options.compact).slotWidth)));
  lines.push(`</g>`);

  const padding = options.padding ?? 40;
  const legend = renderExportKeySvg(working, padding, 0);
  if (legend.height > 0) {
    lines.push(`<g class="pedigree-key" transform="translate(0 ${height - padding - legend.height})">`);
    lines.push(...legend.markup);
    lines.push(`</g>`);
  }
  lines.push(`</svg>`);

  return lines.join("\n");
}
