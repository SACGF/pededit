import { cloneElement } from "react";
import type { Individual } from "@pedigree-editor/layout-engine";
import {
  sectorPath, tagCanvasText, AFFECTED_CORE_SCALE, AFFECTED_CORE_RIM,
  ANNOTATION_Y, ANNOTATION_DOT_RADIUS, ANNOTATION_FONT_SIZE,
} from "../tags";
import type { Sector, AnnotationItem, SymbolPaint } from "../tags";
import type { PersonGlyph } from "../personGlyph";
import { fillLayers, type FillBox } from "../tagFills";
import type { TagFill } from "@pedigree-editor/layout-engine";
import {
  usesLossTriangle, lifeStatusCaption, captionBaselineY, CAPTION_FONT_SIZE,
  lossTrianglePoints, lossSlashEnds, pregnancyFontSize, pregnancyBaselineY, carrierDot, CARRIER_RIM,
} from "../lifeStatus";
import type { LifeStatus } from "@pedigree-editor/layout-engine";
import { adoptionBracketSegments } from "../adoption";
import { symbolLetter, roleLetterFontSize, roleLetterBaselineY, roleLetterFill } from "../assisted";
import { familyHistoryMarkAt, FAMILY_HISTORY_FONT_SIZE } from "../familyHistory";
import {
  drawsPresymptomatic, presymptomaticLine, documentedMarkAt, PRESYMPTOMATIC_RIM, PRESYMPTOMATIC_STROKE,
  DOCUMENTED_FONT_SIZE, DOCUMENTED_MARK,
} from "../evaluation";
import { arrowGeometry, PROBAND_LETTER, PROBAND_LETTER_SIZE, type ArrowKind } from "../proband";
import { DECEASED_OVERHANG, LINE_WIDTH } from "../constants";
import { COPY_NUMBER_FONT_SIZE, copyNumberAt, textUnder, type TextBacking } from "../labelBlock";
import { LABEL_FONT_SIZE, LABEL_LINE_HEIGHT, linesWidth } from "../labels";
import { branchCountBaseline, branchCountFontSize } from "../collapse";

// ── Fill descriptor ────────────────────────────────────────────────────────────

type FillDescriptor =
  | { type: "solid" }
  | { type: "empty" }
  | { type: "carrier-dot" };

function symbolFill(paint: SymbolPaint): FillDescriptor {
  if (paint.base === "black") return { type: "solid" };
  if (paint.dot) return { type: "carrier-dot" };
  return { type: "empty" };
}

/** What `SymbolShape` draws: the symbol's part of a person's glyph. */
export type SymbolGlyph = Pick<PersonGlyph, "shape" | "lifeStatus" | "caption" | "adopted" | "letter" | "paint">;

/**
 * The symbol of someone drawn without their pedigree (legend swatches):
 * their sex, and the 2008 paint rules on the person alone. A person on the
 * chart is drawn from their glyph (`personGlyph`).
 */
export function standaloneGlyph(individual: Individual): SymbolGlyph {
  const letter = symbolLetter(individual);
  const caption = lifeStatusCaption(individual.lifeStatus);
  return {
    shape: individual.sex,
    ...(individual.lifeStatus ? { lifeStatus: individual.lifeStatus } : {}),
    ...(caption ? { caption } : {}),
    ...(individual.adopted ? { adopted: individual.adopted } : {}),
    ...(letter ? { letter } : {}),
    paint: {
      sectors: [], base: individual.affected ? "black" : "white", core: false,
      dot: !!individual.carrier && !individual.affected,
      line: drawsPresymptomatic(individual, { tags: [] }),
    },
  };
}

// ── Shape props ────────────────────────────────────────────────────────────────

