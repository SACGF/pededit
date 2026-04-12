import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { Button } from "@/components/ui/button";
import { PedigreeCanvas } from "../pedigree/PedigreeCanvas";
import { Toolbar } from "../components/Toolbar";
import { EditPanel } from "../components/EditPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import type { PedigreeMeta } from "../api/client";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function CanvasPage() {
  const {
    user, pedigrees, activePedigreeId,
    loadPedigrees, createPedigree, openPedigree, logout,
    saveActivePedigree, renamePedigree,
  } = useAppStore();
  const { isDirty } = usePedigreeStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useKeyboardShortcuts();
  useEffect(() => { loadPedigrees(); }, [loadPedigrees]);

  // Page title
  const activeTitle = pedigrees.find(p => p.id === activePedigreeId)?.title;
  useEffect(() => {
    document.title = activeTitle ? `PedEd: ${activeTitle}` : "PedEd: Pedigree Editor";
  }, [activeTitle]);

  const handleNew = async () => {
    const id = await createPedigree("Untitled pedigree");
    await openPedigree(id);
    setEditingId(id);
    setEditingName("Untitled pedigree");
  };

  const startEditing = (p: PedigreeMeta) => {
    setEditingId(p.id);
    setEditingName(p.title);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim() || "Untitled pedigree";
    await renamePedigree(editingId, trimmed);
    setEditingId(null);
  };

  const hasPedigree = activePedigreeId !== null;

  return (
    <div className="flex h-screen overflow-hidden">
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
                {editingId === p.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
                  />
                ) : (
                  <button
                    className={`
                      w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100
                      ${activePedigreeId === p.id ? "bg-gray-100 font-medium" : ""}
                    `}
                    onClick={() => openPedigree(p.id)}
                    onDoubleClick={(e) => { e.preventDefault(); startEditing(p); }}
                    title={`Created: ${formatDate(p.created)}\nModified: ${formatDate(p.updated)}`}
                  >
                    <span className="block truncate">{p.title}</span>
                    <span className="text-[9px] text-gray-400 font-normal">{relativeTime(p.updated)}</span>
                  </button>
                )}
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

      {/* Right column: toolbar (when active) + editing area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {hasPedigree && <Toolbar onSettingsClick={() => setSettingsOpen(true)} />}

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1">
            {hasPedigree ? (
              <PedigreeCanvas />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400 text-sm">
                Select or create a pedigree
              </div>
            )}
          </div>

          {hasPedigree && (
            <div className="w-52 border-l bg-white shrink-0 overflow-y-auto">
              <EditPanel />
            </div>
          )}
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
