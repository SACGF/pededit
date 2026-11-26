import { NODE_SIZE } from "../constants";
import { textUnder } from "../labelBlock";
import type { PersonGlyph } from "../personGlyph";
import {
  SymbolShape, DeceasedSlash, ProbandArrow, FamilyHistoryMark, DocumentedMark, CopyNumber, BranchCount,
  AnnotationRow, TextUnderSymbol,
} from "./symbols";

/**
 * Everything drawn at one person, from their glyph, in the box from (0, 0)
 * to (size, size): `PersonMarks` and the text under it. No store, no React
 * Flow: the canvas node wraps it with what only the editor shows.
 *
 * `nameLines` is the name as drawn: the glyph's `nameLines` on the canvas
 * (one line when names are truncated), `figureNameLines` in a file, which
 * also passes `figure` so a cut name keeps its full text as a `<title>`.
 * `clipId` and `markerId` must be unique on the page (the proband arrow's
 * marker is defined once by whatever holds the drawing, `ProbandMarkerDef`).
 */
export function PersonSymbol({ glyph, clipId, markerId, nameLines = glyph.nameLines, figure, nameCut, onNameHover, size = NODE_SIZE }: {
  glyph: PersonGlyph;
  clipId: string;
  markerId?: string;
  nameLines?: string[];
  figure?: boolean;
  nameCut?: boolean;
  onNameHover?: (over: boolean) => void;
  size?: number;
}) {
  return (
    <>
      <PersonMarks glyph={glyph} clipId={clipId} markerId={markerId} size={size} />
      <TextUnderSymbol
        glyph={glyph} nameLines={nameLines} size={size} nameCut={nameCut} onNameHover={onNameHover}
        fullName={figure ? glyph.name : undefined}
      />
    </>
  );
}

/**
 * The symbol and everything on or beside it, without the text under it:
 * outline, fill, sections, slash, arrow, "?", "*", annotation row, copy
 * number or group count. In the box from (0, 0) to (size, size).
 */
export function PersonMarks({ glyph, clipId, markerId = "proband-arrowhead", size = NODE_SIZE, upright }: {
  glyph: PersonGlyph;
  clipId: string;
  markerId?: string;
  size?: number;
  /**
   * Degrees to turn the proband's "P" back by when the symbol is drawn turned
   * (the U-shape): the arrows are read as marks laid over the chart. Every
   * other letter and mark turns with the symbol.
   */
  upright?: number;
}) {
  return (
    <>
      <SymbolShape glyph={glyph} size={size} clipId={clipId} />
      {glyph.deceased && <DeceasedSlash size={size} />}
      {glyph.arrow && <ProbandArrow size={size} kind={glyph.arrow} markerId={markerId} upright={upright} />}
      {glyph.familyHistoryUnknown && <FamilyHistoryMark size={size} hasParents={glyph.hasParents} />}
      {glyph.documented && <DocumentedMark size={size} adopted={!!glyph.adopted} />}
      <AnnotationRow items={glyph.annotations} size={size} offsetY={textUnder(glyph, []).annotationShift} />
      {glyph.copy !== undefined && <CopyNumber size={size} index={glyph.copy} />}
      {glyph.groupCount !== undefined && <BranchCount size={size} count={glyph.groupCount} />}
    </>
  );
}
