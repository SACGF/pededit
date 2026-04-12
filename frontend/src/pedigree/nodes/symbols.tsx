import type { Individual } from "@pedigree-editor/layout-engine";

// ── Fill descriptor ────────────────────────────────────────────────────────────

type FillDescriptor =
  | { type: "solid" }
  | { type: "empty" }
  | { type: "carrier-dot" }
  | { type: "half-fill"; side: "left" | "right" }; // TODO Phase 7: multi-trait display

function symbolFill(individual: Individual): FillDescriptor {
  if (individual.affected) return { type: "solid" };
  if (individual.carrier)  return { type: "carrier-dot" };
  return { type: "empty" };
}

// ── Shape props ────────────────────────────────────────────────────────────────

interface ShapeProps {
  individual: Individual;
  size: number;
}

// ── Male (square) ──────────────────────────────────────────────────────────────

function MaleSymbol({ size, fill }: { size: number; fill: FillDescriptor }) {
  const padding = 1;
  return (
    <g>
      <rect
        x={padding} y={padding}
        width={size - 2 * padding} height={size - 2 * padding}
        stroke="black" strokeWidth={2}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      {fill.type === "carrier-dot" && (
        <circle cx={size / 2} cy={size / 2} r={size * 0.15} fill="black" />
      )}
    </g>
  );
}

// ── Female (circle) ────────────────────────────────────────────────────────────

function FemaleSymbol({ size, fill }: { size: number; fill: FillDescriptor }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 1;
  return (
    <g>
      <circle
        cx={cx} cy={cy} r={r}
        stroke="black" strokeWidth={2}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      {fill.type === "carrier-dot" && (
        <circle cx={cx} cy={cy} r={size * 0.15} fill="black" />
      )}
    </g>
  );
}

// ── Unknown sex (diamond) ──────────────────────────────────────────────────────

function UnknownSymbol({ size, fill }: { size: number; fill: FillDescriptor }) {
  const cx = size / 2, cy = size / 2;
  const points = [
    `${cx},1`,
    `${size - 1},${cy}`,
    `${cx},${size - 1}`,
    `1,${cy}`,
  ].join(" ");
  return (
    <g>
      <polygon
        points={points}
        stroke="black" strokeWidth={2}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      {fill.type === "carrier-dot" && (
        <circle cx={cx} cy={cy} r={size * 0.15} fill="black" />
      )}
    </g>
  );
}

// ── SymbolShape (dispatcher) ───────────────────────────────────────────────────

export function SymbolShape({ individual, size }: ShapeProps) {
  const fill = symbolFill(individual);
  switch (individual.sex) {
    case "male":    return <MaleSymbol    size={size} fill={fill} />;
    case "female":  return <FemaleSymbol  size={size} fill={fill} />;
    case "unknown": return <UnknownSymbol size={size} fill={fill} />;
  }
}

// ── Overlays ───────────────────────────────────────────────────────────────────

export function DeceasedSlash({ size }: { size: number }) {
  const overhang = 4;
  return (
    <line
      x1={-overhang}       y1={-overhang}
      x2={size + overhang} y2={size + overhang}
      stroke="black" strokeWidth={2}
    />
  );
}

/** NSGC proband arrow: solid arrowhead pointing up-right toward the symbol's bottom-left corner. */
export function ProbandArrow({ size }: { size: number }) {
  // Tip at the bottom-left corner of the symbol; tail 18px below-left.
  // The <marker> id is registered globally in PedigreeCanvas to avoid duplicate defs.
  const tipX = 0, tipY = size;
  const tailX = tipX - 18, tailY = tipY + 18;
  return (
    <line
      x1={tailX} y1={tailY}
      x2={tipX}  y2={tipY}
      stroke="black" strokeWidth={2}
      markerEnd="url(#proband-arrowhead)"
    />
  );
}

export function DuplicateSuperscript({ index }: { index: 1 | 2 }) {
  return (
    <span
      style={{
        position: "absolute",
        top: -8,
        right: -6,
        fontSize: 10,
        fontFamily: "sans-serif",
        lineHeight: 1,
        color: "black",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {index}
    </span>
  );
}
