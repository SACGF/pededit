import { useState } from "react";
import { Funnel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { VIEW_FILTERS, activeFilters, filterLabel } from "../pedigree/viewFilters";
import { conditionTags } from "../pedigree/conditions";

/**
 * The view filters (#4) as a toolbar menu of switches, so they can be turned
 * on and off quickly. The button reads the active filter's name while one is
 * on, or how many are on. Further filters are rows in `VIEW_FILTERS`. With
 * two or more conditions, "Affected only" can be narrowed to one.
 */
export function FilterMenu({ disabled }: { disabled?: boolean }) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const updateViewFilters = usePedigreeStore(s => s.updateViewFilters);
  const setViewFilter = usePedigreeStore(s => s.setViewFilter);
  const [open, setOpen] = useState(false);
  const active = activeFilters(pedigree);
  const conditions = conditionTags(pedigree);
  const chosen = pedigree.filters?.affectedCondition;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost" size="sm"
          className={`h-7 px-2 gap-1 text-xs ${active.length > 0 ? "font-medium text-black bg-gray-100" : ""}`}
          title="Filter what is drawn: the canvas and figure exports follow, data exports keep everyone"
          aria-label="Filters"
          data-testid="filter-menu"
          disabled={disabled}
        >
          <Funnel size={12} />
          {active.length === 0 ? "Filter" : active.length === 1 ? filterLabel(active[0]!, pedigree) : `${active.length} filters`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 space-y-2" side="bottom" align="end">
        {VIEW_FILTERS.map(f => (
          <div key={f.id}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name={f.id}
                className="mt-0.5"
                checked={f.on(pedigree.filters)}
                onChange={e => updateViewFilters(f.patch(e.target.checked))}
              />
              <div>
                <div className="text-sm">{f.label}</div>
                <div className="text-xs text-gray-400">{f.description}</div>
              </div>
            </label>
            {f.id === "affectedOnly" && f.on(pedigree.filters) && conditions.length >= 2 && (
              <select
                name="affectedCondition"
                aria-label="Condition"
                className="ml-6 mt-1 text-xs border border-gray-300 px-1 py-0.5 bg-white"
                value={conditions.some(c => c.id === chosen) ? chosen : ""}
                onChange={e => setViewFilter("affectedCondition", e.target.value || undefined)}
              >
                <option value="">Any condition</option>
                {conditions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            )}
          </div>
        ))}
        <div className="text-xs text-gray-400 border-t pt-2">
          Figure exports draw the same; CSV, PED and JSON keep everyone.
        </div>
      </PopoverContent>
    </Popover>
  );
}
