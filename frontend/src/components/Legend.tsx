import type { Individual, Pedigree, Tag, LifeStatus } from "@pedigree-editor/layout-engine";
import {
  pedigreeTags, tagsInUse, quadrantTags, sectorAngles, sectorPath, tagCanvasText, sectorsFor, needsAffectedCore,
  ANNOTATION_DOT_RADIUS, ANNOTATION_FONT_SIZE,
} from "../pedigree/tags";
import { SymbolShape, ProbandArrow, FamilyHistoryMark, DocumentedMark } from "../pedigree/nodes/symbols";
import { evaluationKeyInfo, evaluationLegend, PRESYMPTOMATIC_LEGEND_LABEL, DOCUMENTED_LEGEND_LABEL } from "../pedigree/evaluation";
import { notationOf } from "../pedigree/notation";
import { FAMILY_HISTORY_LEGEND_LABEL } from "../pedigree/familyHistory";
import { arrowKind, ARROW_LEGEND_LABEL, type ArrowKind } from "../pedigree/proband";
import { LIFE_STATUS_OPTIONS } from "../pedigree/lifeStatus";
import { CHILDLESS_OPTIONS, childlessPartnerships } from "../pedigree/childless";
import { ADOPTION_OPTIONS, adoptionLegendLabel, ADOPTION_DASH } from "../pedigree/adoption";
import { REPRODUCTIVE_ROLE_OPTIONS, roleLegendLabel, symbolLetter, assistedLinks, CARRIER_LINE_LEGEND, SOCIAL_LINE_LEGEND } from "../pedigree/assisted";
import { ZYGOSITY_OPTIONS, twinLegendLabel, zygositiesInUse } from "../pedigree/twins";
import type { Zygosity } from "@pedigree-editor/layout-engine";
import type { ChildlessStatus, Adoption, ReproductiveRole } from "@pedigree-editor/layout-engine";
import { consanguinityTest } from "@/pedigree/consanguinity";
import { ENDED_LABEL, endedMarkSegments, hasEndedPartnership } from "@/pedigree/ended";
import { segmentsPathD } from "@/pedigree/sibshipPath";
import { collapseInfo, isBranchPlaceholderId, COLLAPSED_BRANCH_LABEL } from "@/pedigree/collapse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tagTakesOnset } from "@/pedigree/onset";
import { clinicalDetailLines } from "@/pedigree/clinicalDetails";
import { symbolSex, anyDrawnByGender, assignedAtBirthInUse } from "@/pedigree/gender";
import { Tags } from "lucide-react";

/**
 * The figure legend, always visible in the edit panel (#75). With an
 * individual selected the tag rows become checkboxes for that person, so the
 * same rows serve as the key and as the tag editor, and the symbol and
 * relationship sections are dropped to keep the editor short. The exported
 * key (`renderExportKeySvg`) lists the same statuses in the same order.
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

/** Symbol with the "?" above it: family history not known (#100). */
function FamilyHistorySvg({ sex }: { sex: Sex }) {
  return (
    <svg width="36" height="36" viewBox="-6 -14 36 42">
      <SymbolShape individual={{ id: "legend", sex, affected: false, sibOrder: 0 }} size={SZ} />
      <FamilyHistoryMark size={SZ} hasParents={false} />
    </svg>
  );
}

/** Presymptomatic carrier (#101): the canvas's own symbol with its vertical line. */
function PresymptomaticSvg({ sex }: { sex: Sex }) {
  return (
    <svg width="28" height="28" viewBox="-2 -2 28 28">
      <SymbolShape individual={{ id: "legend", sex, affected: false, presymptomatic: true, sibOrder: 0 }} size={SZ} />
    </svg>
  );
}

/** "+/-" (2022) or "E" (2008) for the result marks row (#101, #114). */
function EvaluationSvg({ mark }: { mark: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <text x={14} y={18} textAnchor="middle" fontFamily="sans-serif" fontSize={12} fill="black">{mark}</text>
    </svg>
  );
}

/** Symbol with the "*" at its lower right: documented evaluation (#101). */
function DocumentedSvg({ sex }: { sex: Sex }) {
  const s = 18;
  return (
    <svg width="28" height="28" viewBox="-2 -2 30 30">
      <SymbolShape individual={{ id: "legend", sex, affected: false, sibOrder: 0 }} size={s} />
      <DocumentedMark size={s} adopted={false} />
    </svg>
  );
}

