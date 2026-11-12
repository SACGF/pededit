import { cloneElement } from "react";
import type { Individual } from "@pedigree-editor/layout-engine";
import {
  sectorPath, tagCanvasText, AFFECTED_CORE_SCALE, AFFECTED_CORE_RIM,
  ANNOTATION_Y, ANNOTATION_DOT_RADIUS, ANNOTATION_FONT_SIZE,
} from "../tags";
import type { Sector, AnnotationItem } from "../tags";
import {
  usesLossTriangle, lifeStatusCaption, captionBaselineY, CAPTION_FONT_SIZE,
  lossTrianglePoints, lossSlashEnds, pregnancyFontSize, pregnancyBaselineY, carrierDot, CARRIER_RIM,
} from "../lifeStatus";
import type { LifeStatus } from "@pedigree-editor/layout-engine";
import { adoptionBracketSegments } from "../adoption";
import { familyHistoryMarkAt, FAMILY_HISTORY_FONT_SIZE } from "../familyHistory";
import { arrowGeometry, PROBAND_LETTER, PROBAND_LETTER_SIZE, type ArrowKind } from "../proband";

// ── Fill descriptor ────────────────────────────────────────────────────────────

type FillDescriptor =
  | { type: "solid" }
  | { type: "empty" }
  | { type: "carrier-dot" };

function symbolFill(individual: Individual): FillDescriptor {
  if (individual.affected) return { type: "solid" };
  if (individual.carrier)  return { type: "carrier-dot" };
  return { type: "empty" };
}

// ── Shape props ────────────────────────────────────────────────────────────────

interface ShapeProps {
  individual: Individual;
  size: number;
  /** Quadrant-tag sectors to paint over the base fill. */
  sectors?: Sector[];
  /** Unique id for this symbol's clipPath. Required when sectors are given. */
  clipId?: string;
  /** Draw the "SB" / "ECT" caption under the symbol (off in the minimap, where it is unreadable). */
  caption?: boolean;
}

/**
 * Tag sectors, clipped to the symbol outline. The radius is the full symbol
 * size so the clip, not the arc, defines the edge: a quarter of a square comes
 * out square-cornered.
 */
function Sectors({ sectors, size, clipId }: { sectors: Sector[]; size: number; clipId: string }) {
  if (sectors.length === 0) return null;
  const c = size / 2;
  return (
    <g clipPath={`url(#${clipId})`}>
      {sectors.map(s => (
        <path key={s.tag.id} d={sectorPath(c, c, size, s.start, s.end)} fill={s.tag.color} />
      ))}
    </g>
  );
}

/**
 * Black centre for an affected person whose symbol carries quadrant tags, so
 * affected status stays visible when tags cover every quarter. `outline` is
 * the symbol's own outline element; it is drawn scaled about the centre.
 * Mirrors renderAffectedCoreSvg in tags.ts.
 */
function AffectedCore({ size, show, outline }: { size: number; show: boolean; outline: React.ReactElement<React.SVGProps<SVGElement>> }) {
  if (!show) return null;
  const c = size / 2, k = AFFECTED_CORE_SCALE;
  const transform = `translate(${c} ${c}) scale(${k}) translate(${-c} ${-c})`;
  return (
    <g transform={transform}>
      {cloneElement(outline, { fill: "black", stroke: "white", strokeWidth: (AFFECTED_CORE_RIM * 2) / k })}
      {cloneElement(outline, { fill: "black", stroke: "none" })}
    </g>
  );
}

// ── Male (square) ──────────────────────────────────────────────────────────────

function MaleSymbol({ size, fill, sectors, clipId }: { size: number; fill: FillDescriptor; sectors: Sector[]; clipId: string }) {
  const padding = 1;
  const outline = { x: padding, y: padding, width: size - 2 * padding, height: size - 2 * padding };
  return (
    <g>
      <clipPath id={clipId}><rect {...outline} /></clipPath>
      <rect
        {...outline}
        stroke="black" strokeWidth={2}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      <Sectors sectors={sectors} size={size} clipId={clipId} />
      <AffectedCore size={size} show={fill.type === "solid" && sectors.length > 0} outline={<rect {...outline} />} />
      {sectors.length > 0 && <rect {...outline} stroke="black" strokeWidth={2} fill="none" />}
    </g>
  );
}

// ── Female (circle) ────────────────────────────────────────────────────────────

function FemaleSymbol({ size, fill, sectors, clipId }: { size: number; fill: FillDescriptor; sectors: Sector[]; clipId: string }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 1;
  return (
    <g>
      <clipPath id={clipId}><circle cx={cx} cy={cy} r={r} /></clipPath>
      <circle
        cx={cx} cy={cy} r={r}
        stroke="black" strokeWidth={2}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      <Sectors sectors={sectors} size={size} clipId={clipId} />
      <AffectedCore size={size} show={fill.type === "solid" && sectors.length > 0} outline={<circle cx={cx} cy={cy} r={r} />} />
      {sectors.length > 0 && <circle cx={cx} cy={cy} r={r} stroke="black" strokeWidth={2} fill="none" />}
    </g>
  );
}

