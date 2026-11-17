import type { Pedigree, Tag, LifeStatus } from "@pedigree-editor/layout-engine";
import { conditionSection, conditionPaint, conditionCarrierPaint, sectorPath, tagCanvasText, PLAIN_CARRIER_TAG, PLAIN_CARRIER_ANGLES, ANNOTATION_DOT_RADIUS, ANNOTATION_FONT_SIZE } from "../pedigree/tags";
import { CONDITIONS_AND_TAGS } from "../pedigree/conditions";
import { SymbolShape, ProbandArrow, FamilyHistoryMark, DocumentedMark, RegionFill } from "../pedigree/nodes/symbols";
import { PLAIN_CARRIER_PAINT } from "../pedigree/tagFills";
import { type ArrowKind } from "../pedigree/proband";
import { ADOPTION_DASH } from "../pedigree/adoption";
import type { Zygosity } from "@pedigree-editor/layout-engine";
import type { ChildlessStatus, Adoption, ReproductiveRole } from "@pedigree-editor/layout-engine";
import { endedMarkSegments } from "@/pedigree/ended";
import { segmentsPathD } from "@/pedigree/sibshipPath";
import { Button } from "@/components/ui/button";
import { Tags } from "lucide-react";
import { keyRows, type KeyRow } from "@/pedigree/keyRows";

/**
 * The figure legend, on the edit panel's Pedigree tab. A
 * person's own conditions and tags, with the same swatches, are edited on the
 * Person tab (`ConditionsAndTags`). Which rows it has comes from `keyRows`
 * (`pedigree/keyRows.ts`), the list the exported key draws from too;
 * this file draws their swatches.
 */

type Sex = "male" | "female" | "unknown";

const SZ = 24; // base symbol size for legend icons

// ── Inline SVG symbol renderers ────────────────────────────────────────────────

function SymbolSvg({ sex, affected = false, carrier = false }: { sex: Sex; affected?: boolean; carrier?: boolean }) {
  const fill = affected ? "black" : "white";
  const cx = SZ / 2, cy = SZ / 2, r = SZ / 2 - 1;
  return (
    <svg width="28" height="28" viewBox="-2 -2 28 28">
      {sex === "male" && (
        <rect x={1} y={1} width={SZ - 2} height={SZ - 2} stroke="black" strokeWidth={2} fill={fill} />
      )}
      {sex === "female" && (
        <circle cx={cx} cy={cy} r={r} stroke="black" strokeWidth={2} fill={fill} />
      )}
      {sex === "unknown" && (
        <polygon
          points={`${cx},1 ${SZ - 1},${cy} ${cx},${SZ - 1} 1,${cy}`}
          stroke="black" strokeWidth={2} fill={fill}
        />
      )}
      {carrier && !affected && (
        <circle cx={cx} cy={cy} r={SZ * 0.15} fill="black" />
      )}
    </svg>
  );
}

function DeceasedSvg({ sex }: { sex: Sex }) {
  const cx = SZ / 2, cy = SZ / 2, r = SZ / 2 - 1;
  return (
    <svg width="36" height="36" viewBox="-6 -6 36 36">
      {sex === "male" && (
        <rect x={1} y={1} width={SZ - 2} height={SZ - 2} stroke="black" strokeWidth={2} fill="white" />
      )}
      {sex === "female" && (
        <circle cx={cx} cy={cy} r={r} stroke="black" strokeWidth={2} fill="white" />
      )}
      {sex === "unknown" && (
        <polygon
          points={`${cx},1 ${SZ - 1},${cy} ${cx},${SZ - 1} 1,${cy}`}
          stroke="black" strokeWidth={2} fill="white"
        />
      )}
      <line x1={-4} y1={-4} x2={SZ + 4} y2={SZ + 4} stroke="black" strokeWidth={2} />
    </svg>
  );
}

/** Symbol with the "?" above it: family history not known. */
function FamilyHistorySvg({ sex }: { sex: Sex }) {
  return (
    <svg width="36" height="36" viewBox="-6 -14 36 42">
      <SymbolShape individual={{ id: "legend", sex, affected: false, sibOrder: 0 }} size={SZ} />
      <FamilyHistoryMark size={SZ} hasParents={false} />
    </svg>
  );
}

