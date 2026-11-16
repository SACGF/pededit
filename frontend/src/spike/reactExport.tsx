/**
 * SPIKE for #141, not for merging. Can the export be rendered from the
 * canvas's React components?
 *
 * Takes today's string export and swaps three of its groups (couple lines,
 * sibship lines, symbols) for the canvas's own components rendered with
 * renderToStaticMarkup, leaving labels, key and title as they are. The two
 * SVGs then differ only where components and strings differ, so SVG, PNG and
 * PDF can be compared picture for picture.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { exportSvg } from "../io/svg/svgExporter";
import { deidentify } from "../io/svg/deidentify";
import type { SvgExportOptions } from "../io/svg/types";
import { drawnPedigree, branchOf, branchCountFontSize } from "../pedigree/collapse";
import { layoutToFlow, type FlowData, type RFNodeData } from "../pedigree/layoutToFlow";
import { NODE_SIZE } from "../pedigree/constants";
import { SymbolShape, DeceasedSlash, ProbandArrow, FamilyHistoryMark, DocumentedMark, AnnotationRow } from "../pedigree/nodes/symbols";
import { symbolPaint, annotationRow } from "../pedigree/tags";
import { arrowKind } from "../pedigree/proband";
import { hasDocumentedEvaluation } from "../pedigree/evaluation";
import { captionRowHeight, symbolTopInset } from "../pedigree/lifeStatus";
import { couplePathD, consanguineousPathsD } from "../pedigree/couplePath";
import { sibshipPaths, segmentsPathD, twinForkMarks } from "../pedigree/sibshipPath";
import { ADOPTION_DASH } from "../pedigree/adoption";
import { TWIN_QUESTION_FONT_SIZE } from "../pedigree/twins";
import { ChildlessMark } from "../pedigree/edges/ChildlessMark";
import { EndedMark } from "../pedigree/edges/EndedMark";

const half = NODE_SIZE / 2;
type Pos = Map<string, { x: number; y: number }>;

/** What PedigreeSymbolNode draws inside its <svg>, without the node around it. */
function Person({ data, pedigree, id, x, y }: { data: RFNodeData; pedigree: Pedigree; id: string; x: number; y: number }) {
  const { individual, shape, hasParents } = data;
  const branch = branchOf(pedigree, individual.id);
  return (
    <g transform={`translate(${x - half} ${y - half})`}>
      <SymbolShape individual={individual} shape={shape} size={NODE_SIZE} paint={symbolPaint(individual, pedigree)} clipId={`symbol-clip-${id}`} />
      {individual.deceased && <DeceasedSlash size={NODE_SIZE} />}
      {arrowKind(individual) && <ProbandArrow size={NODE_SIZE} kind={arrowKind(individual)!} />}
      {individual.familyHistoryUnknown && <FamilyHistoryMark size={NODE_SIZE} hasParents={hasParents} />}
      {hasDocumentedEvaluation(individual) && <DocumentedMark size={NODE_SIZE} adopted={!!individual.adopted} />}
      <AnnotationRow items={annotationRow(individual, pedigree)} size={NODE_SIZE} offsetY={captionRowHeight(individual.lifeStatus)} />
      {data.isDuplicate && data.duplicateIndex !== undefined && (
        <text x={NODE_SIZE + 2} y={2} fontFamily="sans-serif" fontSize={10} fill="black">{data.duplicateIndex}</text>
      )}
      {branch && (
        <text x={half} y={half} textAnchor="middle" dominantBaseline="central" fontFamily="sans-serif" fontWeight="bold"
          fontSize={branchCountFontSize(branch.children.length, NODE_SIZE)} fill="black">{branch.children.length}</text>
      )}
    </g>
  );
}

