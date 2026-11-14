import { Panel } from "@xyflow/react";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { collapseInfo } from "./collapse";
import { filterBannerText } from "./viewFilters";

/**
 * A chip over the canvas while a view filter (#4) is on, so a filtered
 * pedigree is never mistaken for the whole family. Clicking it turns the
 * filters off. Hidden while picking, which uses the same spot.
 */
export function FilterBanner() {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const picking = usePedigreeStore(s => s.picking);
  const clearViewFilters = usePedigreeStore(s => s.clearViewFilters);
  const text = filterBannerText(pedigree, collapseInfo(pedigree).filtered);
  if (!text || picking) return null;

  return (
    <Panel position="top-center">
      <button
        data-testid="filter-banner"
        role="status"
        title="Turn the filters off and draw everyone"
        onClick={clearViewFilters}
        className="bg-white border border-gray-400 px-3 py-1 text-xs hover:bg-gray-100"
      >
        {text}. <span className="underline">Turn off</span>
      </button>
    </Panel>
  );
}