interface ShapeProps {
  /** What to draw: a person's glyph, or `standaloneGlyph` for a swatch. */
  glyph: SymbolGlyph;
  size: number;
  /** Unique id for this symbol's clipPath. Needed when the paint has sectors. */
  clipId?: string;
  /**
   * Degrees to turn the letters ("D", "S", the "P" of a pregnancy) back by,
   * for a symbol drawn turned (the U-shape): on their side they read as other
   * letters. Slashes turn with the symbol.
   */
  upright?: number;
  /**
   * Degrees to turn the outline (with its fill, sections, adoption brackets
   * and presymptomatic line) by about its centre, within a symbol drawn
   * turned: the U-shape keeps a square a square and a diamond a diamond this
   * way (`outlineRotation`). The slashes, letters and marks beside it stay.
   */
  outlineTurn?: number;
}

/** A turn of `deg` degrees about (x, y), or nothing for none. */
const turn = (deg: number | undefined, x: number, y: number) => (deg ? { transform: `rotate(${deg} ${x} ${y})` } : {});

/**
 * Tag sectors, clipped to the symbol outline. The radius is the full symbol
 * size so the clip, not the arc, defines the edge: a quarter of a square comes
 * out square-cornered.
 */
function Sectors({ sectors, size, clipId }: { sectors: Sector[]; size: number; clipId: string }) {
  if (sectors.length === 0) return null;
  const c = size / 2;
  const box = { x: 0, y: 0, size };
  return (
    <g clipPath={`url(#${clipId})`}>
      {sectors.map((s, i) => (
        // data-carrier-sector: which condition's carrier fill this is, for page checks.
        <g key={s.tag.id} data-carrier-sector={s.carrier ? s.tag.id : undefined}>
          <RegionFill
            fill={s.fill ?? "solid"} color={s.color ?? s.tag.color} box={box}
            d={sectorPath(c, c, size, s.start, s.end)} clipId={`${clipId}-s${i}`}
          />
        </g>
      ))}
    </g>
  );
}

/**
 * Fill the region `d` with pattern `fill` in `color`, from `fillLayers` in
 * tagFills.ts. `clipId` must be unique on the page; it clips the pattern
 * marks to the region.
 * Clip to a symbol outline by wrapping this in a clipped <g>.
 */
export function RegionFill({ fill, color, d, box, clipId }: { fill: TagFill; color: string; d: string; box: FillBox; clipId: string }) {
  const layers = fillLayers(fill, color, d, box);
  return (
    <g data-tag-fill={fill}>
      {layers.some(l => l.clip) && <clipPath id={clipId}><path d={d} /></clipPath>}
      {layers.map((l, i) => (
        <path
          key={i} d={l.d} fill={l.fill} stroke={l.stroke} strokeWidth={l.strokeWidth}
          clipPath={l.clip ? `url(#${clipId})` : undefined}
        />
      ))}
    </g>
  );
}