// ── Unknown sex (diamond) ──────────────────────────────────────────────────────

function UnknownSymbol({ size, fill, sectors, clipId }: { size: number; fill: FillDescriptor; sectors: Sector[]; clipId: string }) {
  const cx = size / 2, cy = size / 2;
  const points = [
    `${cx},1`,
    `${size - 1},${cy}`,
    `${cx},${size - 1}`,
    `1,${cy}`,
  ].join(" ");
  return (
    <g>
      <clipPath id={clipId}><polygon points={points} /></clipPath>
      <polygon
        points={points}
        stroke="black" strokeWidth={2}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      <Sectors sectors={sectors} size={size} clipId={clipId} />
      <AffectedCore size={size} show={fill.type === "solid" && sectors.length > 0} outline={<polygon points={points} />} />
      {sectors.length > 0 && <polygon points={points} stroke="black" strokeWidth={2} fill="none" />}
    </g>
  );
}

// ── Pregnancy and pregnancy loss (NSGC 2008) ───────────────────────────────────

/** Small triangle for miscarriage, termination (with slash) and ectopic pregnancy. */
function LossTriangle({ size, fill, slash, sectors, clipId }: {
  size: number; fill: FillDescriptor; slash: boolean; sectors: Sector[]; clipId: string;
}) {
  const s = lossSlashEnds(size);
  const points = lossTrianglePoints(size);
  return (
    <g>
      <clipPath id={clipId}><polygon points={points} /></clipPath>
      <polygon
        points={points}
        stroke="black" strokeWidth={2}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      <Sectors sectors={sectors} size={size} clipId={clipId} />
      <AffectedCore size={size} show={fill.type === "solid" && sectors.length > 0} outline={<polygon points={points} />} />
      {sectors.length > 0 && <polygon points={points} stroke="black" strokeWidth={2} fill="none" />}
      {slash && <SlashOverFill {...s} fill={fill} clipId={clipId} />}
    </g>
  );
}

/**
 * A slash through a symbol. Black, and on an affected (black) fill the part
 * inside the symbol is drawn again in white so the slash stays visible.
 */
function SlashOverFill({ x1, y1, x2, y2, fill, clipId }: {
  x1: number; y1: number; x2: number; y2: number; fill: FillDescriptor; clipId: string;
}) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth={2} />
      {fill.type === "solid" && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth={2} clipPath={`url(#${clipId})`} />
      )}
    </g>
  );
}

/**
 * Carrier dot, placed so it clears the pregnancy "P" and the loss triangle's
 * slash. Over tag colours it gets a white rim so it stays readable.
 */
function CarrierDot({ size, status, rim }: { size: number; status: LifeStatus | undefined; rim: boolean }) {
  const d = carrierDot(status, size);
  return rim
    ? <circle cx={d.cx} cy={d.cy} r={d.r + CARRIER_RIM / 2} fill="black" stroke="white" strokeWidth={CARRIER_RIM} />
    : <circle cx={d.cx} cy={d.cy} r={d.r} fill="black" />;
}

/** "P" inside the sex symbol of a current pregnancy. */
function PregnancyMark({ size, fill }: { size: number; fill: FillDescriptor }) {
  const carrier = fill.type === "carrier-dot";
  return (
    <text
      x={size / 2} y={pregnancyBaselineY(size, 0, carrier)}
      textAnchor="middle"
      fontFamily="sans-serif" fontSize={pregnancyFontSize(size, carrier)} fontWeight="bold"
      fill={fill.type === "solid" ? "white" : "black"}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      P
    </text>
  );
}

/** "SB" or "ECT" caption drawn under the symbol. */
function LifeStatusCaption({ size, text }: { size: number; text: string }) {
  return (
    <text
      x={size / 2} y={captionBaselineY(size)}
      textAnchor="middle"
      fontFamily="sans-serif" fontSize={CAPTION_FONT_SIZE}
      fill="black"
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {text}
    </text>
  );
}

function SexSymbol({ individual, size, fill, sectors, clipId }: {
  individual: Individual; size: number; fill: FillDescriptor; sectors: Sector[]; clipId: string;
}) {
  switch (individual.sex) {
    case "male":    return <MaleSymbol    size={size} fill={fill} sectors={sectors} clipId={clipId} />;
    case "female":  return <FemaleSymbol  size={size} fill={fill} sectors={sectors} clipId={clipId} />;
    case "unknown": return <UnknownSymbol size={size} fill={fill} sectors={sectors} clipId={clipId} />;
  }
}

/** Square brackets round the symbol of an adopted individual (NSGC). */
export function AdoptionBrackets({ size }: { size: number }) {
  return (
    <g data-adopted="true">
      {adoptionBracketSegments(size).map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth={2} />
      ))}
    </g>
  );
}

