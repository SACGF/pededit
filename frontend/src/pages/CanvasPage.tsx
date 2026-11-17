import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { usePedigreeStore, usePedigreeFields } from "../store/usePedigreeStore";
import { Button } from "@/components/ui/button";
import { PedigreeCanvas } from "../pedigree/PedigreeCanvas";
import { Toolbar } from "../components/Toolbar";
import { EditPanel } from "../components/EditPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import { ImportPedDialog } from "../components/ImportPedDialog";
import { ExportDialog } from "../components/ExportDialog";
import { TagsDialog } from "../components/TagsDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSmallScreen } from "../hooks/useSmallScreen";
import type { PedigreeMeta } from "../api/client";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { forgetRecentPedigree } from "../utils/recentPedigrees";
import { requestErrorMessage } from "../api/errors";
import { exampleBySlug } from "../data/examples";

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


/** The issue tracker, not the new-issue form, so people can search for an existing report first. */
const ISSUES_URL = "https://github.com/SACGF/pededit/issues";
/**
 * The repository, for self-hosting with clinical data. Clinicians
 * hand this to whoever runs their servers, who finds INSTALL.md from there.
 */
const REPO_URL = "https://github.com/SACGF/pededit";

/** Shown on small screens until dismissed: viewing works by touch, editing is built for a mouse and keyboard. */
const SMALL_SCREEN_NOTICE = "Drag to move around, pinch to zoom, tap a person to select them. Editing is easier on a computer.";
const SMALL_SCREEN_NOTICE_KEY = "smallScreenNoticeDismissed";

/**
 * The editor, for `/p/<id>` and for `/example/<slug>` (#151). An example is
 * drawn from the bundle and saved only by the first edit, which replaces
 * the URL with the new copy's `/p/<id>`. Both routes render this component,
 * so React keeps it mounted across that change and the undo history stays.
 */
