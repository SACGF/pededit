/**
 * Evaluation results and the presymptomatic carrier symbol (#101, NSGC 2008
 * Fig. 4 as revised in 2022, #114). Framework-free: the canvas (`nodes/symbols.tsx`), both
 * SVG exporters, the legends, the CSV and the label stack (`labels.ts`) share
 * it.
 *
 *  - Evaluations: `Individual.evaluations`, written under the symbol, one
 *    line each. NSGC 2022 (the default, `notation.ts`): the detail then the
 *    result ("+", "-", "u"), "BRCA1 c.5266dupC +"; the space keeps the
 *    result apart from a variant name with "+" or "-" in it (c.123+1G>A).
 *    NSGC 2008: "E", the result, the detail in parentheses,
 *    "E+ (BRCA1 c.5266dupC)", numbered E1, E2 in list order when there are
 *    several (per person: the detail says what each was).
 *  - Documented evaluation: a "*" at the symbol's lower right when any of
 *    the person's evaluations is marked documented.
 *  - Presymptomatic carrier: `Individual.presymptomatic`, a vertical line
 *    through the symbol. Like the carrier dot, not drawn on an affected
 *    (filled) symbol.
 */

import type { Evaluation, EvaluationResult, Individual, LifeStatus, NotationEdition } from "@pedigree-editor/layout-engine";
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

/** The parts of one evaluation's line: the trimmed detail text and the result mark ("" for none). */
export function evaluationParts(ev: Evaluation): { detail: string; mark: string } {
  return {
    detail: (ev.detail ?? "").trim().replace(/\s+/g, " "),
    mark: evaluationResultMark(ev.result),
  };
}

/** The 2008 head, "E", "E+" or "E2-": numbered only when the person has several. */
export function evaluationHead2008(ev: Evaluation, index: number, count: number): string {
  return `E${count > 1 ? index + 1 : ""}${evaluationResultMark(ev.result)}`;
}

/**
 * One evaluation as text, uncut. 2022: "BRCA1 c.5266dupC +", "echo", "-",
 * or "" when nothing is recorded. 2008: "E1+ (BRCA1 c.5266dupC)", "E".
 */
export function evaluationText(ev: Evaluation, notation: NotationEdition, index = 0, count = 1): string {
  const { detail, mark } = evaluationParts(ev);
  if (notation === "nsgc2008") {
    const head = evaluationHead2008(ev, index, count);
    return detail ? `${head} (${detail})` : head;
  }
  return [detail, mark].filter(Boolean).join(" ");
}

/**
 * Every evaluation as one string for the CSV, written as under the symbol,
 * with " *" after a documented one: "BRCA1 c.5266dupC + *; echo -" (2022),
 * "E1+ (BRCA1 c.5266dupC) *; E2-" (2008). In 2022 an empty one shows as "*"
 * alone when documented and is skipped otherwise.
 */
export function evaluationsCsv(ind: Pick<Individual, "evaluations">, notation: NotationEdition): string {
  const evs = evaluationsOf(ind);
  return evs
    .map((e, i) => [evaluationText(e, notation, i, evs.length), e.documented ? "*" : ""].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("; ");
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
/** The key row for the result marks: its swatch text and label. */
export function evaluationLegend(notation: NotationEdition): { mark: string; label: string } {
  return notation === "nsgc2008"
    ? { mark: "E", label: "Evaluation: + positive, - negative, u uninformative" }
    : { mark: "+/-", label: "Result: + positive, - negative, u uninformative" };
}
export const DOCUMENTED_LEGEND_LABEL = "Documented evaluation";

/**
 * Someone the results row explains, someone with a documented evaluation,
 * someone presymptomatic: what the key needs rows for. 2008: anyone with an
 * evaluation (the "E" needs defining). 2022: anyone with a result mark;
 * detail text alone ("echo") explains itself.
 */
export function evaluationKeyInfo(inds: Individual[], notation: NotationEdition): { evaluated?: Individual; documented?: Individual; presymptomatic?: Individual } {
  return {
    evaluated: notation === "nsgc2008"
      ? inds.find(i => evaluationsOf(i).length > 0)
      : inds.find(i => evaluationsOf(i).some(e => evaluationResultMark(e.result) !== "")),
    documented: inds.find(hasDocumentedEvaluation),
    presymptomatic: inds.find(drawsPresymptomatic),
  };
}
