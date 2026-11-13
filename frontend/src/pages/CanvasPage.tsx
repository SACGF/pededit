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
import { TagsDialog } from "../components/TagsDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import type { PedigreeMeta } from "../api/client";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { forgetRecentPedigree } from "../utils/recentPedigrees";

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


/** Where the editor sends bug reports and feature requests (#113). */
const NEW_ISSUE_URL = "https://github.com/SACGF/pededit/issues/new";
/** How to run PedEdit on your own server, for clinical data (#113). */
const INSTALL_URL = "https://github.com/SACGF/pededit/blob/main/INSTALL.md";

export default function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    isAuthenticated, pedigrees, activePedigreeId,
    loadPedigrees, createPedigree, createPedigreeFromData, openPedigree,
    logout, saveActivePedigree, renamePedigree,
  } = useAppStore();
  const { isDirty, pedigree, notice, setNotice, undo } = usePedigreeStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showMinimap, setShowMinimap] = useState(() => localStorage.getItem("showMinimap") === "true");
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem("compactLayout") === "true"; } catch { return false; }
  });
  const [importOpen, setImportOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context); the URL bar still works.
    }
  };
  const [notFound, setNotFound] = useState(false);

  useKeyboardShortcuts();

  // Notices (what an edit did, or why it was refused) fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.kind === "error" ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the pedigree identified by the URL param
  useEffect(() => {
    if (!id) return;
    setNotFound(false);
    openPedigree(id).catch((err: unknown) => {
      setNotFound(true);
      // Gone from the server: drop it from "Recent on this device". A network
      // error keeps the entry, since the pedigree may still exist.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) forgetRecentPedigree(id);
    });
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
  const activeTitle = useAppStore(s => s.activeTitle) ?? undefined;
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
                Import PED/JSON…
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
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-hidden focus:ring-1 focus:ring-black"
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
                This pedigree is saved at this URL and nowhere else. Bookmark it or copy the link to come back to it.
                The home page also lists it under "Recent on this device" in this browser.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full mb-3 h-7 text-xs"
                onClick={copyLink}
              >
                {linkCopied ? "Link copied" : "Copy link"}
              </Button>
              <p>
                <span
                  className="text-black underline underline-offset-1 cursor-pointer"
                  onClick={() => navigate("/login")}
                >
                  Sign in
                </span>
                {" "}to see all your pedigrees in one place.
              </p>
            </div>
          )}
        </div>

        {/* Feedback and self-hosting (#113) */}
        <div className="px-3 py-2 border-t text-[10px] text-gray-400 leading-relaxed" data-testid="feedback-links">
          <p>
            Found a bug or want a feature?{" "}
            <a
              href={NEW_ISSUE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-black underline underline-offset-1"
            >
              Tell us on GitHub
            </a>
          </p>
          <p className="mt-1">
            PedEdit is open source. For clinical work you can{" "}
            <a
              href={INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-black underline underline-offset-1"
            >
              host your own copy
            </a>
            .
          </p>
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
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 relative">
            <PedigreeCanvas showMinimap={showMinimap} compact={compact} />
            {notice && (
              <div
                role={notice.kind === "error" ? "alert" : "status"}
                data-testid="notice"
                className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-3 py-1.5 text-xs border bg-white ${notice.kind === "error" ? "border-red-600 text-red-700" : "border-gray-400 text-gray-800"}`}
              >
                <span>{notice.text}</span>
                {notice.undoable && (
                  <button className="underline underline-offset-2 hover:text-black" onClick={() => { undo(); setNotice(null); }}>
                    Undo
                  </button>
                )}
                <button className="text-gray-400 hover:text-black" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
              </div>
            )}
          </div>

          <div className="w-60 border-l bg-white shrink-0 overflow-y-auto">
            <EditPanel onManageTags={() => setTagsOpen(true)} />
          </div>
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        showMinimap={showMinimap}
        onToggleMinimap={v => { setShowMinimap(v); localStorage.setItem("showMinimap", String(v)); }}
        compact={compact}
        onToggleCompact={v => {
          setCompact(v);
          try { localStorage.setItem("compactLayout", String(v)); } catch { /* storage unavailable */ }
        }}
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
          defaultCompact={compact}
        />
      )}

      {activePedigreeId && (
        <TagsDialog open={tagsOpen} onOpenChange={setTagsOpen} />
      )}

    </div>
  );
}
