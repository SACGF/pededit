import { useRef, useState, type FocusEvent, type ReactNode } from "react";
import { ChevronDown, Network, User } from "lucide-react";
import { usePedigreeFields } from "../store/usePedigreeStore";
import { useSmallScreen } from "../hooks/useSmallScreen";
import { SelectionPanel } from "./SelectionPanel";
import { PersonActions } from "./PersonActions";
import { PersonForm } from "./panel/PersonForm";
import { PedigreeTab } from "./panel/PedigreeTab";

/** Small screens: how much of the screen the side panel's sheet takes. */
export type PanelSize = "closed" | "half" | "full";

interface EditPanelProps {
  onManageTags?: () => void;
  /**
   * Small screens only: the panel is a sheet under the canvas with its tabs
   * as a bar along the bottom of the screen, shut to that bar when "closed".
   * From `lg` up it is always open and these do nothing.
   */
  size?: PanelSize;
  onSizeChange?: (size: PanelSize) => void;
}

type PanelTab = "person" | "pedigree";

/**
 * The right-hand panel: a Person tab (the selected individual's
 * fields, or the batch panel for several) and a Pedigree tab (chart title,
 * clinical details), with the figure legend under both. Any change of
 * selection switches tab, to Person when someone is selected and to Pedigree
 * when the selection is cleared, so clicking a person or the background is a
 * shortcut. Every selection write makes a new `selectedIds` array, so
 * clicking the person already selected switches back too. Choosing the
 * Pedigree tab keeps the selection, so Person returns to the same people.
 * Person is disabled while nobody is selected. The figure legend is on the
 * Pedigree tab only; the Person tab has the person's own conditions and tags
 * with the same swatches.
 *
 * Only the content under the tabs scrolls, with a stable scrollbar gutter, so
 * switching between a short and a long tab never moves the tabs or the text.
 *
 * Small screens: the tabs are a bar along the bottom of the screen that
 * never moves, and the content is a sheet above it with a handle. A tab
 * opens the sheet at half the screen and the tab of the open sheet shuts it.
 * Person can be tapped with nobody selected and says to tap someone.
 */
