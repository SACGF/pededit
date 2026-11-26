import type { Pedigree } from "@pedigree-editor/layout-engine";
import { CONDITIONS_AND_TAGS } from "../pedigree/conditions";
import { Button } from "@/components/ui/button";
import { Tags } from "lucide-react";
import { keyRows } from "@/pedigree/keyRows";
import { KeySwatch, TagSwatchSvg, type SwatchRow } from "@/pedigree/chart/keySwatches";

/**
 * The figure legend, on the edit panel's Pedigree tab. A
 * person's own conditions and tags, with the same swatches, are edited on the
 * Person tab (`ConditionsAndTags`). Which rows it has comes from `keyRows`
 * (`pedigree/keyRows.ts`), the list the exported key draws from too;
 * this file draws their swatches.
 */

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