/**
 * Black centre for an affected person whose symbol carries quadrant tags, so
 * affected status stays visible when tags cover every quarter. `outline` is
 * the symbol's own outline element; it is drawn scaled about the centre.
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

function MaleSymbol({ size, fill, sectors, core, clipId, clip }: { size: number; fill: FillDescriptor; sectors: Sector[]; core: boolean; clipId: string; clip: boolean }) {
  // Inset by half the stroke, as the circle and diamond are, so the outer
  // edge is the box and a square stands as tall as a circle.
  const padding = 1;
  const outline = { x: padding, y: padding, width: size - 2 * padding, height: size - 2 * padding };
  return (
    <g>
      {clip && <clipPath id={clipId}><rect {...outline} /></clipPath>}
      <rect
        {...outline}
        stroke="black" strokeWidth={LINE_WIDTH}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      <Sectors sectors={sectors} size={size} clipId={clipId} />
      <AffectedCore size={size} show={core} outline={<rect {...outline} />} />
      {sectors.length > 0 && <rect {...outline} stroke="black" strokeWidth={LINE_WIDTH} fill="none" />}
    </g>
  );
}

// ── Female (circle) ────────────────────────────────────────────────────────────

function FemaleSymbol({ size, fill, sectors, core, clipId, clip }: { size: number; fill: FillDescriptor; sectors: Sector[]; core: boolean; clipId: string; clip: boolean }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 1;
  return (
    <g>
      {clip && <clipPath id={clipId}><circle cx={cx} cy={cy} r={r} /></clipPath>}
      <circle
        cx={cx} cy={cy} r={r}
        stroke="black" strokeWidth={LINE_WIDTH}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      <Sectors sectors={sectors} size={size} clipId={clipId} />
      <AffectedCore size={size} show={core} outline={<circle cx={cx} cy={cy} r={r} />} />
      {sectors.length > 0 && <circle cx={cx} cy={cy} r={r} stroke="black" strokeWidth={LINE_WIDTH} fill="none" />}
    </g>
  );
}

// ── Unknown sex (diamond) ──────────────────────────────────────────────────────

function UnknownSymbol({ size, fill, sectors, core, clipId, clip }: { size: number; fill: FillDescriptor; sectors: Sector[]; core: boolean; clipId: string; clip: boolean }) {
  const cx = size / 2, cy = size / 2;
  const points = [
    `${cx},1`,
    `${size - 1},${cy}`,
    `${cx},${size - 1}`,
    `1,${cy}`,
  ].join(" ");
  return (
    <g>
      {clip && <clipPath id={clipId}><polygon points={points} /></clipPath>}
      <polygon
        points={points}
        stroke="black" strokeWidth={LINE_WIDTH}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      <Sectors sectors={sectors} size={size} clipId={clipId} />
      <AffectedCore size={size} show={core} outline={<polygon points={points} />} />
      {sectors.length > 0 && <polygon points={points} stroke="black" strokeWidth={LINE_WIDTH} fill="none" />}
    </g>
  );
}

// ── Pregnancy and pregnancy loss (NSGC 2008) ───────────────────────────────────

/** Small triangle for miscarriage, termination (with slash) and ectopic pregnancy. */
function LossTriangle({ size, fill, slash, sectors, core, clipId, clip }: {
  size: number; fill: FillDescriptor; slash: boolean; sectors: Sector[]; core: boolean; clipId: string; clip: boolean;
}) {
  const s = lossSlashEnds(size);
  const points = lossTrianglePoints(size);
  return (
    <g>
      {clip && <clipPath id={clipId}><polygon points={points} /></clipPath>}
      <polygon
        points={points}
        stroke="black" strokeWidth={LINE_WIDTH}
        fill={fill.type === "solid" ? "black" : "white"}
      />
      <Sectors sectors={sectors} size={size} clipId={clipId} />
      <AffectedCore size={size} show={core} outline={<polygon points={points} />} />
      {sectors.length > 0 && <polygon points={points} stroke="black" strokeWidth={LINE_WIDTH} fill="none" />}
      {slash && <SlashOverFill {...s} fill={fill} clipId={clipId} />}
    </g>
  );
}

/**
 * A slash through a symbol. Black, and on an affected (black) fill the part
 * inside the symbol is drawn again in white so the slash stays visible.
 */