// ── SymbolShape (dispatcher) ───────────────────────────────────────────────────

export function SymbolShape({ individual, size, sectors = [], clipId, caption: showCaption = true }: ShapeProps) {
  const fill = symbolFill(individual);
  const id = clipId ?? `symbol-clip-${individual.id}`;
  const status = individual.lifeStatus;
  const brackets = individual.adopted ? <AdoptionBrackets size={size} /> : null;
  if (status) {
    const caption = showCaption ? lifeStatusCaption(status) : undefined;
    return (
      <g>
        {brackets}
        {usesLossTriangle(status)
          ? <LossTriangle size={size} fill={fill} slash={status === "termination"} sectors={sectors} clipId={id} />
          : <SexSymbol individual={individual} size={size} fill={fill} sectors={sectors} clipId={id} />}
        {fill.type === "carrier-dot" && <CarrierDot size={size} status={status} rim={sectors.length > 0} />}
        {status === "pregnancy"  && <PregnancyMark size={size} fill={fill} />}
        {status === "stillbirth" && (
          <SlashOverFill {...deceasedSlashEnds(size)} fill={fill} clipId={id} />
        )}
        {caption && <LifeStatusCaption size={size} text={caption} />}
      </g>
    );
  }
  return (
    <g>
      {brackets}
      <SexSymbol individual={individual} size={size} fill={fill} sectors={sectors} clipId={id} />
      {fill.type === "carrier-dot" && <CarrierDot size={size} status={undefined} rim={sectors.length > 0} />}
    </g>
  );
}

/**
 * Dot and text tags in a centred row just below the symbol. `offsetY` moves
 * the row down, e.g. past an "SB" / "ECT" caption.
 */
export function AnnotationRow({ items, size, offsetY = 0 }: { items: AnnotationItem[]; size: number; offsetY?: number }) {
  if (items.length === 0) return null;
  const cx = size / 2;
  const cy = size + ANNOTATION_Y + offsetY;
  return (
    <g>
      {items.map(({ tag, x }) =>
        tag.style === "dot" ? (
          <circle key={tag.id} cx={cx + x} cy={cy} r={ANNOTATION_DOT_RADIUS} fill={tag.color} />
        ) : (
          <text
            key={tag.id}
            x={cx + x} y={cy + ANNOTATION_FONT_SIZE / 2 - 1}
            textAnchor="middle"
            fontFamily="sans-serif" fontSize={ANNOTATION_FONT_SIZE} fontWeight="bold"
            fill={tag.color}
          >
            {tagCanvasText(tag)}
          </text>
        ),
      )}
    </g>
  );
}

// ── Overlays ───────────────────────────────────────────────────────────────────

function deceasedSlashEnds(size: number) {
  const overhang = 4;
  return { x1: -overhang, y1: -overhang, x2: size + overhang, y2: size + overhang };
}

export function DeceasedSlash({ size }: { size: number }) {
  return <line {...deceasedSlashEnds(size)} stroke="black" strokeWidth={2} />;
}

/**
 * NSGC proband or consultand arrow (#99): solid arrowhead pointing up-right
 * at the symbol's bottom-left corner, with a "P" at the tail for the proband
 * only. Geometry in `proband.ts`, shared with the exporters. The default
 * marker id is registered globally in PedigreeCanvas to avoid duplicate defs.
 */
export function ProbandArrow({ size, kind = "proband", markerId = "proband-arrowhead" }: { size: number; kind?: ArrowKind; markerId?: string }) {
  const { tip, tail, letter, letterBox } = arrowGeometry(size);
  return (
    <g data-arrow={kind}>
      <line
        x1={tail.x} y1={tail.y}
        x2={tip.x}  y2={tip.y}
        stroke="black" strokeWidth={2}
        markerEnd={`url(#${markerId})`}
      />
      {kind === "proband" && (
        <rect x={letterBox.x} y={letterBox.y} width={letterBox.w} height={letterBox.h} fill="white" />
      )}
      {kind === "proband" && (
        <text
          x={letter.x} y={letter.y}
          textAnchor="end" fontFamily="sans-serif" fontSize={PROBAND_LETTER_SIZE} fontWeight="bold" fill="black"
          style={{ userSelect: "none" }}
        >
          {PROBAND_LETTER}
        </text>
      )}
    </g>
  );
}

/** "?" above the symbol: family history not known (#100). Placement in `familyHistory.ts`. */
export function FamilyHistoryMark({ size, hasParents }: { size: number; hasParents: boolean }) {
  const p = familyHistoryMarkAt(size, hasParents);
  return (
    <text
      data-family-history-unknown
      x={p.x} y={p.y}
      textAnchor="middle" fontFamily="sans-serif" fontSize={FAMILY_HISTORY_FONT_SIZE} fontWeight="bold" fill="black"
      style={{ userSelect: "none" }}
    >
      ?
    </text>
  );
}

export function DuplicateSuperscript({ index }: { index: number }) {
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
