import { usePedigreeStore, ActiveTool } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { RotateCcw, RotateCw, Settings } from "lucide-react";

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
}

const TOOLS: { tool: ActiveTool; label: string; icon: React.ReactNode }[] = [
  { tool: "select",     label: "Select",         icon: "↖" },
  { tool: "addMale",    label: "Add male",        icon: <MaleIcon /> },
  { tool: "addFemale",  label: "Add female",      icon: <FemaleIcon /> },
  { tool: "addUnknown", label: "Add unknown sex", icon: <UnknownIcon /> },
];

export function Toolbar({ onSettingsClick }: ToolbarProps) {
  const { activeTool, setActiveTool, undo, redo, past, future } = usePedigreeStore();
  const { activePedigreeId } = useAppStore();
  const hasPedigree = activePedigreeId !== null;

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b bg-white">
      {/* Tool buttons */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map(({ tool, label, icon }) => (
          <Button
            key={tool}
            variant={activeTool === tool ? "secondary" : "ghost"}
            size="sm"
            title={label}
            disabled={!hasPedigree}
            onClick={() => setActiveTool(tool)}
            className="h-7 w-7 p-0"
          >
            {icon}
          </Button>
        ))}
      </div>

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
