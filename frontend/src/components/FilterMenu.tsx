import { useState } from "react";
import { Funnel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { VIEW_FILTERS } from "../pedigree/viewFilters";

/**
 * The view filters (#4) as a toolbar menu of switches, so they can be turned
 * on and off quickly. The button reads the active filter's name while one is
 * on. Further filters are rows in `VIEW_FILTERS`.
 */
export function FilterMenu({ disabled }: { disabled?: boolean }) {
  const filters = usePedigreeStore(s => s.pedigree.filters);
  const setViewFilter = usePedigreeStore(s => s.setViewFilter);
  const [open, setOpen] = useState(false);
  const active = VIEW_FILTERS.filter(f => filters?.[f.key] === true);

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
          {active.length > 0 ? active.map(f => f.label).join(", ") : "Filter"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" side="bottom" align="end">
        {VIEW_FILTERS.map(f => (
          <label key={f.key} className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              name={f.key}
              className="mt-0.5"
              checked={filters?.[f.key] === true}
              onChange={e => setViewFilter(f.key, e.target.checked)}
            />
            <div>
              <div className="text-sm">{f.label}</div>
              <div className="text-xs text-gray-400">{f.description}</div>
            </div>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
