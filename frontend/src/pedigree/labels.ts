/**
 * Name labels under symbols (#68). Slots are 80px apart (68px compact) and a
 * long name at a fixed width runs into its neighbours, so names wrap onto up
 * to two lines at the slot width and are cut with an ellipsis beyond that.
 * The full name stays in the data (and in the canvas tooltip). Framework-free
 * and shared by the canvas, `svgExporter`, `uShapeExporter` and the lint.
 */

export const LABEL_FONT_SIZE = 10;
/** Rough sans-serif advance (px) per character at LABEL_FONT_SIZE. */
export const LABEL_CHAR_WIDTH = 5.8;
export const LABEL_LINE_HEIGHT = 12;
export const MAX_LABEL_LINES = 2;
export const ELLIPSIS = "…";

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

/** Width (px) of the widest of several label lines. */
export function linesWidth(lines: string[]): number {
  return lines.reduce((w, l) => Math.max(w, textWidth(l)), 0);
}
