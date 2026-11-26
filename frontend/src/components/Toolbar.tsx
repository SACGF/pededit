import { useState } from "react";
import { usePedigreeFields } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RotateCcw, RotateCw, Settings, Download, Image, Menu } from "lucide-react";
import { exportPed, type ExportOptions } from "../io/ped/index.js";
import { pedExportLosses } from "../io/ped/exporter.js";
import { exportPhenopackets } from "../io/phenopackets/index.js";
import { downloadText } from "../utils/download";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { exportCsv } from "../io/csv/exporter";
import { FilterMenu } from "./FilterMenu";
import { ProblemsMenu } from "./ProblemsMenu";
import { exportJson } from "../io/json/index.js";
import { useSmallScreen } from "../hooks/useSmallScreen";
import { U_SHAPE_REFUSALS } from "../pedigree/uShapeView";
import { useUShapeToggle } from "../hooks/useUShapeToggle";

// SVG icons matching NSGC pedigree symbols
function MaleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function FemaleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
/** The U-shape view's button: a horseshoe. */
function UShapeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 1.5 V6 A4 4 0 0 0 10 6 V1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function UnknownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

interface ToolbarProps {
  onSettingsClick: () => void;
  onExportSvgClick: () => void;
  /** Small screens: opens the left sidebar, which is hidden there. */
  onMenuClick: () => void;
}