export default function CanvasPage() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const {
    isAuthenticated, pedigrees, activePedigreeId, example: openExampleInfo,
    loadPedigrees, createPedigree, createPedigreeFromData, openPedigree, openExample,
    logout, saveActivePedigree, renamePedigree, closePedigree,
  } = useAppStore();
  const example = slug === undefined ? undefined : exampleBySlug(slug);
  const editorOpen = activePedigreeId !== null || openExampleInfo !== null;
  // Failed creates of an example's copy so far, which spaces out the retries.
  const [copyRetries, setCopyRetries] = useState(0);
  const { isDirty, pedigree, notice, setNotice, undo } = usePedigreeFields("isDirty", "pedigree", "notice", "setNotice", "undo");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showMinimap, setShowMinimap] = useState(() => localStorage.getItem("showMinimap") !== "false");
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem("compactLayout") === "true"; } catch { return false; }
  });
  const [importOpen, setImportOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [notFound, setNotFound] = useState(false);
  // Small screens: the sidebar opens over the canvas from the
  // toolbar's menu button, and the side panel is a sheet under the canvas
  // that stays shut until one of its tabs is tapped. Neither state does
  // anything from `lg` up, where both are always shown.
  const small = useSmallScreen();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [smallNoticeDismissed, setSmallNoticeDismissed] = useState(() => {
    try { return localStorage.getItem(SMALL_SCREEN_NOTICE_KEY) === "true"; } catch { return false; }
  });

  useKeyboardShortcuts();

  // The editor is a canvas: two fingers zoom the chart, not the page. A page
  // zoomed from the toolbar or a panel could not be zoomed back out from the
  // canvas, which takes every touch itself. Scrolling inside panels is kept.
  // On the root element so dialogs, which are portals, are covered too.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.touchAction;
    root.style.touchAction = "pan-x pan-y";
    return () => { root.style.touchAction = before; };
  }, []);

  // Notices (what an edit did, or why it was refused) fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.kind === "error" ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the example named by the URL; nothing is saved until it is edited.
  useEffect(() => {
    if (example) openExample(example);
  }, [example]); // eslint-disable-line react-hooks/exhaustive-deps

  // The first edit saved the example's copy: the URL becomes its link.
  useEffect(() => {
    if (slug !== undefined && activePedigreeId) navigate(`/p/${activePedigreeId}`, { replace: true });
  }, [slug, activePedigreeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the pedigree identified by the URL param
  useEffect(() => {
    if (!id) return;
    // Already in the editor: the example copy just created.
    if (useAppStore.getState().activePedigreeId === id) return;
    setNotFound(false);
    openPedigree(id).catch((err: unknown) => {
      setNotFound(true);
      // Gone from the server: drop it from "Recent on this device". A network
      // error keeps the entry, since the pedigree may still exist.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) forgetRecentPedigree(id);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the editor (back to the landing page) empties it, so the next
  // pedigree opened does not flash the last one first.
  useEffect(() => () => closePedigree(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save at once when the tab is hidden or closed, rather than losing the
  // last 2 s of edits. The browser's own "Leave site?" prompt shows
  // only when the edits may not reach the server: the last save failed, or
  // the pedigree is too big for a keepalive request and the save is still
  // running when the page unloads.
  useEffect(() => {
    const { flushActivePedigree } = useAppStore.getState();
    const onHidden = () => { if (document.visibilityState === "hidden") flushActivePedigree(); };
    const onPageHide = () => { flushActivePedigree(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!usePedigreeStore.getState().isDirty) return;
      const sent = useAppStore.getState().flushActivePedigree();
      if (sent === "keepalive" && !useAppStore.getState().lastSaveFailed) return;
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  // Auto-save: debounce 2 s after the last mutation so changes survive a reload.
  // An example's first edit saves the copy at once, so the link is the
  // visitor's own from then on; a failed create keeps the edits and retries.
  useEffect(() => {
    if (!isDirty) return;
    if (!activePedigreeId) {
      if (!openExampleInfo) return;
      const timer = setTimeout(() => {
        saveActivePedigree().then(
          () => setCopyRetries(0),
          err => {
            setNotice({ kind: "error", text: `${requestErrorMessage(err, "Could not save your copy of the example. Check your connection.")} Your changes are kept here and saving will be tried again.` });
            setCopyRetries(n => n + 1);
          },
        );
      }, copyRetries ? 10_000 : 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => { saveActivePedigree().catch(() => {}); }, 2000);
    return () => clearTimeout(timer);
  }, [pedigree, activePedigreeId, copyRetries]); // eslint-disable-line react-hooks/exhaustive-deps

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
    let newId: string;
    try {
      newId = await createPedigree("Untitled pedigree");
    } catch (err) {
      setNotice({ kind: "error", text: requestErrorMessage(err, "Could not create the pedigree. Check your connection and try again.") });
      return;
    }
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

  if (slug !== undefined && !example) return <Navigate to="/" replace />;

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
    <div className="relative flex h-app overflow-hidden">
      {/* Small screens: a tap outside the open sidebar closes it. */}
      {sidebarOpen && (
        <div className="absolute inset-0 z-20 bg-black/20 lg:hidden" data-testid="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}
      {/* Left sidebar */}
      <div
        className={`${sidebarOpen ? "flex absolute inset-y-0 left-0 z-30" : "hidden"} lg:flex lg:static w-56 border-r bg-white flex-col shrink-0`}
        data-testid="sidebar"
      >
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
                {openExampleInfo
                  ? "This example is not saved. Change anything and it is saved as your own copy, at a new URL that you can bookmark or share."
                  : <>This pedigree is saved at this URL and nowhere else. Bookmark it or copy the link to come back to it.
                    The home page also lists it under "Recent on this device" in this browser.</>}
              </p>
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

        {/* How to select and move around: there is no select mode (#122), so it is said here, always in view. */}
        <div className="px-3 py-2 border-t text-[11px] text-gray-500 leading-snug" data-testid="canvas-help">
          <p className="text-gray-700 mb-1">Using the canvas</p>
          <ul className="space-y-0.5">
            <li>Click a person to select and edit them</li>
            <li><b className="font-medium text-gray-700">Shift+click</b> to add or remove from the selection</li>
            <li><b className="font-medium text-gray-700">Shift+drag</b> to select an area</li>
            <li>Drag the background to pan, scroll to zoom</li>
            <li>Right-click a person or couple line for more</li>
          </ul>
        </div>

        {/* Feedback and self-hosting */}
        <div className="px-3 py-2 border-t text-[10px] text-gray-400 leading-relaxed" data-testid="feedback-links">
          <p>
            Found a bug or want a feature?{" "}
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-black underline underline-offset-1"
            >
              Tell us on GitHub
            </a>
          </p>
          <p className="mt-1">
            PedEdit is open source. For patient data, you can{" "}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-black underline underline-offset-1"
            >
              host your own copy
            </a>{" "}
            so it stays on your network.
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
            {isDirty ? "Save" : openExampleInfo ? "Not saved (example)" : "Saved"}
          </Button>
        </div>
      </div>

      {/* Right column: toolbar + editing area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Toolbar
          onSettingsClick={() => setSettingsOpen(true)}
          onExportSvgClick={() => setExportDialogOpen(true)}
          onMenuClick={() => setSidebarOpen(open => !open)}
        />

        {openExampleInfo && (
          <div className="px-3 py-1 border-b bg-white text-[11px] text-gray-600" data-testid="example-notice">
            Example. Your own copy is saved when you change something.
          </div>
        )}

        {/* Small screens: how to move around by touch, and that editing wants a bigger screen. */}
        {!smallNoticeDismissed && (
          <div className="lg:hidden flex items-start gap-2 px-3 py-1.5 border-b bg-white text-[11px] leading-snug text-gray-600" data-testid="small-screen-notice">
            <p className="flex-1">{SMALL_SCREEN_NOTICE}</p>
            <button
              className="-my-1 -mr-2 px-2 py-1 text-sm leading-none text-gray-400 hover:text-black"
              aria-label="Dismiss"
              onClick={() => {
                setSmallNoticeDismissed(true);
                try { localStorage.setItem(SMALL_SCREEN_NOTICE_KEY, "true"); } catch { /* storage unavailable */ }
              }}
            >
              ×
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 min-w-0 relative">
            {/* The minimap would cover a third of a phone's canvas. */}
            <PedigreeCanvas showMinimap={showMinimap && !small} compact={compact} />
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

          <div className={`lg:w-60 lg:border-l max-lg:border-t bg-white shrink-0 overflow-hidden ${panelOpen ? "max-lg:h-[50dvh]" : ""}`}>
            <EditPanel onManageTags={() => setTagsOpen(true)} open={panelOpen} onOpenChange={setPanelOpen} />
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
          try {
            for (const { title, pedigree: importedPedigree } of pending) {
              lastId = await createPedigreeFromData(title, importedPedigree);
            }
          } catch (err) {
            setNotice({ kind: "error", text: requestErrorMessage(err, "Could not save the imported pedigree. Check your connection and try again.") });
            return;
          }
          if (lastId) navigate(`/p/${lastId}`);
        }}
      />

      {editorOpen && (
        <ExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          pedigree={pedigree}
          title={activeTitle ?? "pedigree"}
          defaultCompact={compact}
        />
      )}

      {editorOpen && (
        <TagsDialog open={tagsOpen} onOpenChange={setTagsOpen} />
      )}

    </div>
  );
}
