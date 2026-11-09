import { useState } from "react";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RotateCcw, RotateCw, Settings, Download, Image } from "lucide-react";
import { exportPed, type ExportOptions } from "../io/ped/index.js";
import { pedLostLifeStatus, pedLostChildless } from "../io/ped/exporter.js";
import { lifeStatusLabel } from "../pedigree/lifeStatus";
import { childlessLabel } from "../pedigree/childless";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { exportCsv } from "../io/csv/exporter";
import { exportJson } from "../io/json/index.js";

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
}

export function Toolbar({ onSettingsClick, onExportSvgClick }: ToolbarProps) {
  const { activeTool, setActiveTool, addIndividual, undo, redo, past, future, pedigree, resetLayout } = usePedigreeStore();
  const { activePedigreeId } = useAppStore();
  const hasPedigree = activePedigreeId !== null;
  const hasPins = Object.keys(pedigree.pinnedPositions ?? {}).length > 0;
  const activeTitle = useAppStore(s => s.activeTitle) ?? undefined;
  const [pedMenuOpen, setPedMenuOpen] = useState(false);

  type PedDialect = NonNullable<ExportOptions["dialect"]>;
  // PED has no column for pregnancy / loss status, so warn before writing
  // those individuals as ordinary children. Holds the chosen dialect too.
  const [pedWarning, setPedWarning] = useState<{ lines: string[]; dialect: PedDialect } | null>(null);

  function handleExportPedClick(dialect: PedDialect) {
    setPedMenuOpen(false);
    const lost = pedLostLifeStatus(pedigree);
    const lostCouples = pedLostChildless(pedigree);
    if (lost.length === 0 && lostCouples.length === 0) { handleExportPed(dialect); return; }
    const nameOf = (id: string) => { const i = pedigree.individuals.find(x => x.id === id); return i?.name || id; };
    setPedWarning({
      dialect,
      lines: [
        ...lost.map(i => `${i.name || i.id}: ${lifeStatusLabel(i.lifeStatus!)}`),
        ...lostCouples.map(p => `${nameOf(p.individual1)} and ${nameOf(p.individual2)}: ${childlessLabel(p.childless!)}`),
      ],
    });
  }

  function handleExportPed(dialect: PedDialect) {
    setPedWarning(null);
    const text = exportPed(pedigree, { familyId: "1", dialect });
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTitle ?? "pedigree"}.ped`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    const text = exportCsv(pedigree, "FAM001");
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTitle ?? "pedigree"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportJson() {
    const text = exportJson(pedigree, { title: activeTitle ?? "pedigree" });
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTitle ?? "pedigree"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b bg-white">
      <Dialog open={pedWarning !== null} onOpenChange={open => { if (!open) setPedWarning(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>PED drops pregnancies, losses and childless marks</DialogTitle>
            <DialogDescription>
              PED has no column for pregnancy, pregnancy loss or a childless couple mark, so{" "}
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
            <Button size="sm" onClick={() => pedWarning && handleExportPed(pedWarning.dialect)}>Export PED anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Select mode */}
      <Button
        variant={activeTool === "select" ? "secondary" : "ghost"}
        size="sm"
        title="Select"
        disabled={!hasPedigree}
        onClick={() => setActiveTool("select")}
        className="h-7 w-7 p-0"
      >
        ↖
      </Button>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      {/* Add individual — action buttons, not mode toggles */}
      <Button
        variant="ghost" size="sm"
        title="Add male"
        disabled={!hasPedigree}
        onClick={() => addIndividual("male")}
        className="h-7 w-7 p-0"
      >
        <MaleIcon />
      </Button>
      <Button
        variant="ghost" size="sm"
        title="Add female"
        disabled={!hasPedigree}
        onClick={() => addIndividual("female")}
        className="h-7 w-7 p-0"
      >
        <FemaleIcon />
      </Button>
      <Button
        variant="ghost" size="sm"
        title="Add unknown sex"
        disabled={!hasPedigree}
        onClick={() => addIndividual("unknown")}
        className="h-7 w-7 p-0"
      >
        <UnknownIcon />
      </Button>

      <div className="w-px h-5 bg-gray-200 mx-1" />

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
          className="h-7 px-2 gap-1 text-xs text-gray-500"
          title="Clear all manual node positions and restore auto-layout"
          onClick={resetLayout}
        >
          Reset layout
        </Button>
      )}

      {/* Export PED: PLINK layout or the R dialect read by pedtools and kinship2 */}
      <Popover open={pedMenuOpen} onOpenChange={setPedMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost" size="sm"
            className="h-7 px-2 gap-1 text-xs"
            title="Export as PED file (sex, affected status and parents only; pregnancy / loss status is not carried)"
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

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

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
