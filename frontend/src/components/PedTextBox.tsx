import { useEffect, useMemo, useRef, useState } from "react";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { readPedText, type PedTextReading } from "../io/ped/text";
import { buildScene } from "../pedigree/scene";
import { Chart } from "../pedigree/chart/Chart";
import { ProbandMarkerDef } from "../pedigree/chart/symbols";

/**
 * The PED text box (#218): PED text on the left, the chart it draws on the
 * right. Typed text is read after a pause; while it has errors the last good
 * drawing stays and the errors show under the box. Read-only for "View as
 * text". Only offered from `lg` up (callers hide the way in on small screens).
 */

/** A worked example, shown while the box is empty, for people who have never seen a PED file. */
export const PED_TEXT_PLACEHOLDER = [
  "fam1  dad  0    0    1  1",
  "fam1  mum  0    0    2  1",
  "fam1  kid  dad  mum  2  2",
].join("\n");

const READ_DELAY_MS = 250;

export function PedTextBox({ text, onTextChange, readOnly = false, onReading }: {
  text: string;
  onTextChange?: (text: string) => void;
  readOnly?: boolean;
  /** Called with each reading of the text, after the pause. */
  onReading?: (reading: PedTextReading) => void;
}) {
  const [reading, setReading] = useState<PedTextReading>(() => readPedText(text));
  const lastGood = useRef<Pedigree | null>(reading.current ? reading.pedigree : null);
  const onReadingRef = useRef(onReading);
  onReadingRef.current = onReading;

  useEffect(() => {
    const read = () => {
      const next = readPedText(text, lastGood.current);
      if (next.current) lastGood.current = next.pedigree;
      setReading(next);
      onReadingRef.current?.(next);
    };
    if (readOnly) { read(); return; }
    const timer = setTimeout(read, READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, readOnly]);

  return (
    <div className="grid grid-cols-2 gap-4" data-testid="ped-text-box">
      <div className="flex flex-col gap-2 min-w-0">
        <textarea
          value={text}
          readOnly={readOnly}
          onChange={e => onTextChange?.(e.target.value)}
          placeholder={PED_TEXT_PLACEHOLDER}
          spellCheck={false}
          autoFocus={!readOnly}
          aria-label="PED text"
          data-testid="ped-text-input"
          className="h-80 w-full resize-none rounded border border-gray-300 p-2 font-mono text-xs leading-5 whitespace-pre [tab-size:8] outline-none focus:border-gray-500 read-only:bg-gray-50"
        />
        <p className="text-xs text-gray-500">
          One person a row: family, person, father, mother, sex (1 = male, 2 = female, 0 = unknown),
          affected (1 = no, 2 = yes). <code>0</code> is no parent. Spaces or tabs between columns.
        </p>
        {reading.errors.length > 0 && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600" data-testid="ped-text-errors">
            {reading.pedigree && <div className="mb-1 text-red-700">The drawing is from the last text without errors.</div>}
            <ul className="space-y-0.5">
              {reading.errors.slice(0, 5).map((e, k) => <li key={k}>{e}</li>)}
              {reading.errors.length > 5 && <li className="italic">and {reading.errors.length - 5} more</li>}
            </ul>
          </div>
        )}
        {reading.note && <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600" data-testid="ped-text-note">{reading.note}</div>}
        {reading.warnings.length > 0 && (
          <ul className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 space-y-0.5">
            {reading.warnings.slice(0, 3).map((w, k) => <li key={k}>{w}</li>)}
          </ul>
        )}
      </div>
      <ChartPreview pedigree={reading.pedigree} />
    </div>
  );
}

/** The chart a pedigree draws, scaled to fit the box: the canvas's own components. */
function ChartPreview({ pedigree }: { pedigree: Pedigree | null }) {
  const scene = useMemo(() => pedigree ? buildScene(pedigree) : null, [pedigree]);
  const b = scene?.bounds;
  const pad = 20;
  return (
    <div className="h-80 rounded border border-gray-200 bg-white flex items-center justify-center" data-testid="ped-text-preview">
      {scene && b ? (
        <svg
          viewBox={`${b.left - pad} ${b.top - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img"
          aria-label="Preview of the chart"
        >
          <defs><ProbandMarkerDef id="ped-text-proband-arrowhead" /></defs>
          <Chart scene={scene} figure idPrefix="ped-text-" markerId="ped-text-proband-arrowhead" />
        </svg>
      ) : (
        <span className="text-xs text-gray-400">The chart is drawn here as you type.</span>
      )}
    </div>
  );
}
