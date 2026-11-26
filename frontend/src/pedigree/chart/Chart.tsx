import { NODE_SIZE } from "../constants";
import type { Scene, ScenePerson } from "../scene";
import type { SibshipEnd } from "../lineGeometry";
import { PersonSymbol } from "./PersonSymbol";
import { CoupleLine } from "./CoupleLine";
import { SibshipLines } from "./SibshipLines";
import { AssistedLine } from "./AssistedLine";
import { DuplicateArc } from "./DuplicateArc";

/**
 * A whole scene as SVG, in scene coordinates, drawn with the same
 * components the canvas draws each node and edge with, in the canvas's
 * order: the dashed arcs, couple lines, lines of descent and assisted lines
 * under the people. No store and no React Flow, so it renders to a string
 * in Node. `idPrefix` keeps clip path ids unique where several charts share
 * a page; the proband arrow's marker (`markerId`) is defined by the caller.
 */
export function Chart({ scene, figure = false, idPrefix = "", markerId }: {
  scene: Scene;
  /** Names as a file writes them (always wrapped), not as the canvas cuts them. */
  figure?: boolean;
  idPrefix?: string;
  markerId?: string;
}) {
  const byId = new Map(scene.people.map(p => [p.id, p]));
  const at = (id: string) => byId.get(id)?.position;
  const end = (id: string): SibshipEnd | undefined => byId.get(id);
  const half = NODE_SIZE / 2;
  return (
    <>
      {scene.duplicates.map(e => {
        const a = at(e.source), b = at(e.target);
        return a && b ? <DuplicateArc key={e.id} a={a} b={b} data={e.data} /> : null;
      })}
      {scene.couples.map(e => {
        const l = at(e.source), r = at(e.target);
        return l && r ? <g key={e.id}><CoupleLine data={e.data} double={e.double} left={l} right={r} /></g> : null;
      })}
      {scene.sibships.map(e => <g key={e.id}><SibshipLines data={e.data} nodeAt={end} /></g>)}
      {scene.assisted.map(e => <AssistedLine key={e.id} line={e} nodeAt={end} />)}
      {scene.people.map((p: ScenePerson) => (
        <g key={p.id} transform={`translate(${p.position.x - half} ${p.position.y - half})`}>
          <PersonSymbol
            glyph={p.glyph} clipId={`${idPrefix}symbol-clip-${p.id}`} markerId={markerId}
            nameLines={figure ? p.glyph.figureNameLines : p.glyph.nameLines}
          />
        </g>
      ))}
    </>
  );
}
