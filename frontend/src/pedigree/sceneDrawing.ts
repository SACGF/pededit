/**
 * What a scene draws, as plain geometry in scene coordinates: the paths of
 * the couple lines, the segments of the sibship and assisted lines, the
 * points of the dashed arcs, and where each line of text is written. Worked
 * out with the functions the chart components draw with
 * (`coupleLineGeometry`, `sibshipLineGeometry`, `assistedEdgeSegment`,
 * `duplicateArcPoints`, `textUnder`, `consanguinityLabelBaselines`), so it
 * is what a file of the scene contains, translated. Marks that join nobody
 * (twin, childless and ended marks) are left out.
 *
 * The render lint checks the drawing on it (`renderLint.ts`), and the export
 * lint checks that a file holds all of it (`io/svg/exportLint.ts`).
 */
import { NODE_SIZE } from "./constants";
import type { Scene, SceneCoupleLine, SceneLine, ScenePerson, AssistedLineData, DuplicateArcData, SibshipData } from "./scene";
import { coupleLineGeometry, sibshipLineGeometry, type SibshipEnd } from "./lineGeometry";
import { assistedEdgeSegment } from "./assistedLines";
import { pathPoints } from "./couplePath";
import { duplicateArcPoints } from "./duplicateArc";
import { textUnder, copyNumberAt } from "./labelBlock";
import { textWidth } from "./labels";
import { consanguinityLabelBaselines, consanguinityLabelPlacements, consanguinityLabelWidth } from "./consanguinityLabel";
import { familyHistoryMarkAt } from "./familyHistory";
import type { Segment } from "./geometryTypes";

export type Point = [number, number];

/** A line of text, centred on `x`, with its baseline at `y`. */
export interface DrawnText { x: number; y: number; text: string; width: number }

export interface SceneDrawing {
  /** Each couple line with both partners drawn: the path or paths it draws (two for a double line) and its course. */
  couples: { edge: SceneCoupleLine; left: ScenePerson; right: ScenePerson; paths: Point[][]; course: Point[] }[];
  /** The solid and dashed segments of each sibship's lines. */
  sibships: { edge: SceneLine<SibshipData>; segments: Segment[] }[];
  assisted: { edge: SceneLine<AssistedLineData>; segment: Segment }[];
  /** Each dashed arc between two copies, from the copy at `source`. */
  arcs: { edge: SceneLine<DuplicateArcData>; from: ScenePerson; points: Point[] }[];
  /** The figure's text under each symbol, a line at a time (names as a file writes them). */
  texts: (DrawnText & { person: ScenePerson })[];
  /** The text above double lines, a line at a time; `backed` when on a white backing. */
  coupleTexts: (DrawnText & { backed: boolean })[];
  /** Where each "?" over a symbol is written (centre of its baseline). */
  questionMarks: Point[];
  /** The copy number beside each copy of someone drawn twice: the left end of its baseline. */
  copyNumbers: { x: number; y: number; text: string }[];
}

export function sceneDrawing(scene: Scene): SceneDrawing {
  const half = NODE_SIZE / 2;
  const byId = new Map(scene.people.map(p => [p.id, p]));
  const end = (id: string): SibshipEnd | undefined => byId.get(id);
  const out: SceneDrawing = { couples: [], sibships: [], assisted: [], arcs: [], texts: [], coupleTexts: [], questionMarks: [], copyNumbers: [] };

  for (const edge of scene.couples) {
    const left = byId.get(edge.source), right = byId.get(edge.target);
    if (!left || !right) continue;
    const g = coupleLineGeometry(edge.data, edge.double, left.position, right.position);
    out.couples.push({ edge, left, right, paths: g.paths.map(d => pathPoints(d)), course: pathPoints(g.course) });
  }
  for (const edge of scene.sibships) {
    const g = sibshipLineGeometry(edge.data, end);
    if (g) out.sibships.push({ edge, segments: [...g.solid, ...g.dashed] });
  }
  for (const edge of scene.assisted) {
    const segment = assistedEdgeSegment(edge, end);
    if (segment) out.assisted.push({ edge, segment });
  }
  for (const edge of scene.duplicates) {
    const from = byId.get(edge.source), to = byId.get(edge.target);
    if (!from || !to) continue;
    out.arcs.push({ edge, from, points: duplicateArcPoints({ a: from.position, b: to.position, half, ...edge.data }, 48) });
  }
  for (const person of scene.people) {
    const { x, y } = person.position, glyph = person.glyph;
    const at = textUnder(glyph, glyph.figureNameLines);
    glyph.figureNameLines.forEach((text, k) => out.texts.push({ person, x, y: y + at.nameY[k]!, text, width: textWidth(text) }));
    glyph.detailLines.forEach((text, k) => out.texts.push({ person, x, y: y + at.detailY[k]!, text, width: textWidth(text) }));
    if (glyph.familyHistoryUnknown) {
      const q = familyHistoryMarkAt(NODE_SIZE, glyph.hasParents, x - half, y - half);
      out.questionMarks.push([q.x, q.y]);
    }
    if (glyph.copy !== undefined) {
      const c = copyNumberAt();
      out.copyNumbers.push({ x: x + c.x, y: y + c.y, text: String(glyph.copy) });
    }
  }
  for (const p of consanguinityLabelPlacements(scene)) {
    const baselines = consanguinityLabelBaselines(p.cy, p.hop, p.lines.length, p.dy);
    p.lines.forEach((text, i) => out.coupleTexts.push({ x: p.x, y: baselines[i]!, text, width: consanguinityLabelWidth(text), backed: p.backed }));
  }
  return out;
}

/** The straight segments between consecutive points. */
export const segmentsOf = (pts: Point[]): Segment[] => pts.slice(1).map((p, i) => [pts[i]![0], pts[i]![1], p[0], p[1]]);
