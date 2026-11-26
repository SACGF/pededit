import { NODE_SIZE } from "../constants";
import { textUnder } from "../labelBlock";
import type { PersonGlyph } from "../personGlyph";
import {
  SymbolShape, DeceasedSlash, ProbandArrow, FamilyHistoryMark, DocumentedMark, CopyNumber, BranchCount,
  AnnotationRow, TextUnderSymbol,
} from "./symbols";

/**
 * Everything drawn at one person, from their glyph, in the box from (0, 0)
 * to (size, size): the symbol and its marks, the annotation row, the copy
 * number or group count, and the text under it. No store, no React Flow:
 * the canvas node wraps it with what only the editor shows.
 *
 * `nameLines` is the name as drawn: the glyph's `nameLines` on the canvas
 * (one line when names are truncated), `figureNameLines` in a file.
 * `clipId` and `markerId` must be unique on the page (the proband arrow's
 * marker is defined once by whatever holds the drawing).
 */
export function PersonSymbol({ glyph, clipId, markerId = "proband-arrowhead", nameLines = glyph.nameLines, nameCut, onNameHover, size = NODE_SIZE }: {
  glyph: PersonGlyph;
  clipId: string;
  markerId?: string;
  nameLines?: string[];
  nameCut?: boolean;
  onNameHover?: (over: boolean) => void;
  size?: number;
}) {
  const at = textUnder(glyph, nameLines);
  return (
    <>
      <SymbolShape glyph={glyph} size={size} clipId={clipId} />
      {glyph.deceased && <DeceasedSlash size={size} />}
      {glyph.arrow && <ProbandArrow size={size} kind={glyph.arrow} markerId={markerId} />}
      {glyph.familyHistoryUnknown && <FamilyHistoryMark size={size} hasParents={glyph.hasParents} />}
      {glyph.documented && <DocumentedMark size={size} adopted={!!glyph.adopted} />}
      <AnnotationRow items={glyph.annotations} size={size} offsetY={at.annotationShift} />
      {glyph.copy !== undefined && <CopyNumber size={size} index={glyph.copy} />}
      {glyph.groupCount !== undefined && <BranchCount size={size} count={glyph.groupCount} />}
      <TextUnderSymbol glyph={glyph} nameLines={nameLines} size={size} nameCut={nameCut} onNameHover={onNameHover} />
    </>
  );
}