/** Carrier with no condition recorded in NSGC 2022: the canvas's own dotted right half. */
function PlainCarrierSvg({ sex }: { sex: Sex }) {
  const [start, end] = PLAIN_CARRIER_ANGLES;
  return (
    <svg width="28" height="28" viewBox="-2 -2 28 28">
      <SymbolShape
        individual={{ id: "legend", sex, affected: false, sibOrder: 0 }}
        size={SZ}
        paint={{ sectors: [{ tag: PLAIN_CARRIER_TAG, start, end, ...PLAIN_CARRIER_PAINT, carrier: true }], base: "white", core: false, dot: false }}
        clipId={`legend-plain-carrier-${sex}`}
      />
    </svg>
  );
}

/** Presymptomatic carrier: the canvas's own symbol with its vertical line. */
function PresymptomaticSvg({ sex }: { sex: Sex }) {
  return (
    <svg width="28" height="28" viewBox="-2 -2 28 28">
      <SymbolShape individual={{ id: "legend", sex, affected: false, presymptomatic: true, sibOrder: 0 }} size={SZ} />
    </svg>
  );
}

/** "+/-" (2022) or "E" (2008) for the result marks row. */
function EvaluationSvg({ mark }: { mark: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <text x={14} y={18} textAnchor="middle" fontFamily="sans-serif" fontSize={12} fill="black">{mark}</text>
    </svg>
  );
}

/** Symbol with the "*" at its lower right: documented evaluation. */
function DocumentedSvg({ sex }: { sex: Sex }) {
  const s = 18;
  return (
    <svg width="28" height="28" viewBox="-2 -2 30 30">
      <SymbolShape individual={{ id: "legend", sex, affected: false, sibOrder: 0 }} size={s} />
      <DocumentedMark size={s} adopted={false} />
    </svg>
  );
}

/** Proband arrow with its "P", or the consultand's without, drawn by the canvas's own ProbandArrow. */
function ProbandSvg({ sex, kind }: { sex: Sex; kind: ArrowKind }) {
  const cx = SZ / 2, cy = SZ / 2, r = SZ / 2 - 1;
  return (
    <svg width="46" height="46" viewBox="-30 -2 56 56">
      <defs>
        <marker id="legend-arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 6 3, 0 6" fill="black" />
        </marker>
      </defs>
      {sex === "male" && (
        <rect x={1} y={1} width={SZ - 2} height={SZ - 2} stroke="black" strokeWidth={2} fill="white" />
      )}
      {sex === "female" && (
        <circle cx={cx} cy={cy} r={r} stroke="black" strokeWidth={2} fill="white" />
      )}
      {sex === "unknown" && (
        <polygon
          points={`${cx},1 ${SZ - 1},${cy} ${cx},${SZ - 1} 1,${cy}`}
          stroke="black" strokeWidth={2} fill="white"
        />
      )}
      <ProbandArrow size={SZ} kind={kind} markerId="legend-arrowhead" />
    </svg>
  );
}

/**
 * How a tag looks on a symbol: its section of a square, a dot, or coloured
 * text. `carrier`: the condition's carrier fill.
 */
export function TagSwatchSvg({ tag, pedigree, carrier = false }: { tag: Tag; pedigree: Pedigree; carrier?: boolean }) {
  const s = 16, x = 6, y = 6, cx = x + s / 2, cy = y + s / 2;
  const paint = carrier ? conditionCarrierPaint(tag, pedigree) : conditionPaint(tag, pedigree);
  if (tag.style === "quadrant") {
    const [start, end] = conditionSection(tag, pedigree).angles;
    const clipId = `legend-clip-${tag.id}${carrier ? "-carrier" : ""}`;
    return (
      <svg width="28" height="28" viewBox="0 0 28 28">
        <clipPath id={clipId}><rect x={x} y={y} width={s} height={s} /></clipPath>
        <rect x={x} y={y} width={s} height={s} fill="white" stroke="black" strokeWidth={1.5} />
        <g clipPath={`url(#${clipId})`}>
          <RegionFill fill={paint.fill} color={paint.color} d={sectorPath(cx, cy, s, start, end)} box={{ x, y, size: s }} clipId={`${clipId}-fill`} />
        </g>
        <rect x={x} y={y} width={s} height={s} fill="none" stroke="black" strokeWidth={1.5} />
      </svg>
    );
  }
  if (tag.style === "dot") {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx={14} cy={14} r={ANNOTATION_DOT_RADIUS} fill={paint.color} />
      </svg>
    );
  }
  return (
    <svg width="40" height="28" viewBox="0 0 40 28">
      <text x={20} y={14 + ANNOTATION_FONT_SIZE / 2 - 1} textAnchor="middle" fontFamily="sans-serif" fontSize={ANNOTATION_FONT_SIZE} fontWeight="bold" fill={paint.color}>
        {tagCanvasText(tag)}
      </text>
    </svg>
  );
}