function SlashOverFill({ x1, y1, x2, y2, fill, clipId, outlineTurn, size }: {
  x1: number; y1: number; x2: number; y2: number; fill: FillDescriptor; clipId: string;
  /** The outline's turn (`ShapeProps`): the clip follows the outline, the slash does not. */
  outlineTurn?: number; size?: number;
}) {
  const c = (size ?? 0) / 2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth={LINE_WIDTH} />
      {fill.type === "solid" && (outlineTurn
        // A clip is read in the space of the element that uses it, so the
        // white slash is turned back inside a group turned like the outline.
        ? <g {...turn(outlineTurn, c, c)} clipPath={`url(#${clipId})`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth={LINE_WIDTH} {...turn(-outlineTurn, c, c)} />
          </g>
        : <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth={LINE_WIDTH} clipPath={`url(#${clipId})`} />
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

/**
 * Presymptomatic carrier: a vertical line through the symbol, with a
 * white rim over tag colours as the carrier dot has. Geometry in `evaluation.ts`.
 */
function PresymptomaticLine({ size, status, rim }: { size: number; status: LifeStatus | undefined; rim: boolean }) {
  const l = presymptomaticLine(status, size);
  return (
    <g data-presymptomatic="true">
      {rim && <line {...l} stroke="white" strokeWidth={PRESYMPTOMATIC_STROKE + 2 * PRESYMPTOMATIC_RIM} />}
      <line {...l} stroke="black" strokeWidth={PRESYMPTOMATIC_STROKE} />
    </g>
  );
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

function SexSymbol({ shape, size, fill, sectors, core, clipId, clip }: {
  shape: Individual["sex"]; size: number; fill: FillDescriptor; sectors: Sector[]; core: boolean; clipId: string; clip: boolean;
}) {
  switch (shape) {
    case "male":    return <MaleSymbol    size={size} fill={fill} sectors={sectors} core={core} clipId={clipId} clip={clip} />;
    case "female":  return <FemaleSymbol  size={size} fill={fill} sectors={sectors} core={core} clipId={clipId} clip={clip} />;
    case "unknown": return <UnknownSymbol size={size} fill={fill} sectors={sectors} core={core} clipId={clipId} clip={clip} />;
  }
}

/** Square brackets round the symbol of an adopted individual (NSGC). */
export function AdoptionBrackets({ size, adopted }: { size: number; adopted: string }) {
  return (
    <g data-adopted={adopted}>
      {adoptionBracketSegments(size).map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth={LINE_WIDTH} />
      ))}
    </g>
  );
}

// ── SymbolShape (dispatcher) ───────────────────────────────────────────────────

export function SymbolShape({ glyph, size, clipId: id = "symbol-clip", upright, outlineTurn }: ShapeProps) {
  const { paint, shape } = glyph;
  const fill = symbolFill(paint);
  const { sectors, core } = paint;
  const status = glyph.lifeStatus;
  // The outline as a clip path, only where something is clipped to it: the
  // sections, and a slash redrawn in white over a black fill.
  const clip = sectors.length > 0 || (fill.type === "solid" && (status === "termination" || status === "stillbirth"));
  const brackets = glyph.adopted ? <AdoptionBrackets size={size} adopted={glyph.adopted} /> : null;
  const sexSymbol = <SexSymbol shape={shape} size={size} fill={fill} sectors={sectors} core={core} clipId={id} clip={clip} />;
  const line = paint.line ? <PresymptomaticLine size={size} status={status} rim={sectors.length > 0} /> : null;
  // What turns with a turned outline: the brackets round it, the outline with
  // its fill and sections, and the presymptomatic line across it.
  const outlined = (shapeEl: React.ReactElement, dot: React.ReactNode) => outlineTurn
    ? <><g {...turn(outlineTurn, size / 2, size / 2)}>{brackets}{shapeEl}</g>{dot}{line && <g {...turn(outlineTurn, size / 2, size / 2)}>{line}</g>}</>
    : <>{brackets}{shapeEl}{dot}{line}</>;
  if (status) {
    const caption = glyph.caption;
    return (
      <g>
        {outlined(
          usesLossTriangle(status)
            ? <LossTriangle size={size} fill={fill} slash={status === "termination"} sectors={sectors} core={core} clipId={id} clip={clip} />
            : sexSymbol,
          fill.type === "carrier-dot" && <CarrierDot size={size} status={status} rim={sectors.length > 0} />,
        )}
        {status === "pregnancy"  && <g {...turn(upright, size / 2, size / 2)}><PregnancyMark size={size} fill={fill} /></g>}
        {status === "stillbirth" && (
          <SlashOverFill {...deceasedSlashEnds(size)} fill={fill} clipId={id} outlineTurn={outlineTurn} size={size} />
        )}
        {caption && <LifeStatusCaption size={size} text={caption} />}
      </g>
    );
  }
  return (
    <g>
      {outlined(sexSymbol, fill.type === "carrier-dot" && <CarrierDot size={size} status={undefined} rim={sectors.length > 0} />)}
      {glyph.letter && <g {...turn(upright, size / 2, size / 2)}><RoleLetter letter={glyph.letter} size={size} halo={sectors.length > 0} base={paint.base} /></g>}
    </g>
  );
}

/**
 * "D" (gamete donor) or "S" (surrogate) inside the symbol. White on a
 * filled symbol; with a white halo over tag colours so it stays legible.
 */
function RoleLetter({ letter, size, halo = false, base = "white" }: { letter: string; size: number; halo?: boolean; base?: "black" | "white" }) {
  return (
    <text
      data-role-letter={letter}
      x={size / 2} y={roleLetterBaselineY(size)}
      textAnchor="middle" fontFamily="sans-serif" fontSize={roleLetterFontSize(size)} fontWeight="bold"
      fill={roleLetterFill(base)}
      {...(halo ? { stroke: "white", strokeWidth: 3, paintOrder: "stroke" } : {})}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {letter}
    </text>
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
      {items.map(({ tag, x, color }) =>
        tag.style === "dot" ? (
          <circle key={tag.id} cx={cx + x} cy={cy} r={ANNOTATION_DOT_RADIUS} fill={color} />
        ) : (
          <text
            key={tag.id}
            x={cx + x} y={cy + ANNOTATION_FONT_SIZE / 2 - 1}
            textAnchor="middle"
            fontFamily="sans-serif" fontSize={ANNOTATION_FONT_SIZE} fontWeight="bold"
            fill={color}
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
  const o = DECEASED_OVERHANG;
  return { x1: -o, y1: -o, x2: size + o, y2: size + o };
}

export function DeceasedSlash({ size }: { size: number }) {
  return <line {...deceasedSlashEnds(size)} stroke="black" strokeWidth={LINE_WIDTH} />;
}

/** The arrowhead of the proband and consultand arrows, defined once per drawing as `id`. */
export function ProbandMarkerDef({ id = "proband-arrowhead" }: { id?: string }) {
  return (
    <marker id={id} markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M 0 0 L 6 3 L 0 6 Z" fill="black" />
    </marker>
  );
}

/**
 * NSGC proband or consultand arrow: solid arrowhead pointing up-right
 * at the symbol's bottom-left corner, with a "P" at the tail for the proband
 * only. Geometry in `proband.ts`, shared with the exporters. The default
 * marker id is registered globally in PedigreeCanvas to avoid duplicate defs.
 */
export function ProbandArrow({ size, kind = "proband", markerId = "proband-arrowhead", upright }: { size: number; kind?: ArrowKind; markerId?: string; upright?: number }) {
  const { tip, tail, letter, letterBox } = arrowGeometry(size);
  // A turned symbol (the U-shape) keeps its "P" upright, about the letter's own anchor.
  const letterTurn = turn(upright, letter.x, letter.y - PROBAND_LETTER_SIZE / 2);
  return (
    <g data-arrow={kind}>
      <line
        x1={tail.x} y1={tail.y}
        x2={tip.x}  y2={tip.y}
        stroke="black" strokeWidth={LINE_WIDTH}
        markerEnd={`url(#${markerId})`}
      />
      {kind === "proband" && (
        <rect x={letterBox.x} y={letterBox.y} width={letterBox.w} height={letterBox.h} fill="white" {...letterTurn} />
      )}
      {kind === "proband" && (
        <text
          data-proband-letter x={letter.x} y={letter.y} {...letterTurn}
          textAnchor="end" fontFamily="sans-serif" fontSize={PROBAND_LETTER_SIZE} fontWeight="bold" fill="black"
          style={{ userSelect: "none" }}
        >
          {PROBAND_LETTER}
        </text>
      )}
    </g>
  );
}

/** "?" above the symbol: family history not known. Placement in `familyHistory.ts`. */
export function FamilyHistoryMark({ size, hasParents, upright }: { size: number; hasParents: boolean; upright?: number }) {
  const p = familyHistoryMarkAt(size, hasParents);
  return (
    <text
      data-family-history-unknown
      x={p.x} y={p.y} {...turn(upright, p.x, p.y - FAMILY_HISTORY_FONT_SIZE / 3)}
      textAnchor="middle" fontFamily="sans-serif" fontSize={FAMILY_HISTORY_FONT_SIZE} fontWeight="bold" fill="black"
      style={{ userSelect: "none" }}
    >
      ?
    </text>
  );
}

/** "*" at the lower right: a documented evaluation. Placement in `evaluation.ts`. */
export function DocumentedMark({ size, adopted, upright }: { size: number; adopted: boolean; upright?: number }) {
  const p = documentedMarkAt(size, adopted);
  return (
    <text
      data-documented-evaluation
      x={p.x} y={p.y} {...turn(upright, p.x + 3.5, p.y - DOCUMENTED_FONT_SIZE / 2)}
      fontFamily="sans-serif" fontSize={DOCUMENTED_FONT_SIZE} fill="black"
      style={{ userSelect: "none" }}
    >
      {DOCUMENTED_MARK}
    </text>
  );
}

/**
 * The name and detail lines under a symbol of size `size` drawn from its
 * top left corner, placed by `textUnder` as the export places them. A cut
 * name (`nameCut`, #68) takes the mouse, through a hit box the size of its
 * lines (text alone is hit only where its letters are painted), and reports
 * it to `onNameHover`; otherwise the text lets the mouse through.
 */
export function TextUnderSymbol({ glyph, nameLines, size, nameCut = false, onNameHover, fullName }: {
  glyph: Pick<PersonGlyph, "caption" | "annotations" | "detailLines" | "detailsBacked" | "labelsBacked">;
  nameLines: string[];
  size: number;
  nameCut?: boolean;
  onNameHover?: (over: boolean) => void;
  /** In a file: the name in full, kept as a `<title>` on the first line when the lines cut it. */
  fullName?: string;
}) {
  const at = textUnder(glyph, nameLines);
  const c = size / 2;
  const backing = (b: TextBacking) => <rect x={b.x} y={b.y} width={b.width} height={b.height} fill="white" />;
  const line = (text: string, y: number, key: number, title?: string) => (
    <text key={key} x={0} y={y} textAnchor="middle" fontFamily="sans-serif" fontSize={LABEL_FONT_SIZE} fill="black">
      {title && <title>{title}</title>}{text}
    </text>
  );
  const nameWidth = linesWidth(nameLines) + 4;
  return (
    <g transform={`translate(${c} ${c})`} style={{ userSelect: "none" }}>
      {nameLines.length > 0 && (
        <g
          data-name-label
          data-name-cut={nameCut ? "true" : undefined}
          pointerEvents={nameCut ? "auto" : "none"}
          onMouseEnter={nameCut ? () => onNameHover?.(true) : undefined}
          onMouseLeave={nameCut ? () => onNameHover?.(false) : undefined}
        >
          {at.nameBacking && backing(at.nameBacking)}
          {nameCut && (
            <rect
              x={-nameWidth / 2} y={at.nameY[0]! - LABEL_FONT_SIZE}
              width={nameWidth} height={nameLines.length * LABEL_LINE_HEIGHT} fill="transparent"
            />
          )}
          {nameLines.map((text, k) => line(text, at.nameY[k]!, k, k === 0 && fullName && text !== fullName ? fullName : undefined))}
        </g>
      )}
      {glyph.detailLines.length > 0 && (
        <g data-detail-label pointerEvents="none">
          {at.detailBacking && backing(at.detailBacking)}
          {glyph.detailLines.map((text, k) => line(text, at.detailY[k]!, k))}
        </g>
      )}
    </g>
  );
}

/** Copy number of someone drawn more than once, beside the top right corner. Placement in `labelBlock.ts`. */
export function CopyNumber({ size, index }: { size: number; index: number }) {
  const at = copyNumberAt(size);
  return (
    <text
      data-copy-number={index}
      x={size / 2 + at.x} y={size / 2 + at.y}
      fontFamily="sans-serif" fontSize={COPY_NUMBER_FONT_SIZE} fill="black"
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {index}
    </text>
  );
}

/** The number inside a collapsed-branch group symbol. Placement in `collapse.ts`. */
export function BranchCount({ size, count, upright }: { size: number; count: number; upright?: number }) {
  return (
    <text
      data-branch-count={count}
      x={size / 2} y={size / 2 + branchCountBaseline(count, size)} {...turn(upright, size / 2, size / 2)}
      textAnchor="middle" fontFamily="sans-serif" fontSize={branchCountFontSize(count, size)} fill="black"
      style={{ userSelect: "none" }}
    >
      {count}
    </text>
  );
}
