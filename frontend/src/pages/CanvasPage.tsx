import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { Button } from "@/components/ui/button";
import { PedigreeCanvas } from "../pedigree/PedigreeCanvas";
import { Toolbar } from "../components/Toolbar";
import { EditPanel } from "../components/EditPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import { ImportPedDialog } from "../components/ImportPedDialog";
import { ExportDialog } from "../components/ExportDialog";
import { LegendDialog } from "../components/LegendDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import type { PedigreeMeta } from "../api/client";
import type { Pedigree } from "@pedigree-editor/layout-engine";

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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    isAuthenticated, pedigrees, activePedigreeId,
    loadPedigrees, createPedigree, createPedigreeFromData, openPedigree,
    logout, saveActivePedigree, renamePedigree,
  } = useAppStore();
  const { isDirty, pedigree } = usePedigreeStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showMinimap, setShowMinimap] = useState(() => localStorage.getItem("showMinimap") === "true");
  const [importOpen, setImportOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [notFound, setNotFound] = useState(false);

  useKeyboardShortcuts();

  // Load the pedigree identified by the URL param
  useEffect(() => {
    if (!id) return;
    setNotFound(false);
    openPedigree(id).catch(() => setNotFound(true));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save: debounce 2 s after the last mutation so changes survive a reload.
  useEffect(() => {
    if (!isDirty || !activePedigreeId) return;
    const timer = setTimeout(() => { saveActivePedigree(); }, 2000);
    return () => clearTimeout(timer);
  }, [pedigree]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load pedigree list for authenticated users
  useEffect(() => {
    if (isAuthenticated) loadPedigrees();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Page title
  const activeTitle = pedigrees.find(p => p.id === activePedigreeId)?.title;
  useEffect(() => {
    document.title = activeTitle ? `PedEdit: ${activeTitle}` : "PedEdit: Pedigree Editor";
  }, [activeTitle]);

  const handleNew = async () => {
    const newId = await createPedigree("Untitled pedigree");
    navigate(`/p/${newId}`);
    setEditingId(newId);
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

  if (notFound) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-3">
        <p className="text-sm text-gray-500">Pedigree not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          Go to home
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left sidebar */}
      <div className="w-56 border-r bg-white flex flex-col shrink-0">
        <div className="p-3 border-b flex items-center justify-between">
          <button
            className="text-xs font-medium hover:underline"
            onClick={() => navigate("/")}
          >
            PedEdit
          </button>
          {isAuthenticated ? (
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={logout}>
              Sign out
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => navigate("/login")}>
              Sign in
            </Button>
          )}
        </div>

        <div className="p-3 flex-1 overflow-y-auto">
          {isAuthenticated ? (
            <>
              <Button size="sm" className="w-full mb-1 h-7 text-xs" onClick={handleNew}>
                New pedigree
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full mb-2 h-7 text-xs"
                onClick={() => setImportOpen(true)}
              >
                Import PED…
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
                        onClick={() => navigate(`/p/${p.id}`)}
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
            </>
          ) : (
            <div className="text-[10px] text-gray-400 leading-relaxed">
              <p className="mb-2">
                This pedigree is anonymous. Bookmark the URL to return to it.
              </p>
              <p>
                <span
                  className="text-black underline underline-offset-1 cursor-pointer"
                  onClick={() => navigate("/login")}
                >
                  Sign in
                </span>
                {" "}to save and manage your pedigrees.
              </p>
            </div>
          )}
        </div>

        {/* Save button */}
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
      </div>

      {/* Right column: toolbar + editing area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <Toolbar
          onSettingsClick={() => setSettingsOpen(true)}
          onExportSvgClick={() => setExportDialogOpen(true)}
          onLegendClick={() => setLegendOpen(true)}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1">
            <PedigreeCanvas showMinimap={showMinimap} />
          </div>

          <div className="w-52 border-l bg-white shrink-0 overflow-y-auto">
            <EditPanel />
          </div>
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        showMinimap={showMinimap}
        onToggleMinimap={v => { setShowMinimap(v); localStorage.setItem("showMinimap", String(v)); }}
      />

      <ImportPedDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={async (pending: { title: string; pedigree: Pedigree }[]) => {
          let lastId: string | null = null;
          for (const { title, pedigree: importedPedigree } of pending) {
            const newId = await createPedigreeFromData(title, importedPedigree);
            lastId = newId;
          }
          if (lastId) navigate(`/p/${lastId}`);
        }}
      />

      {activePedigreeId && (
        <ExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          pedigree={pedigree}
          title={activeTitle ?? "pedigree"}
        />
      )}

      {activePedigreeId && (
        <LegendDialog
          open={legendOpen}
          onOpenChange={setLegendOpen}
          pedigree={pedigree}
        />
      )}
    </div>
  );
}
