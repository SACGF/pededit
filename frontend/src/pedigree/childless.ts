import type { ChildlessStatus, Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import type { Segment } from "./sibshipPath";

/**
 * Childless couple marks (NSGC 2008, Bennett et al.): a short vertical line
 * from the middle of the couple line, ending in one horizontal bar for "no
 * children by choice" or two bars for infertility, with an optional reason
 * underneath ("vasectomy", "azoospermia"). The geometry is shared by the
 * canvas edges, `svgExporter` and `uShapeExporter`. Framework-free.
 */

export const CHILDLESS_OPTIONS: { value: ChildlessStatus; label: string }[] = [
  { value: "infertility", label: "Infertility" },
  { value: "byChoice",    label: "No children by choice" },
];

export function childlessLabel(status: ChildlessStatus): string {
  return CHILDLESS_OPTIONS.find(o => o.value === status)?.label ?? status;
}

/** Length (px) of the vertical from the couple line to the (lower) bar. */
export const CHILDLESS_DROP = 18;
/** Width (px) of each bar. */
export const CHILDLESS_BAR = 14;
/** Gap (px) between the two infertility bars. */
export const CHILDLESS_BAR_GAP = 4;
/** Font size (px) of the reason text. */
export const CHILDLESS_REASON_FONT_SIZE = 9;

/**
 * Line segments of the mark hanging from (cx, topY), the middle of the couple
 * line (raised when the line hops). The lower bar is always at CHILDLESS_DROP.
 */
export function childlessMarkSegments(cx: number, topY: number, status: ChildlessStatus): Segment[] {
  const h = CHILDLESS_BAR / 2;
  const barY = topY + CHILDLESS_DROP;
  const segs: Segment[] = [
    [cx, topY, cx, barY],
    [cx - h, barY, cx + h, barY],
  ];
  if (status === "infertility") segs.push([cx - h, barY - CHILDLESS_BAR_GAP, cx + h, barY - CHILDLESS_BAR_GAP]);
  return segs;
}

/** Baseline of the reason text under the mark. */
export function childlessReasonBaselineY(topY: number): number {
  return topY + CHILDLESS_DROP + CHILDLESS_REASON_FONT_SIZE + 2;
}

/** The partnership's mark, or undefined when it has children (the mark would contradict them). */
export function activeChildless(partnership: Partnership, pedigree: Pedigree): ChildlessStatus | undefined {
  if (!partnership.childless) return undefined;
  if ((pedigree.parentOf[partnership.id] ?? []).length > 0) return undefined;
  return partnership.childless;
}

/** Partnerships drawn with a childless mark. */
export function childlessPartnerships(pedigree: Pedigree): Partnership[] {
  return pedigree.partnerships.filter(p => activeChildless(p, pedigree) !== undefined);
}