/** A tagged affected person: light grey standing for any tag colours, round the black centre. */
function AffectedCoreSvg({ sex }: { sex: Sex }) {
  const sample: Tag = { id: "legend-sample", label: "", color: "#bdbdbd", style: "quadrant" };
  return (
    <svg width="28" height="28" viewBox="-2 -2 28 28">
      <SymbolShape
        individual={{ id: "", sex, affected: true, sibOrder: 0 }}
        size={SZ}
        paint={{ sectors: [{ tag: sample, start: 0, end: 360, color: sample.color, fill: "solid" }], base: "white", core: true, dot: false }}
        clipId="legend-affected-core"
      />
    </svg>
  );
}

/** Adoption brackets reuse the canvas renderer; wider so the brackets fit. */
function AdoptedSvg({ sex, adopted }: { sex: Sex; adopted: Adoption }) {
  return (
    <svg width="36" height="28" viewBox="-8 -4 36 28">
      <SymbolShape individual={{ id: "", sex, affected: false, sibOrder: 0, adopted }} size={SZ} clipId={`legend-adopted-${adopted}`} />
    </svg>
  );
}

/** "D" or "S" inside the symbol, from the canvas renderer. */
function RoleSvg({ sex, role }: { sex: Sex; role: ReproductiveRole }) {
  return (
    <svg width="28" height="28" viewBox="-2 -2 28 28">
      <SymbolShape individual={{ id: "", sex, affected: false, sibOrder: 0, reproductiveRole: role }} size={SZ} clipId={`legend-role-${role}`} />
    </svg>
  );
}

/** A slanting line of assisted reproduction, dashed for a social parent. */
function AssistedLineSvg({ dashed }: { dashed: boolean }) {
  return (
    <svg width="48" height="20" viewBox="0 0 48 20">
      <line x1={14} y1={2} x2={34} y2={18} stroke="black" strokeWidth={2} strokeDasharray={dashed ? ADOPTION_DASH : undefined} />
    </svg>
  );
}

/** A collapsed branch: a diamond with "n" in it. */
function CollapsedBranchSvg() {
  const c = SZ / 2;
  return (
    <svg width="28" height="28" viewBox="-2 -2 28 28">
      <polygon points={`${c},1 ${SZ - 1},${c} ${c},${SZ - 1} 1,${c}`} stroke="black" strokeWidth={2} fill="white" />
      <text x={c} y={c + 4} textAnchor="middle" fontFamily="sans-serif" fontSize={11} fontStyle="italic">n</text>
    </svg>
  );
}

/** Pregnancy / loss symbols reuse the canvas renderer so the legend matches exactly. */
function LifeStatusSvg({ sex, lifeStatus }: { sex: Sex; lifeStatus: LifeStatus }) {
  // Extra room below for the "SB" / "ECT" caption and the stillbirth slash overhang.
  return (
    <svg width="36" height="40" viewBox="-6 -6 36 40">
      <SymbolShape individual={{ id: "", sex, affected: false, sibOrder: 0, lifeStatus }} size={SZ} clipId={`legend-life-${lifeStatus}`} />
    </svg>
  );
}

function CoupleSvg() {
  return (
    <svg width="48" height="20" viewBox="0 0 48 20">
      <line x1={0} y1={10} x2={48} y2={10} stroke="black" strokeWidth={2} />
    </svg>
  );
}

