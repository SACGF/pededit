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
      if (rest.length || current) return truncate(lines, maxChars, [current, ...rest].filter(Boolean).join(" "));
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

/**
 * The text of the name label: the pedigree number (#8) before the name when
 * `numbers` (from `pedigreeNumbers`, only when the setting is on) has one,
 * so the two wrap together and the number is never the part cut off.
 */
export function nameLabelText(ind: Individual, numbers?: Map<string, string>): string | undefined {
  const number = numbers?.get(ind.id);
  if (!number) return ind.name;
  const name = ind.name?.trim();
  return name ? `${number} ${name}` : number;
}

/** Width (px) of the widest of several label lines. */
export function linesWidth(lines: string[]): number {
  return lines.reduce((w, l) => Math.max(w, textWidth(l)), 0);
}

/**
 * The lines under the name. First (#20) the free-text age when set,
 * otherwise the date of birth, cut to one line at `maxWidth` with an
 * ellipsis. Only one, so a two-line name plus this line still clears the
 * sibship bar halfway to the next row. Then one line per age of onset (#93),
 * which only people with a recorded onset have. Shared by the canvas, both
 * SVG exporters and the lints.
 */
export function detailLines(ind: Individual, maxWidth: number, pedigree: Pedigree): string[] {
  const age = ind.age?.trim();
  return [...wrapLabel(age ? age : ind.dob, maxWidth, 1), ...onsetLines(ind, pedigree, maxWidth)];
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
