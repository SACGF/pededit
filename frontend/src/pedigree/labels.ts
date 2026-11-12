/**
 * Name labels under symbols (#68). Slots are 80px apart (68px compact) and a
 * long name at a fixed width runs into its neighbours, so names wrap onto up
 * to two lines at the slot width and are cut with an ellipsis beyond that.
 * The full name stays in the data and shows under the hover pill. Framework-free
 * and shared by the canvas, `svgExporter`, `uShapeExporter` and the lint.
 *
 * A pedigree can ask for one line instead (`canvasSettings.nameLabels`
 * "truncate"). That applies to the canvas only, where hovering gives the full
 * name; exports cannot be hovered, so they always wrap.
 */

import type { Individual, NameLabelMode, Pedigree } from "@pedigree-editor/layout-engine";
import { onsetsOf } from "./onset";
import { tagCanvasText } from "./tags";
import { branchOf } from "./collapse";
import { evaluationsOf, evaluationParts } from "./evaluation";

export const LABEL_FONT_SIZE = 10;
/** Rough sans-serif advance (px) per character at LABEL_FONT_SIZE. */
export const LABEL_CHAR_WIDTH = 5.8;
export const LABEL_LINE_HEIGHT = 12;
export const MAX_LABEL_LINES = 2;
export const ELLIPSIS = "…";

/** The pedigree's name label setting; anything absent or unrecognised is "wrap". */
export function nameLabelMode(pedigree: Pick<Pedigree, "canvasSettings">): NameLabelMode {
  return pedigree.canvasSettings?.nameLabels === "truncate" ? "truncate" : "wrap";
}

/** Lines a name may take on the canvas in each mode. */
export function canvasLabelLines(mode: NameLabelMode): number {
  return mode === "truncate" ? 1 : MAX_LABEL_LINES;
}

/** True when `lines` (from wrapLabel) leave out part of `text`. */
export function isLabelCut(lines: string[], text: string | undefined): boolean {
  const squash = (s: string) => s.replace(/\s+/g, "");
  return squash(lines.join("")) !== squash(text ?? "");
}

/** Estimated rendered width (px) of a line of label text. */
export function textWidth(text: string): number {
  return text.length * LABEL_CHAR_WIDTH;
}

/** Widest a label may be under a symbol in a slot `slotWidth` px wide: a small gap each side. */
export function labelMaxWidth(slotWidth: number): number {
  return Math.max(LABEL_CHAR_WIDTH * 4, slotWidth - 6);
}

/**
 * Break `text` into at most `maxLines` lines no wider than `maxWidth` px:
 * greedy word wrap, a word wider than a line is split by characters, and
 * whatever does not fit is dropped from the last line with an ellipsis.
 * Empty text gives no lines.
 */
