/**
 * Name labels under symbols. Slots are 80px apart (68px compact) and a
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
import { evaluationsOf, evaluationParts, evaluationText } from "./evaluation";
import { notationOf } from "./notation";
import type { NotationEdition } from "@pedigree-editor/layout-engine";
import { assignedAtBirthText } from "./gender";
import { inbreedingLabel } from "./relatedness";
import { DECEASED_OVERHANG } from "./constants";
import { ageAtDeath, parsePartialDate } from "./dateRanges";

export const LABEL_FONT_SIZE = 10;
/** Rough sans-serif advance (px) per character at LABEL_FONT_SIZE. */
export const LABEL_CHAR_WIDTH = 5.8;
/** Height (px) of a line of text under a symbol, on the canvas and in figures. */
export const LABEL_LINE_HEIGHT = 13;
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

/** The text of the name label: the name alone. The pedigree number has its own line, last in `detailLines`. */
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
 *   1. `age`: the free-text age when set, otherwise birth and death
 *      (`ageLines`: "b. 1978", "d. 72y", or "b. 1935" over "d. 2007"), as
 *      the standard prefers a year or age to a full date;
 *   2. `onset`: one line per age of onset;
 *   3. `gender`: the sex assigned at birth ("AMAB", "AFAB", "UAAB") under
 *      a symbol drawn by gender identity (NSGC 2022);
 *   4. `evaluation`: each evaluation, "BRCA1 ... +", up to two
 *      lines each;
 *   5. `inbreeding`: the inbreeding coefficient ("F = 1/16") of someone
 *      whose parents are related, when the pedigree draws coefficients
 *      (#86). NSGC has no place for it; it goes with what was worked
 *      out about the person, above the number that only locates them;
 *   6. `notes`: the person's notes, when the pedigree draws them
 *      (`canvasSettings.showNotes`, off by default as notes are free text
 *      and often private). NSGC's list has no comment line, so they go
 *      after everything recorded or worked out about the person and above
 *      the number, up to `NOTE_LINES` lines (`noteLines`);
 *   7. `number`: the pedigree number ("II-3") when `numbers` has one,
 *      which callers pass only when the pedigree shows numbers.
 *
 * A collapsed-branch group symbol has none. Shared by the canvas, both
 * SVG exporters and the lints through the glyph's `detailLines`.
 */
export interface DetailSection {
  key: "age" | "onset" | "gender" | "evaluation" | "inbreeding" | "notes" | "number";
  lines: string[];
}

export function detailSections(ind: Individual, maxWidth: number, pedigree: Pedigree, numbers?: Map<string, string>): DetailSection[] {
  const number: DetailSection = { key: "number", lines: wrapLabel(numbers?.get(ind.id), maxWidth, 1) };
  if (branchOf(pedigree, ind.id)) return [number];
  return [
    { key: "age", lines: ageLines(ind).flatMap(l => wrapLabel(l, maxWidth, 1)) },
    { key: "onset", lines: onsetLines(ind, pedigree, maxWidth) },
    { key: "gender", lines: wrapLabel(assignedAtBirthText(ind, pedigree), maxWidth, 1) },
    { key: "evaluation", lines: evaluationLines(ind, maxWidth, notationOf(pedigree)) },
    { key: "inbreeding", lines: wrapLabel(inbreedingLabel(pedigree, ind.id), maxWidth, 1) },
    { key: "notes", lines: showsNotes(pedigree) ? noteLines(ind.notes, maxWidth) : [] },
    number,
  ];
}

/** Every line under the name, top to bottom. */
export function detailLines(sections: DetailSection[]): string[] {
  return sections.flatMap(s => s.lines);
}

/**
 * True when the detail block runs past one age line (a birth and a death
 * line count as two). A two-line name plus one age line clears the sibship bar of the person's children; anything
 * more can reach it, so the block then gets a white backing (a `<rect>`
 * behind the text) and the bar shows a gap under the text instead of
 * running through it.
 */
export function detailsBacked(sections: DetailSection[]): boolean {
  return sections.some(s => s.lines.length > (s.key === "age" ? 1 : 0));
}

/**
 * The age lines, NSGC 2008 Fig. 1: "age, or year of birth /
 * death", a year or an age rather than a full date, for privacy. The full
 * dates stay in the data, the edit panel and the CSV.
 *
 *   - the free-text age when set ("d. 60s"), alone;
 *   - deceased with full dates of birth and death: the age at death alone,
 *     "d. 72y" ("d. 4 mo", "d. 5 d" under a year or a month);
 *   - otherwise "b. 1935" and "d. 2007", each when known, on two lines when
 *     both are (one line, "b. 1935, d. 2007", is wider than a slot).
 *
 * A date of birth that does not start with a year (the age range a
 * de-identified export puts there) is shown as it is. A date of death
 * counts only while the person is marked deceased, and only when it reads
 * as a year, year-month or full date.
 */
export function ageLines(ind: Pick<Individual, "age" | "dob" | "dod" | "deceased">): string[] {
  const age = ind.age?.trim();
  if (age) return [age];
  const dobText = ind.dob?.trim();
  const birth = dobText ? parsePartialDate(dobText) : undefined;
  const death = ind.deceased && ind.dod ? parsePartialDate(ind.dod.trim()) : undefined;
  const atDeath = birth && death ? ageAtDeath(birth, death) : undefined;
  if (atDeath) return [`d. ${atDeath}`];
  const lines: string[] = [];
  if (dobText) lines.push(birth ? `b. ${birth.y}` : dobText);
  if (death) lines.push(`d. ${death.y}`);
  return lines;
}

/** The age lines as one string ("b. 1935, d. 2007"), for the edit panel's hint. */
export function ageText(ind: Pick<Individual, "age" | "dob" | "dod" | "deceased">): string | undefined {
  const lines = ageLines(ind);
  return lines.length ? lines.join(", ") : undefined;
}

/**
 * Age of onset lines, one per condition: "onset 40s" for the affected
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
 * Evaluation lines. A variant name rarely fits one slot, so
 * each evaluation may wrap onto a second line and is cut with an ellipsis
 * beyond that, never losing the result:
 *
 *  - NSGC 2022 (default): "BRCA1 c.5266dupC +", the detail then the result
 *    ("BRCA1" / "c.5266dupC +"); a cut keeps the mark at the end of the
 *    last line. Nothing recorded: no line.
 *  - NSGC 2008: "E+ (BRCA1 c.5266dupC)", "E1+", "E2-" when there are
 *    several; the E and its result come first, so they always show.
 */
export function evaluationLines(ind: Individual, maxWidth: number, notation: NotationEdition = "nsgc2022"): string[] {
  const evs = evaluationsOf(ind);
  if (notation === "nsgc2008") {
    return evs.flatMap((ev, i) => wrapLabel(evaluationText(ev, notation, i, evs.length), maxWidth, EVALUATION_LINES).slice(0, EVALUATION_LINES));
  }
  return evs.flatMap(ev => {
    const { detail, mark } = evaluationParts(ev);
    if (!detail) return mark ? [mark] : [];
    const whole = mark ? `${detail} ${mark}` : detail;
    const lines = wrapLabel(whole, maxWidth, EVALUATION_LINES);
    if (!mark || lines.join(" ") === whole) return lines;
    // Too long: cut the detail, keeping room for " +" on the last line.
    const cut = wrapLabel(detail, maxWidth, EVALUATION_LINES);
    const lastChars = Math.max(1, Math.floor((maxWidth - textWidth(` ${mark}`)) / LABEL_CHAR_WIDTH));
    let last = cut[cut.length - 1]!;
    if (last.length > lastChars) {
      last = `${last.replace(/\u2026$/, "").slice(0, Math.max(1, lastChars - 1)).trimEnd()}${ELLIPSIS}`;
    }
    return [...cut.slice(0, -1), `${last} ${mark}`];
  });
}

/** True when the pedigree draws people's notes under their symbols (`canvasSettings.showNotes`). */
export function showsNotes(pedigree: Pick<Pedigree, "canvasSettings">): boolean {
  return pedigree.canvasSettings?.showNotes === true;
}

/** Lines a person's notes may take under the symbol. */
export const NOTE_LINES = 2;

/**
 * A person's notes as lines under the symbol: each line of the notes
 * wrapped to `maxWidth`, at most `maxLines` in all, the last cut with an
 * ellipsis when anything is left out. Blank lines are skipped.
 */
export function noteLines(notes: string | null | undefined, maxWidth: number, maxLines = NOTE_LINES): string[] {
  const paragraphs = (notes ?? "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    lines.push(...wrapLabel(paragraphs[i], maxWidth, maxLines - lines.length));
    if (lines.length >= maxLines && i < paragraphs.length - 1) {
      const last = lines[lines.length - 1]!;
      return last.endsWith(ELLIPSIS) ? lines : truncate(lines, Math.max(1, Math.floor(maxWidth / LABEL_CHAR_WIDTH)), "");
    }
  }
  return lines;
}

/** Lines one evaluation may take under the symbol. */
export const EVALUATION_LINES = 2;

// ── Chart title ───────────────────────────────────────────────────────

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

/** Height (px) of the canvas title's line box. */
export const TITLE_LINE_HEIGHT = TITLE_FONT_SIZE + 4;

/**
 * Where the canvas draws the chart title: the centre of its line box,
 * centred over the symbols with its baseline TITLE_GAP (plus room for a
 * deceased slash) above the highest one, as in the SVG export, and raised
 * further to clear `aboveTop`, the highest point of anything drawn over the
 * symbols (`highestAboveSymbols`). Null with no title or no
 * symbols. `half` is half a symbol. Shared by `chartTitleNode` and the
 * canvas lint.
 */
export function chartTitlePlace(
  title: string,
  symbols: { position: { x: number; y: number } }[],
  half: number,
  aboveTop = Infinity,
): { x: number; y: number; width: number; height: number } | null {
  if (!title || symbols.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const { position: { x, y } } of symbols) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y);
  }
  // The baseline sits about a third of the font size below the box centre.
  const baseline = Math.min(minY - half, aboveTop) - TITLE_GAP - DECEASED_OVERHANG;
  return { x: (minX + maxX) / 2, y: baseline - TITLE_FONT_SIZE / 3, width: Math.ceil(titleWidth(title)) + 8, height: TITLE_LINE_HEIGHT };
}