/** Proband arrow with its "P", or the consultand's without (#99), drawn by the canvas's own ProbandArrow. */
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

/** How a tag looks on a symbol: a quarter of a square, a dot, or coloured text. */
export function TagSwatchSvg({ tag, pedigree }: { tag: Tag; pedigree: Pedigree }) {
  const s = 16, x = 6, y = 6, cx = x + s / 2, cy = y + s / 2;
  if (tag.style === "quadrant") {
    const idx = Math.max(0, quadrantTags(pedigree).findIndex(t => t.id === tag.id));
    const [start, end] = sectorAngles(idx);
    const clipId = `legend-clip-${tag.id}`;
    return (
      <svg width="28" height="28" viewBox="0 0 28 28">
        <clipPath id={clipId}><rect x={x} y={y} width={s} height={s} /></clipPath>
        <rect x={x} y={y} width={s} height={s} fill="white" stroke="black" strokeWidth={1.5} />
        <path d={sectorPath(cx, cy, s, start, end)} fill={tag.color} clipPath={`url(#${clipId})`} />
        <rect x={x} y={y} width={s} height={s} fill="none" stroke="black" strokeWidth={1.5} />
      </svg>
    );
  }
  if (tag.style === "dot") {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx={14} cy={14} r={ANNOTATION_DOT_RADIUS} fill={tag.color} />
      </svg>
    );
  }
  return (
    <svg width="40" height="28" viewBox="0 0 40 28">
      <text x={20} y={14 + ANNOTATION_FONT_SIZE / 2 - 1} textAnchor="middle" fontFamily="sans-serif" fontSize={ANNOTATION_FONT_SIZE} fontWeight="bold" fill={tag.color}>
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
        sectors={[{ tag: sample, start: 0, end: 360 }]}
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

/** "D" or "S" inside the symbol (#45), from the canvas renderer. */
function RoleSvg({ sex, role }: { sex: Sex; role: ReproductiveRole }) {
  return (
    <svg width="28" height="28" viewBox="-2 -2 28 28">
      <SymbolShape individual={{ id: "", sex, affected: false, sibOrder: 0, reproductiveRole: role }} size={SZ} clipId={`legend-role-${role}`} />
    </svg>
  );
}

/** A slanting line of assisted reproduction (#45), dashed for a social parent. */
function AssistedLineSvg({ dashed }: { dashed: boolean }) {
  return (
    <svg width="48" height="20" viewBox="0 0 48 20">
      <line x1={14} y1={2} x2={34} y2={18} stroke="black" strokeWidth={2} strokeDasharray={dashed ? ADOPTION_DASH : undefined} />
    </svg>
  );
}

/** A collapsed branch (#1): a diamond with "n" in it. */
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

/** Couple line with the childless mark under it (#15). */
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

/** Twin fork (#11): two drops from one point on the bar, a bar across for MZ, "?" for unknown. */
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

/** Couple line with the ended relationship break (#98). */
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

function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
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
  /** When set, the tag rows are checkboxes that tag or untag this person. */
  individual?: Individual;
  onToggleTag?: (tagId: string, on: boolean) => void;
  /** Age of onset for a condition tag the person carries (#93). */
  onSetTagOnset?: (tagId: string, value: string) => void;
  onManageTags?: () => void;
}