export function Toolbar({ onSettingsClick, onExportSvgClick, onMenuClick }: ToolbarProps) {
  const { addIndividual, undo, redo, past, future, pedigree, resetLayout, uShapeView, setNotice } = usePedigreeFields("addIndividual", "undo", "redo", "past", "future", "pedigree", "resetLayout", "uShapeView", "setNotice");
  // An example drawn before its first edit (#151) is in the editor too.
  const hasPedigree = useAppStore(s => s.activePedigreeId !== null || s.example !== null);
  const hasPins = Object.keys(pedigree.pinnedPositions ?? {}).length > 0;
  const activeTitle = useAppStore(s => s.activeTitle) ?? undefined;
  const [pedMenuOpen, setPedMenuOpen] = useState(false);
  // Small screens: the four export buttons, most of the toolbar's width, are one menu.
  const small = useSmallScreen();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // A PED dialect, or the Phenopackets pedigree, which holds what PED holds.
  type PedDialect = NonNullable<ExportOptions["dialect"]> | "phenopackets";
  // PED has no column for pregnancy / loss status, so warn before writing
  // those individuals as ordinary children. Holds the chosen dialect too.
  const [pedWarning, setPedWarning] = useState<{ lines: string[]; dialect: PedDialect } | null>(null);
  const pedWarningFormat = pedWarning?.dialect === "phenopackets" ? "A Phenopackets pedigree" : "PED";

  const { toggle: toggleUShapeView } = useUShapeToggle();
  // In the U-shape view the add buttons and Reset layout do nothing useful.
  // They stay clickable, dimmed, and say why: a disabled button cannot
  // show its hover text.
  const notInU = (title: string, why: string, run: () => void) => uShapeView
    ? { title: `${title}: not in the U-shape view. Click for why.`, "aria-disabled": true, onClick: () => setNotice({ kind: "info", text: why }) }
    : { title, onClick: run };
  const dim = uShapeView ? "opacity-40" : "";

  function handleExportPedClick(dialect: PedDialect) {
    setPedMenuOpen(false);
    const lines = pedExportLosses(pedigree);
    if (lines.length === 0) handleExportPed(dialect);
    else setPedWarning({ dialect, lines });
  }

  function handleExportPed(dialect: PedDialect) {
    setPedWarning(null);
    if (dialect === "phenopackets") {
      downloadText(exportPhenopackets(pedigree, { familyId: "1" }), "application/json", `${activeTitle ?? "pedigree"}.phenopackets.json`);
    } else {
      downloadText(exportPed(pedigree, { familyId: "1", dialect }), "text/plain", `${activeTitle ?? "pedigree"}.ped`);
    }
  }

  function handleExportCsv() {
    downloadText(exportCsv(pedigree, "FAM001"), "text/csv", `${activeTitle ?? "pedigree"}.csv`);
  }

  function handleExportJson() {
    downloadText(exportJson(pedigree, { title: activeTitle ?? "pedigree" }), "application/json", `${activeTitle ?? "pedigree"}.json`);
  }

  return (
    // Small screens: no dividers and the exports in one menu, so the row fits a
    // phone; with "Reset layout" or the problems list it scrolls sideways.
    <div className="flex items-center gap-1 max-lg:gap-0.5 px-2 max-lg:px-1 py-1 border-b bg-white max-lg:overflow-x-auto max-lg:*:shrink-0 max-lg:[scrollbar-width:none]" data-testid="toolbar">
      <Button
        variant="ghost" size="sm"
        title="Menu"
        onClick={onMenuClick}
        className="lg:hidden h-7 w-7 p-0"
        data-testid="sidebar-toggle"
      >
        <Menu size={14} />
      </Button>
      <Dialog open={pedWarning !== null} onOpenChange={open => { if (!open) setPedWarning(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pedWarningFormat} cannot carry everything in this pedigree</DialogTitle>
            <DialogDescription>
              {pedWarningFormat} has no field for pregnancy, pregnancy loss, twins, adoption, a childless couple mark, an ended relationship, donors and surrogates, or consanguinity it cannot work out from the parents, so{" "}
              {pedWarning?.lines.length === 1 ? "this will be lost" : `these ${pedWarning?.lines.length} will be lost`}{" "}
              (pregnancies and losses become ordinary children). Download JSON keeps them.
            </DialogDescription>
          </DialogHeader>
          <ul className="text-xs text-gray-700 max-h-40 overflow-y-auto list-disc pl-5">
            {(pedWarning?.lines ?? []).map((line, k) => <li key={k}>{line}</li>)}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPedWarning(null)}>Cancel</Button>
            <Button variant="outline" size="sm" onClick={() => { setPedWarning(null); handleExportJson(); }}>
              Download JSON
            </Button>
            <Button size="sm" onClick={() => pedWarning && handleExportPed(pedWarning.dialect)}>{pedWarning?.dialect === "phenopackets" ? "Export anyway" : "Export PED anyway"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Add individual — action buttons, not mode toggles */}
      <Button
        variant="ghost" size="sm"
        disabled={!hasPedigree}
        {...notInU("Add male", U_SHAPE_REFUSALS.add, () => addIndividual("male"))}
        className={`h-7 w-7 p-0 ${dim}`}
      >
        <MaleIcon />
      </Button>
      <Button
        variant="ghost" size="sm"
        disabled={!hasPedigree}
        {...notInU("Add female", U_SHAPE_REFUSALS.add, () => addIndividual("female"))}
        className={`h-7 w-7 p-0 ${dim}`}
      >
        <FemaleIcon />
      </Button>
      <Button
        variant="ghost" size="sm"
        disabled={!hasPedigree}
        {...notInU("Add unknown sex", U_SHAPE_REFUSALS.add, () => addIndividual("unknown"))}
        className={`h-7 w-7 p-0 ${dim}`}
      >
        <UnknownIcon />
      </Button>

      <div className="w-px h-5 bg-gray-200 mx-1 max-lg:hidden" />

      {/* Undo/redo */}
      <Button
        variant="ghost" size="sm"
        className="h-7 w-7 p-0"
        title="Undo"
        disabled={past.length === 0}
        onClick={undo}
      >
        <RotateCcw size={14} />
      </Button>
      <Button
        variant="ghost" size="sm"
        className="h-7 w-7 p-0"
        title="Redo"
        disabled={future.length === 0}
        onClick={redo}
      >
        <RotateCw size={14} />
      </Button>

      <div className="flex-1" />

      {/* Reset layout — only visible when pins exist */}
      {hasPins && (
        <Button
          variant="ghost" size="sm"
          {...notInU("Clear all manual node positions and restore auto-layout", U_SHAPE_REFUSALS.resetLayout, resetLayout)}
          className={`h-7 px-2 gap-1 text-xs text-gray-500 ${dim}`}
        >
          Reset layout
        </Button>
      )}

      {/* Editor warnings: shown only while there are some */}
      {hasPedigree && <ProblemsMenu />}

      {/* View filters */}
      <FilterMenu disabled={!hasPedigree} />

      {/* U-shape view (#220): a way of looking, toggled, not saved. On a
          phone it is in the Filter menu, so the toolbar still fits 360px. */}
      {!small && <Button
        variant="ghost" size="sm"
        className={`h-7 px-2 gap-1 text-xs ${uShapeView ? "font-medium text-black bg-gray-100" : ""}`}
        title={uShapeView
          ? "Back to the standard chart"
          : "Draw the family bent round a U, for wide families. Some people are not drawn; edit on the Person tab."}
        aria-pressed={uShapeView}
        data-testid="u-shape-toggle"
        disabled={!hasPedigree}
        onClick={toggleUShapeView}
      >
        <UShapeIcon />
        U-shape
      </Button>}

      {small ? (
        <Popover open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 gap-1 text-xs"
              title="Export"
              disabled={!hasPedigree}
              data-testid="export-menu"
            >
              <Download size={12} />
              Export
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-1" side="bottom" align="end" data-testid="export-menu-items">
            <PedFormatItem label="SVG, PNG or PDF" detail="the chart as a figure" onClick={() => { setExportMenuOpen(false); onExportSvgClick(); }} />
            <PedFormatItem label="PED, PLINK" detail="FID IID PAT MAT SEX PHENO, no header" onClick={() => { setExportMenuOpen(false); handleExportPedClick("plink"); }} />
            <PedFormatItem label="PED, R (pedtools, kinship2)" detail="id fid mid sex aff, tabs, header" onClick={() => { setExportMenuOpen(false); handleExportPedClick("r"); }} />
            <PedFormatItem label="Phenopackets pedigree (JSON)" detail="GA4GH v2 Pedigree, persons" onClick={() => { setExportMenuOpen(false); handleExportPedClick("phenopackets"); }} />
            <PedFormatItem label="CSV" detail="one row per person" onClick={() => { setExportMenuOpen(false); handleExportCsv(); }} />
            <PedFormatItem label="JSON" detail="lossless, re-importable" onClick={() => { setExportMenuOpen(false); handleExportJson(); }} />
          </PopoverContent>
        </Popover>
      ) : (
        <>
        {/* Export PED: PLINK layout or the R dialect read by pedtools and kinship2 */}
        <Popover open={pedMenuOpen} onOpenChange={setPedMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 gap-1 text-xs"
              title="Export as PED file or Phenopackets pedigree (sex, affected status and parents only; pregnancy / loss status is not carried)"
              disabled={!hasPedigree}
            >
              <Download size={12} />
              Export PED
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-1" side="bottom" align="end">
            <PedFormatItem
              label="PLINK"
              detail="FID IID PAT MAT SEX PHENO, no header"
              onClick={() => handleExportPedClick("plink")}
            />
            <PedFormatItem
              label="R (pedtools, kinship2)"
              detail="id fid mid sex aff, tabs, header"
              onClick={() => handleExportPedClick("r")}
            />
            <PedFormatItem
              label="Phenopackets pedigree (JSON)"
              detail="GA4GH v2 Pedigree, persons"
              onClick={() => handleExportPedClick("phenopackets")}
            />
          </PopoverContent>
        </Popover>

        {/* Export CSV */}
        <Button
          variant="ghost" size="sm"
          className="h-7 px-2 gap-1 text-xs"
          title="Export as CSV file"
          disabled={!hasPedigree}
          onClick={handleExportCsv}
        >
          <Download size={12} />
          Export CSV
        </Button>

        {/* Download JSON (lossless, see docs/pedigree-json-format.md) */}
        <Button
          variant="ghost" size="sm"
          className="h-7 px-2 gap-1 text-xs"
          title="Download as JSON (lossless, re-importable)"
          disabled={!hasPedigree}
          onClick={handleExportJson}
        >
          <Download size={12} />
          Download JSON
        </Button>

        {/* Export SVG/PNG */}
        <Button
          variant="ghost" size="sm"
          className="h-7 px-2 gap-1 text-xs"
          title="Export as SVG or PNG"
          disabled={!hasPedigree}
          onClick={onExportSvgClick}
        >
          <Image size={12} />
          SVG/PNG
        </Button>
        </>
      )}

      <div className="w-px h-5 bg-gray-200 mx-0.5 max-lg:hidden" />

      {/* Settings */}
      <Button
        variant="ghost" size="sm"
        className="h-7 w-7 p-0"
        title="Pedigree settings"
        disabled={!hasPedigree}
        onClick={onSettingsClick}
      >
        <Settings size={14} />
      </Button>
    </div>
  );
}

function PedFormatItem({ label, detail, onClick }: { label: string; detail: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-1 rounded-sm hover:bg-gray-100"
    >
      <div className="text-xs">{label}</div>
      <div className="text-[10px] text-gray-400 font-mono">{detail}</div>
    </button>
  );
}