/** Couple line with the childless mark under it. */
function ChildlessSvg({ status }: { status: ChildlessStatus }) {
  return (
    <svg width="48" height="28" viewBox="0 0 48 28">
      <line x1={0} y1={4} x2={48} y2={4} stroke="black" strokeWidth={2} />
      <line x1={24} y1={4} x2={24} y2={22} stroke="black" strokeWidth={2} />
      <line x1={17} y1={22} x2={31} y2={22} stroke="black" strokeWidth={2} />
      {status === "infertility" && <line x1={17} y1={18} x2={31} y2={18} stroke="black" strokeWidth={2} />}
    </svg>
  );
}

/** Twin fork: two drops from one point on the bar, a bar across for MZ, "?" for unknown. */
function TwinsSvg({ zygosity }: { zygosity: Zygosity }) {
  return (
    <svg width="48" height="28" viewBox="0 0 48 28">
      <line x1={8} y1={3} x2={40} y2={3} stroke="black" strokeWidth={2} />
      <line x1={24} y1={3} x2={12} y2={27} stroke="black" strokeWidth={2} />
      <line x1={24} y1={3} x2={36} y2={27} stroke="black" strokeWidth={2} />
      {zygosity === "monozygotic" && <line x1={18} y1={15} x2={30} y2={15} stroke="black" strokeWidth={2} />}
      {zygosity === "unknown" && <text x={24} y={19} textAnchor="middle" fontFamily="sans-serif" fontSize={11} fontWeight="bold">?</text>}
    </svg>
  );
}

/** Couple line with the ended relationship break. */
/** The dashed arc joining two copies of someone drawn more than once. */
function DuplicateArcSvg() {
  return (
    <svg width="48" height="20" viewBox="0 0 48 20">
      <path d="M 4 17 Q 24 -5 44 17" stroke="black" strokeWidth={2} strokeDasharray="6 4" fill="none" />
    </svg>
  );
}

function EndedSvg() {
  return (
    <svg width="48" height="20" viewBox="0 0 48 20">
      <line x1={0} y1={10} x2={48} y2={10} stroke="black" strokeWidth={2} />
      <path d={segmentsPathD(endedMarkSegments(24, 10))} stroke="black" strokeWidth={2} fill="none" />
    </svg>
  );
}

function ConsanguineousSvg() {
  return (
    <svg width="48" height="20" viewBox="0 0 48 20">
      <line x1={0} y1={7}  x2={48} y2={7}  stroke="black" strokeWidth={2} />
      <line x1={0} y1={13} x2={48} y2={13} stroke="black" strokeWidth={2} />
    </svg>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

export function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{children}</div>
      {action}
    </div>
  );
}

function LegendRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="flex items-center justify-center w-12 h-9 shrink-0">{icon}</div>
      <span className="text-xs text-gray-800">{label}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface LegendProps {
  pedigree: Pedigree;
  onManageTags?: () => void;
}

/** A row with a swatch in the Symbols or Relationships section: every kind but a tag and a clinical detail. */
type SwatchRow = Exclude<KeyRow, { kind: "tag" | "clinicalDetail" }>;

/**
 * The swatch of one row. One case for each kind of row in `keyRows`: a new
 * kind does not compile until it is drawn here (and in the export key).
 */