export function Legend({ pedigree: full, individual, onToggleTag, onSetTagOnset, onManageTags }: LegendProps) {
  // Only what is drawn: hidden descendants (#94) add no entries, and the
  // group symbols standing for collapsed siblings (#1) have their own row.
  const { drawn: pedigree, placeholders } = collapseInfo(full);
  const { partnerships } = pedigree;
  const individuals = pedigree.individuals.filter(i => !isBranchPlaceholderId(i.id));

  // Swatches use the shape drawn, which is the gender identity's when shown (#26).
  const shape = (i: Individual) => symbolSex(i, pedigree);
  const hasMale    = individuals.some(i => shape(i) === "male");
  const hasFemale  = individuals.some(i => shape(i) === "female");
  const hasUnknown = individuals.some(i => shape(i) === "unknown");
  const byGender = anyDrawnByGender(pedigree);

  const affectedInd = individuals.find(i => i.affected);
  const carrierInd  = individuals.find(i => i.carrier && !i.affected);
  const deceasedInd = individuals.find(i => i.deceased);
  const probandInd  = individuals.find(i => arrowKind(i) === "proband");
  const consultandInd = individuals.find(i => arrowKind(i) === "consultand");

  const hasCouples        = partnerships.some(p => !p.donorConception); // a donor pair (#45) has no couple line
  // Same rule the canvas uses for the double line: flagged, or related by blood.
  const related = consanguinityTest(pedigree);
  const hasConsanguineous = partnerships.some(p => related(p.individual1, p.individual2));

  const indRows: { icon: React.ReactNode; label: string }[] = [];
  if (hasMale)    indRows.push({ icon: <SymbolSvg sex="male" />,    label: byGender ? "Man / male" : "Male" });
  if (hasFemale)  indRows.push({ icon: <SymbolSvg sex="female" />,  label: byGender ? "Woman / female" : "Female" });
  if (hasUnknown) indRows.push({ icon: <SymbolSvg sex="unknown" />, label: byGender ? "Non-binary / unknown sex" : "Unknown sex" });
  for (const { code, label } of assignedAtBirthInUse(pedigree)) {
    indRows.push({ icon: <span className="text-[10px] text-black">{code}</span>, label });
  }
  if (affectedInd) indRows.push({ icon: <SymbolSvg sex={shape(affectedInd)} affected />, label: "Affected" });
  const coreInd = individuals.find(i => needsAffectedCore(i, sectorsFor(i, pedigree)));
  if (coreInd) {
    indRows.push({ icon: <AffectedCoreSvg sex={shape(coreInd)} />, label: "Affected, with tags (black centre)" });
  }
  if (carrierInd)  indRows.push({ icon: <SymbolSvg sex={shape(carrierInd)} carrier />,   label: "Carrier" });
  const ev = evaluationKeyInfo(individuals, notationOf(pedigree));
  const evLegend = evaluationLegend(notationOf(pedigree));
  if (ev.presymptomatic) indRows.push({ icon: <PresymptomaticSvg sex={shape(ev.presymptomatic)} />, label: PRESYMPTOMATIC_LEGEND_LABEL });
  if (deceasedInd) indRows.push({ icon: <DeceasedSvg sex={shape(deceasedInd)} />,        label: "Deceased" });
  if (probandInd)  indRows.push({ icon: <ProbandSvg sex={shape(probandInd)} kind="proband" />, label: ARROW_LEGEND_LABEL.proband });
  const historyInd = individuals.find(i => i.familyHistoryUnknown);
  if (historyInd) indRows.push({ icon: <FamilyHistorySvg sex={shape(historyInd)} />, label: FAMILY_HISTORY_LEGEND_LABEL });
  if (consultandInd) indRows.push({ icon: <ProbandSvg sex={shape(consultandInd)} kind="consultand" />, label: ARROW_LEGEND_LABEL.consultand });
  if (ev.evaluated) indRows.push({ icon: <EvaluationSvg mark={evLegend.mark} />, label: evLegend.label });
  if (ev.documented) indRows.push({ icon: <DocumentedSvg sex={shape(ev.documented)} />, label: DOCUMENTED_LEGEND_LABEL });
  for (const o of LIFE_STATUS_OPTIONS) {
    const ind = individuals.find(i => i.lifeStatus === o.value);
    if (ind) indRows.push({ icon: <LifeStatusSvg sex={shape(ind)} lifeStatus={o.value} />, label: o.label });
  }
  for (const o of ADOPTION_OPTIONS) {
    const ind = individuals.find(i => i.adopted === o.value);
    if (ind) indRows.push({ icon: <AdoptedSvg sex={shape(ind)} adopted={o.value} />, label: adoptionLegendLabel(o.value) });
  }

  for (const o of REPRODUCTIVE_ROLE_OPTIONS) {
    const ind = individuals.find(i => symbolLetter(i) === o.letter);
    if (ind) indRows.push({ icon: <RoleSvg sex={shape(ind)} role={o.value} />, label: roleLegendLabel(o.value) });
  }
  if (placeholders.size > 0) indRows.push({ icon: <CollapsedBranchSvg />, label: COLLAPSED_BRANCH_LABEL });

  const relRows: { icon: React.ReactNode; label: string }[] = [];
  if (hasCouples)        relRows.push({ icon: <CoupleSvg />,         label: "Couple" });
  if (hasConsanguineous) relRows.push({ icon: <ConsanguineousSvg />, label: "Consanguineous couple" });
  if (hasEndedPartnership(pedigree)) relRows.push({ icon: <EndedSvg />, label: ENDED_LABEL });
  const childless = new Set(childlessPartnerships(pedigree).map(p => p.childless!));
  for (const o of CHILDLESS_OPTIONS) {
    if (childless.has(o.value)) relRows.push({ icon: <ChildlessSvg status={o.value} />, label: o.label });
  }
  const zygosities = zygositiesInUse(pedigree);
  for (const o of ZYGOSITY_OPTIONS) {
    if (zygosities.has(o.value)) relRows.push({ icon: <TwinsSvg zygosity={o.value} />, label: twinLegendLabel(o.value) });
  }
  const linkKinds = new Set(assistedLinks(pedigree).map(l => l.kind));
  if (linkKinds.has("carrier")) relRows.push({ icon: <AssistedLineSvg dashed={false} />, label: CARRIER_LINE_LEGEND });
  if (linkKinds.has("social"))  relRows.push({ icon: <AssistedLineSvg dashed />,        label: SOCIAL_LINE_LEGEND });

  // Every defined tag is listed so an unused one can still be ticked; the
  // exported key lists only tags someone carries.
  const tags = pedigreeTags(pedigree);
  const details = clinicalDetailLines(full);
  const used = new Set(tagsInUse(pedigree).map(t => t.id));

  const manage = onManageTags && (
    <Button
      variant="outline" size="sm"
      className="h-6 px-1.5 gap-1 text-[11px]"
      title="Define tags and colours for this pedigree"
      onClick={onManageTags}
    >
      <Tags size={11} />
      Add / edit
    </Button>
  );

  return (
    <div className="space-y-4" data-testid="legend">
      <div className="space-y-1">
        <SectionHeader action={manage}>Tags</SectionHeader>
        {tags.length === 0 ? (
          <p className="text-[10px] text-gray-400">No tags defined for this pedigree yet.</p>
        ) : (
          <div>
            {tags.map(tag => {
              const inUse = used.has(tag.id);
              const swatch = (
                <div className="flex items-center justify-center w-10 h-7 shrink-0">
                  <TagSwatchSvg tag={tag} pedigree={pedigree} />
                </div>
              );
              const text = (
                <span
                  className={`text-xs truncate ${inUse || individual ? "text-gray-800" : "text-gray-400"}`}
                  title={inUse ? undefined : "No one has this tag yet"}
                >
                  {tag.label}
                </span>
              );
              if (individual && onToggleTag) {
                const on = individual.tags?.includes(tag.id) ?? false;
                return (
                  <div key={tag.id}>
                    <label className="flex items-center gap-1.5 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={e => onToggleTag(tag.id, e.target.checked)}
                        className="accent-black shrink-0"
                      />
                      {swatch}
                      {text}
                    </label>
                    {on && onSetTagOnset && tagTakesOnset(tag) && (
                      <div className="flex items-center gap-2 pl-5 pb-1 text-xs text-gray-600">
                        <span className="shrink-0">Age of onset</span>
                        <Input
                          value={individual.tagOnset?.[tag.id] ?? ""}
                          aria-label={`Age of onset of ${tag.label}`}
                          onChange={e => onSetTagOnset(tag.id, e.target.value)}
                          className="h-6 text-xs"
                          placeholder="e.g. 45y"
                        />
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key={tag.id} className="flex items-center gap-1.5 min-w-0">
                  {swatch}
                  {text}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!individual && indRows.length > 0 && (
        <div className="space-y-1">
          <SectionHeader>Symbols</SectionHeader>
          <div>
            {indRows.map(r => <LegendRow key={r.label} icon={r.icon} label={r.label} />)}
          </div>
        </div>
      )}

      {!individual && relRows.length > 0 && (
        <div className="space-y-1">
          <SectionHeader>Relationships</SectionHeader>
          <div>
            {relRows.map(r => <LegendRow key={r.label} icon={r.icon} label={r.label} />)}
          </div>
        </div>
      )}

      {!individual && details.length > 0 && (
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
