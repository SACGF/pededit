import type { KeyPosition } from "../io/svg/types";

/**
 * "Key position in exports" (#241): the corner the export key goes in, or
 * "auto" for the corner that grows the figure least. A preference of the
 * person exporting, not a fact about the family, so it is kept per browser
 * (localStorage `exportKeyPosition`), like the minimap and compact layout,
 * and never saved with a pedigree. The export dialog starts from it.
 */
export type KeyPositionSetting = "auto" | KeyPosition;

const KEY = "exportKeyPosition";
const VALUES: readonly KeyPositionSetting[] = ["auto", "top-left", "top-right", "bottom-left", "bottom-right"];

export function readKeyPositionSetting(): KeyPositionSetting {
  try {
    const v = localStorage.getItem(KEY);
    return VALUES.includes(v as KeyPositionSetting) ? (v as KeyPositionSetting) : "auto";
  } catch {
    return "auto";
  }
}

export function writeKeyPositionSetting(v: KeyPositionSetting): void {
  try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ }
}
