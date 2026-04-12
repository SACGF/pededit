import { usePedigreeStore } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { RotateCcw, RotateCw, Settings, Download, Image, List } from "lucide-react";
import { exportPed } from "../io/ped/index.js";
import { exportCsv } from "../io/csv/exporter";

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
  onLegendClick: () => void;
}

export function Toolbar({ onSettingsClick, onExportSvgClick, onLegendClick }: ToolbarProps) {
  const { activeTool, setActiveTool, addIndividual, undo, redo, past, future, pedigree } = usePedigreeStore();
  const { activePedigreeId, pedigrees } = useAppStore();
  const hasPedigree = activePedigreeId !== null;
  const activeTitle = pedigrees.find(p => p.id === activePedigreeId)?.title;

  function handleExportPed() {
    const text = exportPed(pedigree, { familyId: "1" });
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

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b bg-white">
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

      {/* Export PED */}
      <Button
        variant="ghost" size="sm"
        className="h-7 px-2 gap-1 text-xs"
        title="Export as PED file"
        disabled={!hasPedigree}
        onClick={handleExportPed}
      >
        <Download size={12} />
        Export PED
      </Button>

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

      {/* Legend */}
      <Button
        variant="ghost" size="sm"
        className="h-7 px-2 gap-1 text-xs"
        title="Figure legend"
        disabled={!hasPedigree}
        onClick={onLegendClick}
      >
        <List size={12} />
        Legend
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
