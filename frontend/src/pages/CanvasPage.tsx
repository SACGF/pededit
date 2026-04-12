import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { Button } from "@/components/ui/button";
import { PedigreeCanvas } from "../pedigree/PedigreeCanvas";
import { Toolbar } from "../components/Toolbar";
import { EditPanel } from "../components/EditPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

export default function CanvasPage() {
  const { user, pedigrees, activePedigreeId, loadPedigrees, createPedigree, openPedigree, logout, saveActivePedigree } = useAppStore();
  const { isDirty } = usePedigreeStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useKeyboardShortcuts();

  useEffect(() => { loadPedigrees(); }, [loadPedigrees]);

  const handleNew = async () => {
    const id = await createPedigree("Untitled pedigree");
    await openPedigree(id);
  };

  const hasPedigree = activePedigreeId !== null;

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar — always visible */}
      <Toolbar onSettingsClick={() => setSettingsOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — pedigree list */}
        <div className="w-56 border-r bg-white flex flex-col shrink-0">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="font-medium text-xs">{user?.username}</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={logout}>
              Sign out
            </Button>
          </div>
          <div className="p-3 flex-1 overflow-y-auto">
            <Button size="sm" className="w-full mb-2 h-7 text-xs" onClick={handleNew}>
              New pedigree
            </Button>
            <ul className="space-y-0.5">
              {pedigrees.map((p) => (
                <li key={p.id}>
                  <button
                    className={`
                      w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 truncate
                      ${activePedigreeId === p.id ? "bg-gray-100 font-medium" : ""}
                    `}
                    onClick={() => openPedigree(p.id)}
                  >
                    {p.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Save button */}
          {hasPedigree && (
            <div className="p-3 border-t">
              <Button
                size="sm"
                variant={isDirty ? "default" : "outline"}
                className="w-full h-7 text-xs"
                onClick={saveActivePedigree}
                disabled={!isDirty}
              >
                {isDirty ? "Save" : "Saved"}
              </Button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1">
          {hasPedigree ? (
            <PedigreeCanvas />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400 text-sm">
              Select or create a pedigree
            </div>
          )}
        </div>

        {/* Right sidebar — edit panel */}
        {hasPedigree && (
          <div className="w-52 border-l bg-white shrink-0 overflow-y-auto">
            <EditPanel />
          </div>
        )}
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