/** CoupleEdge / ConsanguineousEdge without useNodes. */
function CoupleLines({ flow, pos }: { flow: FlowData; pos: Pos }) {
  return <>{flow.coupleEdges.map(e => {
    const s = pos.get(e.source), t = pos.get(e.target), data = e.data;
    if (!s || !t || !data) return null;
    const sx = s.x + half, sy = s.y, tx = t.x - half, ty = t.y, hop = data.hopHeight ?? 0;
    const double = e.type === "consanguineousEdge";
    const GAP = 4;
    const ds = double ? consanguineousPathsD(sx, sy, tx, ty, hop, GAP, data.hopInset) : [couplePathD(sx, sy, tx, ty, hop, data.hopInset)];
    return (
      <g key={e.id}>
        {ds.map((d, i) => <path key={i} d={d} stroke="black" strokeWidth={2} fill="none" />)}
        {data.childless && <ChildlessMark cx={(sx + tx) / 2} topY={(sy + ty) / 2 - hop + (double ? GAP / 2 : 0)} status={data.childless} reason={data.childlessReason} />}
        {data.ended && <EndedMark sx={sx} tx={tx} y={(sy + ty) / 2 - hop + (double && hop > 0 ? GAP / 2 : 0)} data={data} />}
      </g>
    );
  })}</>;
}

/** SibshipEdge without useNodes. */
function SibshipLines({ flow, pos }: { flow: FlowData; pos: Pos }) {
  const nodeData = new Map(flow.nodes.map(n => [n.id, n.data]));
  return <>{flow.sibshipEdges.map(e => {
    const data = e.data!;
    const l = pos.get(data.leftParentId), r = pos.get(data.rightParentId);
    const kids = data.childIds.filter(id => pos.has(id)).map(id => {
      const d = nodeData.get(id)!;
      return { ...pos.get(id)!, topInset: symbolTopInset(d.individual.lifeStatus, NODE_SIZE), dashed: d.individual.adopted === "in", twinSet: d.twinSet, zygosity: d.zygosity };
    });
    if (!l || !r || kids.length === 0) return null;
    const coupleX = (l.x + r.x) / 2, coupleY = (l.y + r.y) / 2;
    const sexOf = (id: string) => nodeData.get(id)?.shape ?? nodeData.get(id)?.individual.sex;
    const apart = data.apart ? [{ ...l, sex: sexOf(data.leftParentId) }, { ...r, sex: sexOf(data.rightParentId) }] : undefined;
    const { solid, dashed } = sibshipPaths(coupleX, coupleY, data.hopHeight ?? 0, kids, data.barOffset ?? 0, apart, data.converge);
    return (
      <g key={e.id}>
        <path d={segmentsPathD(solid)} stroke="black" strokeWidth={2} fill="none" />
        {dashed.length > 0 && <path d={segmentsPathD(dashed)} stroke="black" strokeWidth={2} fill="none" strokeDasharray={ADOPTION_DASH} />}
        {twinForkMarks(coupleY, kids, data.barOffset ?? 0).map((m, i) => m.kind === "bar"
          ? <line key={i} x1={m.segment[0]} y1={m.segment[1]} x2={m.segment[2]} y2={m.segment[3]} stroke="black" strokeWidth={2} />
          : <text key={i} x={m.x} y={m.y + TWIN_QUESTION_FONT_SIZE * 0.35} textAnchor="middle" fontFamily="sans-serif" fontSize={TWIN_QUESTION_FONT_SIZE} fontWeight="bold" fill="black">?</text>)}
      </g>
    );
  })}</>;
}

function swapGroup(svg: string, cls: string, next: string, markup: string): string {
  const start = svg.indexOf(`<g class="${cls}">`);
  const end = svg.indexOf(`<g class="${next}">`);
  if (start < 0 || end < 0) throw new Error(`group ${cls} not found`);
  return svg.slice(0, start) + `<g class="${cls}">\n${markup}\n</g>\n` + svg.slice(end);
}

export function exportSvgReact(pedigree: Pedigree, options: SvgExportOptions = {}): string {
  const working = options.deidentify ? deidentify(pedigree, options) : drawnPedigree(pedigree);
  const flow = layoutToFlow(working, { compact: options.compact });
  const pos: Pos = new Map(flow.nodes.map(n => [n.id, n.position]));
  let svg = exportSvg(pedigree, options);
  svg = swapGroup(svg, "couple-lines", "sibship-lines", renderToStaticMarkup(<CoupleLines flow={flow} pos={pos} />));
  svg = swapGroup(svg, "sibship-lines", "assisted-lines", renderToStaticMarkup(<SibshipLines flow={flow} pos={pos} />));
  svg = swapGroup(svg, "symbols", "labels", renderToStaticMarkup(
    <>{flow.nodes.map(n => <Person key={n.id} id={n.id} data={n.data} pedigree={working} x={n.position.x} y={n.position.y} />)}</>));
  return svg;
}
