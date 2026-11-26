import { useState } from "react";
import { Funnel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { VIEW_FILTERS, activeFilters, filterLabel } from "../pedigree/viewFilters";
import { conditionTags } from "../pedigree/conditions";
import { useSmallScreen } from "../hooks/useSmallScreen";
import { useUShapeToggle } from "../hooks/useUShapeToggle";
import { SettingToggle } from "./SettingControls";

/**
 * The view filters as a toolbar menu of switches, so they can be turned
 * on and off quickly. The button reads the active filter's name while one is
 * on, or how many are on. Further filters are rows in `VIEW_FILTERS`. With
 * two or more conditions, "Affected only" can be narrowed to one. Controls
 * that share a `group` (the sides of the family) are one row of radio buttons.
 */
export function FilterMenu({ disabled }: { disabled?: boolean }) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const updateViewFilters = usePedigreeStore(s => s.updateViewFilters);
  const setViewFilter = usePedigreeStore(s => s.setViewFilter);
  const [open, setOpen] = useState(false);
  const active = activeFilters(pedigree);
  const conditions = conditionTags(pedigree);
  const chosen = pedigree.filters?.affectedCondition;
  const sides = VIEW_FILTERS.filter(f => f.group === "side");
  // A phone's toolbar has no room for the U-shape button (#220), so it is here.
  const small = useSmallScreen();
  const uShape = useUShapeToggle();

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
        {small && (
          <SettingToggle
            align="start"
            className="border-b pb-2"
            name="uShapeView"
            inputProps={{ "data-testid": "u-shape-toggle" }}
            label="U-shape view"
            description="Draw the family bent round a U, for wide families. Some people are not drawn; edit on the Person tab."
            checked={uShape.on}
            onChange={() => { uShape.toggle(); setOpen(false); }}
          />
        )}
        {VIEW_FILTERS.filter(f => !f.group).map(f => (
          <div key={f.id}>
            <SettingToggle
              align="start"
              name={f.id}
              label={f.label}
              description={f.description}
              checked={f.on(pedigree.filters)}
              onChange={on => updateViewFilters(f.patch(on))}
            />
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
        <fieldset>
          <legend className="text-sm">Side of the family</legend>
          <div className="text-xs text-gray-400">
            Draw the proband and one parent's blood relatives with their partners. The other parent is drawn, their family is not.
          </div>
          <div className="flex gap-3 mt-1">
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="radio"
                name="side"
                value="both"
                checked={!sides.some(f => f.on(pedigree.filters))}
                onChange={() => setViewFilter("side", undefined)}
              />
              Both
            </label>
            {sides.map(f => (
              <label key={f.id} className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="side"
                  value={f.id}
                  checked={f.on(pedigree.filters)}
                  onChange={() => updateViewFilters(f.patch(true))}
                />
                {f.shortLabel ?? f.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="text-xs text-gray-400 border-t pt-2">
          Figure exports draw the same; CSV, PED and JSON keep everyone.
        </div>
      </PopoverContent>
    </Popover>
  );
}
