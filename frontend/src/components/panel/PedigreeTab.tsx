import { useState } from "react";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { ChevronDown, ChevronRight } from "lucide-react";
import { usePedigreeFields } from "@/store/usePedigreeStore";
import { useAppStore } from "@/store/useAppStore";
import { Input } from "@/components/ui/input";
import { Legend } from "@/components/Legend";
import { chartTitle } from "@/pedigree/labels";
import { CLINICAL_DETAIL_OPTIONS, clinicalDetailLines } from "@/pedigree/clinicalDetails";
import { Field, Hint } from "./fields";

/** The Pedigree tab: the chart title, the clinical details and the figure legend. */
export function PedigreeTab({ pedigree, onManageTags }: { pedigree: Pedigree; onManageTags?: () => void }) {
  return (
    <>
      <ChartTitleField />
      <ClinicalDetailsSection />
      <div className="border-t pt-3">
        <Legend pedigree={pedigree} onManageTags={onManageTags} />
      </div>
    </>
  );
}

/**
 * The chart title, shown when nothing is selected. Until edited it
 * shows the pedigree's name, which is what the canvas and exports draw;
 * clearing it hides the title.
 */
function ChartTitleField() {
  const { pedigree, setChartTitle } = usePedigreeFields("pedigree", "setChartTitle");
  const pedigreeName = useAppStore(s => s.activeTitle);
  return (
    <Field label="Chart title">
      <Input
        value={pedigree.chartTitle ?? chartTitle(pedigree, pedigreeName)}
        onChange={e => setChartTitle(e.target.value)}
        className="h-7 text-sm"
        placeholder="No title"
        aria-label="Chart title"
      />
      <Hint>Drawn above the pedigree and in exports. Clear it for no title.</Hint>
    </Field>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Clinical key fields, under the chart title on the Pedigree tab.
 * Folded by default so a new pedigree's panel stays short; the header says
 * how many are filled, and the legend below lists them.
 */
function ClinicalDetailsSection() {
  const { pedigree, setClinicalDetail } = usePedigreeFields("pedigree", "setClinicalDetail");
  const [open, setOpen] = useState(false);
  const filled = clinicalDetailLines(pedigree).length;
  const details = pedigree.clinicalDetails ?? {};
  return (
    <div className="space-y-2" data-testid="clinical-details">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs text-gray-600 hover:text-black"
        title="Reason for referral, ancestry, historian, recorder and date, for the legend and the export key (NSGC)"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Clinical details
        {filled > 0 && <span className="text-gray-400">({filled} filled)</span>}
      </button>
      {open && (
        <div className="space-y-2 pl-4">
          {CLINICAL_DETAIL_OPTIONS.map(o => {
            const value = details[o.field] ?? "";
            // A date typed elsewhere (an imported file) is kept as text rather than hidden by the picker.
            const asDate = o.date && (value === "" || ISO_DATE.test(value));
            return (
              <Field key={o.field} label={o.label}>
                {o.long ? (
                  <textarea
                    value={value}
                    onChange={e => setClinicalDetail(o.field, e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm resize-none h-12 focus:outline-hidden focus:ring-1 focus:ring-black"
                    placeholder={o.placeholder}
                    aria-label={o.label}
                  />
                ) : <Input
                  type={asDate ? "date" : "text"}
                  value={value}
                  onChange={e => setClinicalDetail(o.field, e.target.value)}
                  className="h-7 text-sm"
                  placeholder={o.placeholder}
                  aria-label={o.label}
                />}
              </Field>
            );
          })}
          <Hint>
            Filled fields are listed in the legend and the export key. De-identified exports leave them all out.
          </Hint>
        </div>
      )}
    </div>
  );
}