export function wrapLabel(text: string | undefined, maxWidth: number, maxLines = MAX_LABEL_LINES): string[] {
  const clean = (text ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const maxChars = Math.max(1, Math.floor(maxWidth / LABEL_CHAR_WIDTH));
  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";
  const push = (line: string) => { lines.push(line); current = ""; };
  for (let w = 0; w < words.length; w++) {
    let word = words[w]!;
    while (word.length > 0) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) { current = candidate; word = ""; continue; }
      if (current) { push(current); continue; }
      // A single word wider than a line: split it.
      push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (lines.length >= maxLines) {
      const rest = [word, ...words.slice(w + 1)].filter(Boolean);
      // Splitting a long word can push past maxLines: keep only maxLines.
      if (rest.length || current || lines.length > maxLines) return truncate(lines.slice(0, maxLines), maxChars, [current, ...rest].filter(Boolean).join(" "));
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  return truncate(lines.slice(0, maxLines), maxChars, lines.slice(maxLines).join(" "));
}

/** Mark the last line as cut, keeping it within maxChars. */
function truncate(lines: string[], maxChars: number, _dropped: string): string[] {
  const last = lines[lines.length - 1]!;
  const kept = last.length + 1 > maxChars ? last.slice(0, Math.max(1, maxChars - 1)).trimEnd() : last;
  return [...lines.slice(0, -1), kept + ELLIPSIS];
}

/** The text of the name label: the name alone. The pedigree number (#8) has its own line, last in `detailLines`. */
export function nameLabelText(ind: Individual): string | undefined {
  return ind.name;
}

/** Width (px) of the widest of several label lines. */
export function linesWidth(lines: string[]): number {
  return lines.reduce((w, l) => Math.max(w, textWidth(l)), 0);
}

/**
 * The text under the name, as sections in NSGC order (2008, Fig. 1
 * instructions: age or year of birth or death, then evaluation, then the
 * pedigree number), each cut to the label width:
 *
 *   1. `age`: the free-text age (#20) when set, otherwise the year of birth
 *      ("b. 1978"), as the standard prefers a year or age to a full date;
 *   2. `onset`: one line per age of onset (#93);
 *   3. (gender identity #26 goes here);
 *   4. `evaluation`: each evaluation (#101), "E1+ (BRCA1 ...)", up to two
 *      lines each;
 *   5. `number`: the pedigree number ("II-3", #8) when `numbers` has one,
 *      which callers pass only when the pedigree shows numbers.
 *
 * A collapsed-branch group symbol (#1) has none. Shared by the canvas, both
 * SVG exporters and the lints through `detailLines`.
 */
export interface DetailSections {
  age: string[];
  onset: string[];
  evaluation: string[];
  number: string[];
}

export function detailSections(ind: Individual, maxWidth: number, pedigree: Pedigree, numbers?: Map<string, string>): DetailSections {
  const number = wrapLabel(numbers?.get(ind.id), maxWidth, 1);
  const branch = branchOf(pedigree, ind.id);
  if (branch) return { age: [], onset: [], evaluation: [], number };
  return {
    age: wrapLabel(ageText(ind), maxWidth, 1),
    onset: onsetLines(ind, pedigree, maxWidth),
    evaluation: evaluationLines(ind, maxWidth),
    number,
  };
}

/** Every line under the name, top to bottom (see `detailSections`). */
export function detailLines(ind: Individual, maxWidth: number, pedigree: Pedigree, numbers?: Map<string, string>): string[] {
  const s = detailSections(ind, maxWidth, pedigree, numbers);
  return [...s.age, ...s.onset, ...s.evaluation, ...s.number];
}

/**
 * True when the detail block runs past the age line. A two-line name plus
 * the age line clears the sibship bar of the person's children; anything
 * more can reach it, so the block then gets a white backing (canvas div
 * background, a `<rect>` in the exports) and the bar shows a gap under the
 * text instead of running through it.
 */
export function detailsBacked(ind: Individual, maxWidth: number, pedigree: Pedigree, numbers?: Map<string, string>): boolean {
  const s = detailSections(ind, maxWidth, pedigree, numbers);
  return s.onset.length + s.evaluation.length + s.number.length > 0;
}

/**
 * The age line's text (#20): the free-text age when set, otherwise the year
 * of birth as "b. 1978". NSGC prefers a year or an age to a full date, for
 * privacy. A date of birth that does not start with a year (the age range a
 * de-identified export puts there, #4) is shown as it is. The full date
 * stays in the data, the edit panel and the CSV. There is no date of death
 * field, so "d. 2007" or "d. 72" can only come from the free-text age.
 */
export function ageText(ind: Pick<Individual, "age" | "dob">): string | undefined {
  const age = ind.age?.trim();
  if (age) return age;
  const dob = ind.dob?.trim();
  if (!dob) return undefined;
  const year = /^(\d{4})(?:-|$)/.exec(dob);
  return year ? `b. ${year[1]}` : dob;
}

/**
 * Age of onset lines (#93), one per condition: "onset 40s" for the affected
 * status, the tag's canvas text then the age ("BC 45y") for a condition tag.
 * When a line is too wide the tag text is cut first, so the age survives.
 */
export function onsetLines(ind: Individual, pedigree: Pedigree, maxWidth: number): string[] {
  return onsetsOf(ind, pedigree).map(({ tag, onset }) => {
    const head = tag ? tagCanvasText(tag) : "onset";
    const full = `${head} ${onset}`;
    if (textWidth(full) <= maxWidth) return full;
    const room = maxWidth - textWidth(` ${onset}`);
    if (room < textWidth(`xx${ELLIPSIS}`)) return wrapLabel(onset, maxWidth, 1)[0]!;
    return `${wrapLabel(head, room, 1)[0]} ${onset}`;
  });
}

/**
 * Evaluation lines (#101): "E+ (BRCA1 c.5266dupC)", or "E1+", "E2-" when
 * there are several. A variant name rarely fits one slot, so each evaluation
 * may wrap onto a second line ("E+ (BRCA1" / "c.5266dupC)") and is cut with
 * an ellipsis beyond that. The E and its result come first, so they always
 * show.
 */
export function evaluationLines(ind: Individual, maxWidth: number): string[] {
  const evs = evaluationsOf(ind);
  return evs.flatMap((ev, i) => {
    const { head, detail } = evaluationParts(ev, i, evs.length);
    return detail ? wrapLabel(`${head} (${detail})`, maxWidth, EVALUATION_LINES).slice(0, EVALUATION_LINES) : [head];
  });
}

/** Lines one evaluation may take under the symbol. */
export const EVALUATION_LINES = 2;

// ── Chart title (#20) ───────────────────────────────────────────────────────

/** The name a new pedigree gets. Never drawn as a chart title. */
export const DEFAULT_PEDIGREE_NAME = "Untitled pedigree";
export const TITLE_FONT_SIZE = 14;
/** Rough advance (px) per character of the bold title at TITLE_FONT_SIZE. */
export const TITLE_CHAR_WIDTH = 8.4;
/** Gap (px) from the title's baseline down to the top of the highest symbol. */
export const TITLE_GAP = 20;

/**
 * The title drawn above the chart, or "" for none. `Pedigree.chartTitle`
 * wins when set (an empty string hides the title); otherwise the pedigree's
 * name, unless that is still the default name.
 */
export function chartTitle(pedigree: Pick<Pedigree, "chartTitle">, pedigreeName?: string | null): string {
  if (pedigree.chartTitle !== undefined && pedigree.chartTitle !== null) return pedigree.chartTitle.trim();
  const name = (pedigreeName ?? "").trim();
  return name === DEFAULT_PEDIGREE_NAME ? "" : name;
}

/** Estimated rendered width (px) of a chart title. */
export function titleWidth(title: string): number {
  return title.length * TITLE_CHAR_WIDTH;
}
