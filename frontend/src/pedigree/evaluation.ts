/**
 * Genetic evaluation notation and the presymptomatic carrier symbol (#101,
 * NSGC 2008 Fig. 4). Framework-free: the canvas (`nodes/symbols.tsx`), both
 * SVG exporters, the legends, the CSV and the label stack (`labels.ts`) share
 * it.
 *
 *  - Evaluations: `Individual.evaluations`, written under the symbol, one
 *    line each, as "E" then the result ("+", "-", "u") then the detail in
 *    parentheses: "E+ (BRCA1 c.5266dupC)". Several are numbered E1, E2 in
 *    list order. The numbers are per person: the detail beside each says
 *    what it was, so the key explains only the notation.
 *  - Documented evaluation: a "*" at the symbol's lower right when any of
 *    the person's evaluations is marked documented.
 *  - Presymptomatic carrier: `Individual.presymptomatic`, a vertical line
 *    through the symbol. Like the carrier dot, not drawn on an affected
 *    (filled) symbol.
 */

import type { Evaluation, EvaluationResult, Individual, LifeStatus } from "@pedigree-editor/layout-engine";
import { usesLossTriangle, symbolTopInset } from "./lifeStatus";
import { ADOPTION_BRACKET_GAP } from "./adoption";

export const EVALUATION_RESULT_OPTIONS: { value: EvaluationResult; label: string; mark: string }[] = [
  { value: "positive",      label: "Positive (+)",      mark: "+" },
  { value: "negative",      label: "Negative (-)",      mark: "-" },
  { value: "uninformative", label: "Uninformative (u)", mark: "u" },
];

/** "+", "-", "u", or "" when no result is recorded. */
export function evaluationResultMark(result: EvaluationResult | undefined): string {
  return EVALUATION_RESULT_OPTIONS.find(o => o.value === result)?.mark ?? "";
}

export function evaluationsOf(ind: Pick<Individual, "evaluations">): Evaluation[] {
  return ind.evaluations ?? [];
}

/**
 * The parts of one evaluation's line: `head` is "E", "E+" or "E2-" (numbered
 * only when the person has several), `detail` the trimmed detail text.
 */
export function evaluationParts(ev: Evaluation, index: number, count: number): { head: string; detail: string } {
  return {
    head: `E${count > 1 ? index + 1 : ""}${evaluationResultMark(ev.result)}`,
    detail: (ev.detail ?? "").trim().replace(/\s+/g, " "),
  };
}

/** One evaluation as text, "E1+ (BRCA1 c.5266dupC)", uncut. */
export function evaluationText(ev: Evaluation, index: number, count: number): string {
  const { head, detail } = evaluationParts(ev, index, count);
  return detail ? `${head} (${detail})` : head;
}

/**
 * Every evaluation as one string for the CSV: "E1+ (BRCA1 c.5266dupC) *; E2-",
 * with " *" after a documented one.
 */
export function evaluationsCsv(ind: Pick<Individual, "evaluations">): string {
  const evs = evaluationsOf(ind);
  return evs.map((e, i) => evaluationText(e, i, evs.length) + (e.documented ? " *" : "")).join("; ");
}

/** True when the "*" for a documented evaluation is drawn. */
export function hasDocumentedEvaluation(ind: Pick<Individual, "evaluations">): boolean {
  return evaluationsOf(ind).some(e => e.documented);
}

// ── "*" for a documented evaluation ─────────────────────────────────────────

export const DOCUMENTED_FONT_SIZE = 14;
export const DOCUMENTED_MARK = "*";

/**
 * Baseline point (text-anchor start) of the "*" for a symbol box of `size`
 * with top-left (x, y): just right of the box's lower right corner, below
 * the couple line, and outside adoption brackets when there are any. The
 * glyph sits high in its em box, so a baseline just below the box puts it
 * beside the corner, clear of the label under the symbol.
 */
export function documentedMarkAt(size: number, adopted: boolean, x = 0, y = 0): { x: number; y: number } {
  return { x: x + size + 1 + (adopted ? ADOPTION_BRACKET_GAP + 1 : 0), y: y + size + 3 };
}

/** The "*" as SVG markup, for the exporters. `uprightDeg` keeps it upright in a rotated symbol. */
export function renderDocumentedMarkSvg(size: number, adopted: boolean, x: number, y: number, uprightDeg?: number): string {
  const p = documentedMarkAt(size, adopted, x, y);
  const turn = uprightDeg ? ` transform="rotate(${uprightDeg} ${p.x + 3.5} ${p.y - DOCUMENTED_FONT_SIZE / 2})"` : "";
  return `<text class="documented-evaluation" x="${p.x}" y="${p.y}"${turn} font-family="sans-serif" font-size="${DOCUMENTED_FONT_SIZE}" fill="black">${DOCUMENTED_MARK}</text>`;
}

// ── Presymptomatic carrier line ─────────────────────────────────────────────

/** True when the vertical line is drawn: set, and not hidden by an affected fill. */
export function drawsPresymptomatic(ind: Pick<Individual, "presymptomatic" | "affected">): boolean {
  return !!ind.presymptomatic && !ind.affected;
}

/**
 * The vertical line through the symbol, relative to a box of `size` with
 * top-left (ox, oy): top to bottom of the sex symbol (inside its outline),
 * apex to base of a loss triangle.
 */
export function presymptomaticLine(status: LifeStatus | undefined, size: number, ox = 0, oy = 0): { x1: number; y1: number; x2: number; y2: number } {
  const cx = ox + size / 2;
  if (usesLossTriangle(status)) {
    const inset = symbolTopInset(status, size);
    return { x1: cx, y1: oy + inset + 2, x2: cx, y2: oy + size - inset };
  }
  return { x1: cx, y1: oy + 1, x2: cx, y2: oy + size - 1 };
}

/** Width of the white rim round the line when tag colours are behind it, as for the carrier dot. */
export const PRESYMPTOMATIC_RIM = 1.5;
export const PRESYMPTOMATIC_STROKE = 2;

/** The line as SVG markup for a symbol box with top-left (ox, oy); `rim` over tag colours. */
export function renderPresymptomaticSvg(ind: Individual, size: number, ox: number, oy: number, rim = false): string {
  if (!drawsPresymptomatic(ind)) return "";
  const l = presymptomaticLine(ind.lifeStatus, size, ox, oy);
  const attrs = `class="presymptomatic" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"`;
  return (rim ? `<line ${attrs} stroke="white" stroke-width="${PRESYMPTOMATIC_STROKE + 2 * PRESYMPTOMATIC_RIM}"/>` : "")
    + `<line ${attrs} stroke="black" stroke-width="${PRESYMPTOMATIC_STROKE}"/>`;
}

// ── Key wording ─────────────────────────────────────────────────────────────

export const PRESYMPTOMATIC_LEGEND_LABEL = "Presymptomatic carrier";
export const EVALUATION_LEGEND_LABEL = "Evaluation: + positive, - negative, u uninformative";
export const DOCUMENTED_LEGEND_LABEL = "Documented evaluation";

/** Someone with evaluations, someone with a documented one, someone presymptomatic: what the key needs rows for. */
export function evaluationKeyInfo(inds: Individual[]): { evaluated?: Individual; documented?: Individual; presymptomatic?: Individual } {
  return {
    evaluated: inds.find(i => evaluationsOf(i).length > 0),
    documented: inds.find(hasDocumentedEvaluation),
    presymptomatic: inds.find(drawsPresymptomatic),
  };
}
