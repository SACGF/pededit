import { NODE_SIZE } from "../constants";
import type { Scene } from "../scene";
import type { SibshipEnd } from "../lineGeometry";
import { PersonMarks } from "./PersonSymbol";
import { TextUnderSymbol } from "./symbols";
import { CoupleLine, CoupleText } from "./CoupleLine";
import { SibshipLines } from "./SibshipLines";
import { AssistedLine } from "./AssistedLine";
import { DuplicateArc } from "./DuplicateArc";

/**
 * A whole scene as SVG, in scene coordinates, drawn with the components the
 * canvas draws each node and edge with: the one place a scene is mapped to
 * them for a file (`exportSvg`). No store and no React Flow, so it renders
 * to a string in Node. Bottom to top: couple lines, lines of descent,
 * assisted lines, the dashed arcs between copies, every symbol, the text
 * under every symbol, then the text over the double lines, so text is never
 * under a line or another symbol. Each kind is in a group whose class the
 * export lint reads (`io/svg/exportLint.ts`); nothing styles them. A symbol's
 * group is translated to its centre, which is how the lint finds it.
 * `idPrefix` keeps clip path ids unique where several charts share a page;
 * the proband arrow's marker (`markerId`) is defined by the caller.
 */
export function Chart({ scene, figure = false, idPrefix = "", markerId }: {
  scene: Scene;
  /** Names as a file writes them (always wrapped, the full name in a `<title>`), not as the canvas cuts them. */
  figure?: boolean;
  idPrefix?: string;
  markerId?: string;
}) {
  const byId = new Map(scene.people.map(p => [p.id, p]));
  const at = (id: string) => byId.get(id)?.position;
  const end = (id: string): SibshipEnd | undefined => byId.get(id);
  const half = NODE_SIZE / 2;
  const couples = scene.couples.flatMap(e => {
    const left = at(e.source), right = at(e.target);
    return left && right ? [{ e, left, right }] : [];
  });
  return (
    <>
      <g className="couple-lines">
        {couples.map(({ e, left, right }) => <CoupleLine key={e.id} data={e.data} double={e.double} left={left} right={right} />)}
      </g>
      <g className="sibship-lines">{scene.sibships.map(e => <SibshipLines key={e.id} data={e.data} nodeAt={end} />)}</g>
      <g className="assisted-lines">{scene.assisted.map(e => <AssistedLine key={e.id} line={e} nodeAt={end} />)}</g>
      <g className="duplicate-arcs">
        {scene.duplicates.map(e => {
          const a = at(e.source), b = at(e.target);
          return a && b ? <DuplicateArc key={e.id} a={a} b={b} data={e.data} /> : null;
        })}
      </g>
      <g className="symbols">
        {scene.people.map(p => (
          <g key={p.id} transform={`translate(${p.position.x} ${p.position.y})`}>
            <g transform={`translate(${-half} ${-half})`}>
              <PersonMarks glyph={p.glyph} clipId={`${idPrefix}symbol-clip-${p.id}`} markerId={markerId} />
            </g>
          </g>
        ))}
      </g>
      {/* Text goes under every copy of someone drawn more than once, as on the
          canvas: a copy with no name can only be told by following its dashed arc. */}
      <g className="labels">
        {scene.people.map(p => (
          <g key={p.id} transform={`translate(${p.position.x - half} ${p.position.y - half})`}>
            <TextUnderSymbol
              glyph={p.glyph} size={NODE_SIZE}
              nameLines={figure ? p.glyph.figureNameLines : p.glyph.nameLines}
              fullName={figure ? p.glyph.name : undefined}
            />
          </g>
        ))}
      </g>
      <g className="consanguinity-labels">
        {couples.map(({ e, left, right }) => e.double ? <CoupleText key={e.id} data={e.data} left={left} right={right} /> : null)}
      </g>
    </>
  );
}