function KeySwatch({ row }: { row: SwatchRow }): React.ReactNode {
  switch (row.kind) {
    case "sex": return <SymbolSvg sex={row.shape} />;
    case "assignedAtBirth": return <span className="text-[10px] text-black">{row.code}</span>;
    case "affected": return <SymbolSvg sex={row.shape} affected />;
    case "affectedCore": return <AffectedCoreSvg sex={row.shape} />;
    case "carrier": return row.half ? <PlainCarrierSvg sex={row.shape} /> : <SymbolSvg sex={row.shape} carrier />;
    case "presymptomatic": return <PresymptomaticSvg sex={row.shape} />;
    case "deceased": return <DeceasedSvg sex={row.shape} />;
    case "proband":
    case "consultand": return <ProbandSvg sex={row.shape} kind={row.kind} />;
    case "familyHistoryUnknown": return <FamilyHistorySvg sex={row.shape} />;
    case "evaluation": return <EvaluationSvg mark={row.mark} />;
    case "documented": return <DocumentedSvg sex={row.shape} />;
    case "lifeStatus": return <LifeStatusSvg sex={row.shape} lifeStatus={row.status} />;
    case "adopted": return <AdoptedSvg sex={row.shape} adopted={row.adopted} />;
    case "role": return <RoleSvg sex={row.shape} role={row.role} />;
    case "collapsedBranch": return <CollapsedBranchSvg />;
    case "couple": return <CoupleSvg />;
    case "consanguineous": return <ConsanguineousSvg />;
    case "ended": return <EndedSvg />;
    case "childless": return <ChildlessSvg status={row.status} />;
    case "twins": return <TwinsSvg zygosity={row.zygosity} />;
    case "assistedLine": return <AssistedLineSvg dashed={row.line === "social"} />;
    case "duplicate": return <DuplicateArcSvg />;
    default: {
      const unhandled: never = row;
      return unhandled;
    }
  }
}

export function Legend({ pedigree: full, onManageTags }: LegendProps) {
  // Which rows, in what order and with what label: `keyRows`, the
  // list the export key draws from too. Only what is drawn is listed: hidden
  // descendants add no entries.
  const key = keyRows(full, "legend");
  const pedigree = key.pedigree;
  const indRows = key.symbols as SwatchRow[];
  const relRows = key.relationships as SwatchRow[];
  // Every defined tag is listed so an unused one can still be ticked; the
  // exported key lists only tags someone carries.
  const tagRows = key.tags.flatMap(r => (r.kind === "tag" ? [r] : []));
  const details = key.details.flatMap(r => (r.kind === "clinicalDetail" ? [r] : []));

  const manage = onManageTags && (
    <Button
      variant="outline" size="sm"
      className="h-6 px-1.5 gap-1 text-[11px]"
      title="Define conditions and tags for this pedigree"
      onClick={onManageTags}
    >
      <Tags size={11} />
      Add / edit
    </Button>
  );

  return (
    <div className="space-y-4" data-testid="legend">
      <div className="space-y-1">
        <SectionHeader action={manage}>{CONDITIONS_AND_TAGS}</SectionHeader>
        {tagRows.length === 0 ? (
          <p className="text-[10px] text-gray-400">None defined for this pedigree yet.</p>
        ) : (
          <div>
            {tagRows.map(row => (
              <div
                key={`${row.tag.id}${row.carrier ? " carrier" : ""}`}
                className="flex items-center gap-1.5 min-w-0"
                data-legend-carrier-row={row.carrier ? row.tag.id : undefined}
              >
                <div className="flex items-center justify-center w-10 h-7 shrink-0">
                  <TagSwatchSvg tag={row.tag} pedigree={pedigree} carrier={row.carrier} />
                </div>
                <span
                  className={`text-xs truncate ${row.inUse ? "text-gray-800" : "text-gray-400"}`}
                  title={row.inUse ? undefined : "No one has this yet"}
                >
                  {row.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {indRows.length > 0 && (
        <div className="space-y-1">
          <SectionHeader>Symbols</SectionHeader>
          <div>
            {indRows.map(r => <LegendRow key={r.label} icon={<KeySwatch row={r} />} label={r.label} />)}
          </div>
        </div>
      )}

      {relRows.length > 0 && (
        <div className="space-y-1">
          <SectionHeader>Relationships</SectionHeader>
          <div>
            {relRows.map(r => <LegendRow key={r.label} icon={<KeySwatch row={r} />} label={r.label} />)}
          </div>
        </div>
      )}

      {details.length > 0 && (
        <div className="space-y-1" data-testid="legend-clinical-details">
          <SectionHeader>Clinical details</SectionHeader>
          <dl className="text-xs text-gray-800 space-y-0.5">
            {details.map(d => (
              <div key={d.field} data-detail={d.field}>
                <dt className="inline font-medium">{d.label}:</dt>{" "}
                <dd className="inline break-words">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