export function EditPanel({ onManageTags, size = "half", onSizeChange }: EditPanelProps) {
  const { pedigree, selectedId, selectedIds, uShapeView } = usePedigreeFields("pedigree", "selectedId", "selectedIds", "uShapeView");
  const small = useSmallScreen();
  const open = !small || size !== "closed";
  const anyone = selectedIds.length > 0;
  const [tab, setTab] = useState<PanelTab>(anyone ? "person" : "pedigree");
  // Each new selection (every click, band or pick makes a new list) shows
  // the Person tab, or the Pedigree tab when nobody is left. Set during
  // render, so the old tab is never drawn first.
  const [tabSelection, setTabSelection] = useState(selectedIds);
  if (tabSelection !== selectedIds) {
    setTabSelection(selectedIds);
    setTab(anyone ? "person" : "pedigree");
  }
  // Several selected: the batch panel.
  const multiple = selectedIds.length > 1;
  const onPerson = tab === "person" && (anyone || small);
  const shown: PanelTab = onPerson ? "person" : "pedigree";
  const individual = onPerson && !multiple ? pedigree.individuals.find(i => i.id === selectedId) : undefined;
  const selectTab = (next: PanelTab) => {
    if (small && open && next === shown) { onSizeChange?.("closed"); return; }
    setTab(next);
    if (!open) onSizeChange?.("half");
  };
  // Typing brings up the keyboard over the lower half of a phone's screen,
  // so a text field gets the tall sheet.
  const growForTyping = (e: FocusEvent<HTMLDivElement>) => {
    if (small && size === "half" && e.target.matches("textarea, input:not([type=checkbox]):not([type=radio])")) onSizeChange?.("full");
  };

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Side panel" className={`flex shrink-0 text-xs border-b max-lg:order-last max-lg:border-b-0 max-lg:text-sm ${open ? "max-lg:border-t" : ""}`}>
        <PanelTabButton tab="person" active={open && shown === "person"} onSelect={selectTab} disabled={!anyone && !small}
          title={anyone ? undefined : "Select someone on the chart to edit them"} icon={<User size={16} />}>Person</PanelTabButton>
        <PanelTabButton tab="pedigree" active={open && shown === "pedigree"} onSelect={selectTab} icon={<Network size={16} />}>Pedigree</PanelTabButton>
      </div>
      {small && onSizeChange && size !== "closed" && <SheetHandle size={size} onSizeChange={onSizeChange} />}
      <div className={`flex-1 overflow-y-auto [scrollbar-gutter:stable] ${open ? "" : "max-lg:hidden"}`} data-testid="panel-scroll" onFocus={growForTyping}>
        <div className="p-4 space-y-4" role="tabpanel" data-testid={onPerson ? "panel-person" : "panel-pedigree"}>
          {!onPerson ? (
            <PedigreeTab pedigree={pedigree} onManageTags={onManageTags} />
          ) : multiple ? (
            <SelectionPanel />
          ) : individual ? (
            <>
              {/* The hover pill's buttons: on a phone, and in the U-shape view, which has no pill (#220). */}
              {(small || uShapeView) && <PersonActions individual={individual} />}
              <PersonForm individual={individual} onManageTags={onManageTags} />
            </>
          ) : (
            <p className="text-sm text-gray-500" data-testid="panel-nobody">Tap a person on the chart to see and edit their details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelTabButton({ tab, active, onSelect, disabled, title, icon, children }: {
  tab: PanelTab; active: boolean; onSelect: (tab: PanelTab) => void; disabled?: boolean; title?: string; icon: ReactNode; children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      title={title}
      data-testid={`panel-tab-${tab}`}
      onClick={() => onSelect(tab)}
      className={`flex-1 py-2 -mb-px border-b max-lg:mb-0 max-lg:-mt-px max-lg:h-12 max-lg:border-b-0 max-lg:border-t-2 max-lg:flex max-lg:items-center max-lg:justify-center max-lg:gap-2 ${active ? "border-black text-black max-lg:font-medium" : "border-transparent text-gray-500 hover:text-black"} disabled:text-gray-300 disabled:hover:text-gray-300 disabled:cursor-not-allowed`}
    >
      <span className="lg:hidden" aria-hidden>{icon}</span>
      {children}
    </button>
  );
}

/** A swipe on the handle shorter than this is a tap. */
const SWIPE = 24;

/**
 * Small screens: the strip along the top of the open sheet. Swipe it up for
 * the tall sheet, down for the next size down (shut, from half), or tap it
 * to switch between half and tall. The sheet changes size when the finger
 * lifts, not under it, so the chart is laid out once.
 */
function SheetHandle({ size, onSizeChange }: { size: PanelSize; onSizeChange: (size: PanelSize) => void }) {
  const startY = useRef<number | null>(null);
  const toggle = () => onSizeChange(size === "full" ? "half" : "full");
  return (
    <div className="lg:hidden order-first flex shrink-0 items-stretch border-b">
      <button
        type="button"
        className="flex-1 h-8 pl-12 flex items-center justify-center touch-none"
        aria-label={size === "full" ? "Make panel shorter" : "Make panel taller"}
        data-testid="panel-handle"
        onPointerDown={e => { startY.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerCancel={() => { startY.current = null; }}
        onPointerUp={e => {
          if (startY.current === null) return;
          const dy = e.clientY - startY.current;
          startY.current = null;
          if (dy <= -SWIPE) onSizeChange("full");
          else if (dy >= SWIPE) onSizeChange(size === "full" ? "half" : "closed");
          else toggle();
        }}
        // The keyboard: a click with no pointer behind it.
        onClick={e => { if (e.detail === 0) toggle(); }}
      >
        <span className="block h-1 w-10 bg-gray-300" />
      </button>
      <button
        type="button"
        className="w-12 flex items-center justify-center text-gray-500 hover:text-black"
        aria-label="Close panel"
        data-testid="panel-toggle"
        onClick={() => onSizeChange("closed")}
      >
        <ChevronDown size={16} />
      </button>
    </div>
  );
}
