import { useState } from "react";
import { usePedigreeFields } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RotateCcw, RotateCw, Settings, Download, Image, Menu } from "lucide-react";
import { exportPed, type ExportOptions } from "../io/ped/index.js";
import { exportLosses, lossLines } from "../io/losses.js";
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
import { PedTextViewDialog } from "./PedTextViewDialog";

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
  const [pedTextOpen, setPedTextOpen] = useState(false);
  const small = useSmallScreen();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // A PED dialect, or a Phenopackets family.
  type PedDialect = NonNullable<ExportOptions["dialect"]> | "phenopackets";
  // Neither format holds everything, so warn before writing a file that
  // drops something (`exportLosses`). Holds the chosen dialect too.
  const [pedWarning, setPedWarning] = useState<{ lines: string[]; dialect: PedDialect } | null>(null);
  const pedWarningFormat = pedWarning?.dialect === "phenopackets" ? "A Phenopackets file" : "PED";

  const { toggle: toggleUShapeView } = useUShapeToggle();
  // In the U-shape view the add buttons and Reset layout do nothing useful.
  // They stay clickable, dimmed, and say why: a disabled button cannot
  // show its hover text.
  const notInU = (title: string, why: string, run: () => void) => uShapeView
    ? { title: `${title}: not in the U-shape view. Click for why.`, "aria-disabled": true, onClick: () => setNotice({ kind: "info", text: why }) }
    : { title, onClick: run };
  const dim = uShapeView ? "opacity-40" : "";

  function handleExportPedClick(dialect: PedDialect) {
    const lines = lossLines(exportLosses(pedigree, dialect));
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
    // Small screens: no dividers, so the row fits a
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{pedWarningFormat} cannot carry everything in this pedigree</DialogTitle>
            <DialogDescription>
              {pedWarningFormat} has no place for what is listed here, so it will be lost or changed when the file is read back. JSON keeps everything.
            </DialogDescription>
          </DialogHeader>
          <ul className="text-xs text-gray-700 max-h-60 overflow-y-auto list-disc pl-5" data-testid="export-losses">
            {(pedWarning?.lines ?? []).map((line, k) => <li key={k}>{line}</li>)}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPedWarning(null)}>Cancel</Button>
            <Button variant="outline" size="sm" onClick={() => { setPedWarning(null); handleExportJson(); }}>
              Export JSON instead
            </Button>
            <Button size="sm" onClick={() => pedWarning && handleExportPed(pedWarning.dialect)}>Export anyway</Button>
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

      {/* The data files in one menu. The figure has its own button, except on
          a phone, where the toolbar has room for only one and the menu leads with it. */}
      <Popover open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost" size="sm"
            className="h-7 px-2 gap-1 text-xs"
            title="Export the pedigree as a JSON, PED, Phenopackets or CSV file"
            disabled={!hasPedigree}
            data-testid="export-menu"
          >
            <Download size={12} />
            Export
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1" side="bottom" align="end" data-testid="export-menu-items">
          {small && <>
            <ExportItem label="SVG, PNG or PDF…" detail="the chart as a figure" title="Export as SVG, PNG or PDF" onClick={() => { setExportMenuOpen(false); onExportSvgClick(); }} />
            <div className="my-1 border-t" />
          </>}
          <ExportItem label="JSON" detail="lossless, re-importable" title="Export as JSON (lossless, re-importable)" onClick={() => { setExportMenuOpen(false); handleExportJson(); }} />
          <ExportItem label="PED, PLINK" detail="FID IID PAT MAT SEX PHENO, no header" title="Export as PED file (PLINK)" onClick={() => { setExportMenuOpen(false); handleExportPedClick("plink"); }} />
          <ExportItem label="PED, R (pedtools, kinship2)" detail="id fid mid sex aff, tabs, header" title="Export as PED file (R)" onClick={() => { setExportMenuOpen(false); handleExportPedClick("r"); }} />
          <ExportItem label="Phenopackets family (JSON)" detail="GA4GH v2 Family, a phenopacket per person" title="Export as Phenopackets family" onClick={() => { setExportMenuOpen(false); handleExportPedClick("phenopackets"); }} />
          <ExportItem label="CSV" detail="one row per person" title="Export as CSV file" onClick={() => { setExportMenuOpen(false); handleExportCsv(); }} />
          {!small && <>
            <div className="my-1 border-t" />
            <ExportItem label="View PED as text" detail="the PLINK PED, to read or copy" title="View the PLINK PED as text" onClick={() => { setExportMenuOpen(false); setPedTextOpen(true); }} />
          </>}
        </PopoverContent>
      </Popover>
      {!small && <PedTextViewDialog pedigree={pedigree} open={pedTextOpen} onClose={() => setPedTextOpen(false)} />}

      {!small && <Button
        variant="ghost" size="sm"
        className="h-7 px-2 gap-1 text-xs"
        title="Export as SVG, PNG or PDF"
        disabled={!hasPedigree}
        onClick={onExportSvgClick}
      >
        <Image size={12} />
        SVG/PNG/PDF
      </Button>}

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

function ExportItem({ label, detail, title, onClick }: { label: string; detail: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-full text-left px-2 py-1 rounded-sm hover:bg-gray-100"
    >
      <div className="text-xs">{label}</div>
      <div className="text-[10px] text-gray-400 font-mono">{detail}</div>
    </button>
  );
}
