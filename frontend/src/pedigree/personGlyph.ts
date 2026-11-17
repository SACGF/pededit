/**
 * Everything drawn at one person, as plain data, decided once for
 * the canvas node, the SVG export and the U-shape export. `layoutToFlow`
 * puts the result on every node (`RFNodeData.glyph`), where the canvas node
 * and `exportSvg` read it; the U-shape export, which has its own layout,
 * calls it per person. A renderer draws what the glyph says and asks the
 * pedigree nothing.
 *
 * Editor-only marks (pin dot, problem marker, selection and picking
 * outlines, the dev id) are not part of it: they belong to the canvas node.
 *
 * A new mark, letter or line of text for a person is a field here first,
 * then drawn by each renderer. Framework-free.
 */
import type { Adoption, Individual, LifeStatus, Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { symbolSex } from "./gender";
import { symbolPaint, annotationRow, type AnnotationItem, type SymbolPaint } from "./tags";
import { arrowKind, type ArrowKind } from "./proband";
import { hasDocumentedEvaluation } from "./evaluation";
import { lifeStatusCaption } from "./lifeStatus";
import { symbolLetter } from "./assisted";
import { wrapLabel, nameLabelText, detailLines, detailsBacked, MAX_LABEL_LINES } from "./labels";
import { branchOf } from "./collapse";

export interface PersonGlyph {
  /** The outline: the gender identity's when shown, else the sex (`symbolSex`). Never for genetics. */
  shape: Sex;
  /** Pregnancy or loss: "P" inside, or the small triangle, with its slash. Absent when born. */
  lifeStatus?: LifeStatus;
  /** What fills the symbol: black or white base, condition sections, black centre, carrier dot, presymptomatic line. */
  paint: SymbolPaint;
  /** Brackets round the symbol. */
  adopted?: Adoption;
  /** "D" or "S" inside the symbol. */
  letter?: string;
  /** The slash from top left to bottom right. */
  deceased: boolean;
  /** Proband arrow with its "P", or the consultand's without. */
  arrow?: ArrowKind;
  /** "?" above the symbol: family history not known. */
  familyHistoryUnknown: boolean;
  /** A line of descent comes into the top of the symbol, which moves the "?" aside. */
  hasParents: boolean;
  /** "*" beside the symbol: a documented evaluation. */
  documented: boolean;
  /** "SB" or "ECT" under the symbol, above everything else there. */
  caption?: string;
  /** Dot and text tags in a row under the symbol. */
  annotations: AnnotationItem[];
  /** The name in full, for a tooltip or `<title>` when the lines are cut. */
  name?: string;
  /** The name as the canvas draws it: wrapped to the slot, one line when names are truncated. */
  nameLines: string[];
  /** The name as a figure writes it: always wrapped, since a file cannot be hovered. */
  figureNameLines: string[];
  /** Under the name, in NSGC order: age or year of birth, onset, sex at birth, evaluations, pedigree number. */
  detailLines: string[];
  /** The detail lines reach the sibship bar below, so they get a white backing. */
  detailsBacked: boolean;
  /** A line runs down through the text, so all of it gets a white backing. Set by `layoutToFlow`. */
  labelsBacked?: boolean;
  /** 1, 2, ... beside each copy of someone drawn more than once. */
  copy?: number;
  /** The number inside a collapsed-branch group symbol. */
  groupCount?: number;
}

export interface PersonGlyphOptions {
  /** Width (px) the text under the symbol may take (`labelMaxWidth` of the slot). */
  labelMax: number;
  /** Pedigree numbers to write under each person, when shown. */
  numbers?: Map<string, string>;
  /** Lines the canvas gives a name: 1 when names are truncated. Default: wrapped. */
  nameLineLimit?: number;
  /** The person is someone's child in the drawn pedigree. */
  hasParents: boolean;
  /** Which copy this is, for someone drawn more than once. */
  copy?: number;
}

export function personGlyph(individual: Individual, pedigree: Pedigree, options: PersonGlyphOptions): PersonGlyph {
  const { labelMax, numbers } = options;
  const name = nameLabelText(individual);
  const branch = branchOf(pedigree, individual.id);
  const arrow = arrowKind(individual);
  const caption = lifeStatusCaption(individual.lifeStatus);
  const letter = symbolLetter(individual);
  return {
    shape: symbolSex(individual, pedigree),
    ...(individual.lifeStatus ? { lifeStatus: individual.lifeStatus } : {}),
    paint: symbolPaint(individual, pedigree),
    ...(individual.adopted ? { adopted: individual.adopted } : {}),
    ...(letter ? { letter } : {}),
    deceased: !!individual.deceased,
    ...(arrow ? { arrow } : {}),
    familyHistoryUnknown: !!individual.familyHistoryUnknown,
    hasParents: options.hasParents,
    documented: hasDocumentedEvaluation(individual),
    ...(caption ? { caption } : {}),
    annotations: annotationRow(individual, pedigree),
    ...(name ? { name } : {}),
    nameLines: wrapLabel(name, labelMax, options.nameLineLimit ?? MAX_LABEL_LINES),
    figureNameLines: wrapLabel(name, labelMax),
    detailLines: detailLines(individual, labelMax, pedigree, numbers),
    detailsBacked: detailsBacked(individual, labelMax, pedigree, numbers),
    ...(options.copy !== undefined ? { copy: options.copy } : {}),
    ...(branch ? { groupCount: branch.children.length } : {}),
  };
}
