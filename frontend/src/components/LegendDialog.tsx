import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Pedigree } from "@pedigree-editor/layout-engine";

interface LegendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pedigree: Pedigree;
}

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

function ProbandSvg({ sex }: { sex: Sex }) {
  const cx = SZ / 2, cy = SZ / 2, r = SZ / 2 - 1;
  // Arrow tip at (0, SZ); tail at (-18, SZ+18)
  return (
    <svg width="46" height="48" viewBox="-22 -2 46 50">
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
      <line
        x1={-18} y1={SZ + 18}
        x2={0}   y2={SZ}
        stroke="black" strokeWidth={2}
        markerEnd="url(#legend-arrowhead)"
      />
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

function ConsanguineousSvg() {
  return (
    <svg width="48" height="20" viewBox="0 0 48 20">
      <line x1={0} y1={7}  x2={48} y2={7}  stroke="black" strokeWidth={2} />
      <line x1={0} y1={13} x2={48} y2={13} stroke="black" strokeWidth={2} />
    </svg>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-4 first:mt-0">
      {children}
    </div>
  );
}

function LegendRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="flex items-center justify-center w-12 h-10 shrink-0">{icon}</div>
      <span className="text-xs text-gray-800">{label}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function LegendDialog({ open, onOpenChange, pedigree }: LegendDialogProps) {
  const { individuals, partnerships } = pedigree;

  // Detect which symbol types are used
  const hasMale    = individuals.some(i => i.sex === "male");
  const hasFemale  = individuals.some(i => i.sex === "female");
  const hasUnknown = individuals.some(i => i.sex === "unknown");

  const affectedInd = individuals.find(i => i.affected);
  const carrierInd  = individuals.find(i => i.carrier && !i.affected);
  const deceasedInd = individuals.find(i => i.deceased);
  const probandInd  = individuals.find(i => i.proband);

  const hasCouples        = partnerships.length > 0;
  const hasConsanguineous = partnerships.some(p => p.consanguineous);

  // Build legend rows
  const indRows: { icon: React.ReactNode; label: string }[] = [];
  if (hasMale)    indRows.push({ icon: <SymbolSvg sex="male" />,    label: "Male" });
  if (hasFemale)  indRows.push({ icon: <SymbolSvg sex="female" />,  label: "Female" });
  if (hasUnknown) indRows.push({ icon: <SymbolSvg sex="unknown" />, label: "Unknown sex" });
  if (affectedInd) indRows.push({ icon: <SymbolSvg sex={affectedInd.sex} affected />, label: "Affected" });
  if (carrierInd)  indRows.push({ icon: <SymbolSvg sex={carrierInd.sex} carrier />,   label: "Carrier" });
  if (deceasedInd) indRows.push({ icon: <DeceasedSvg sex={deceasedInd.sex} />,        label: "Deceased" });
  if (probandInd)  indRows.push({ icon: <ProbandSvg sex={probandInd.sex} />,          label: "Proband (index case)" });

  const relRows: { icon: React.ReactNode; label: string }[] = [];
  if (hasCouples)        relRows.push({ icon: <CoupleSvg />,         label: "Couple" });
  if (hasConsanguineous) relRows.push({ icon: <ConsanguineousSvg />, label: "Consanguineous couple" });

  const isEmpty = indRows.length === 0 && relRows.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Figure legend</DialogTitle>
        </DialogHeader>

        {isEmpty ? (
          <p className="text-xs text-gray-400">No symbols in this pedigree yet.</p>
        ) : (
          <div>
            {indRows.length > 0 && (
              <>
                <SectionHeader>Individuals</SectionHeader>
                <div>
                  {indRows.map(r => <LegendRow key={r.label} icon={r.icon} label={r.label} />)}
                </div>
              </>
            )}
            {relRows.length > 0 && (
              <>
                <SectionHeader>Relationships</SectionHeader>
                <div>
                  {relRows.map(r => <LegendRow key={r.label} icon={r.icon} label={r.label} />)}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
