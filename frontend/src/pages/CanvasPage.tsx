import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { usePedigreeFields } from "../store/usePedigreeStore";
import { Button } from "@/components/ui/button";
import { PedigreeCanvas } from "../pedigree/PedigreeCanvas";
import { UShapeView } from "../pedigree/UShapeView";
import { Toolbar } from "../components/Toolbar";
import { CanvasSidebar } from "../components/CanvasSidebar";
import { EditPanel, type PanelSize } from "../components/EditPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import { ImportPedDialog } from "../components/ImportPedDialog";
import { ExportDialog } from "../components/ExportDialog";
import { TagsDialog } from "../components/TagsDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useEditorSession } from "../hooks/useEditorSession";
import { useSmallScreen } from "../hooks/useSmallScreen";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { requestErrorMessage } from "../api/errors";
import { exampleBySlug } from "../data/examples";
import { PageZoomNotice } from "../components/PageZoomNotice";

/**
 * Shown on small screens until dismissed: viewing works by touch, editing is built for a mouse and keyboard.
 */
const SMALL_SCREEN_NOTICE = "Drag to move, pinch to zoom. Editing is easier on a computer.";
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
  const { activePedigreeId, example: openExampleInfo, createPedigreeFromData } = useAppStore();
  const example = slug === undefined ? undefined : exampleBySlug(slug);
  const editorOpen = activePedigreeId !== null || openExampleInfo !== null;
  const { pedigree, notice, setNotice, undo, uShapeView } = usePedigreeFields("pedigree", "notice", "setNotice", "undo", "uShapeView");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showMinimap, setShowMinimap] = useState(() => {
    try { return localStorage.getItem("showMinimap") !== "false"; } catch { return true; }
  });
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem("compactLayout") === "true"; } catch { return false; }
  });
  const [importOpen, setImportOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  // Small screens: the sidebar opens over the canvas from the
  // toolbar's menu button, and the side panel is a sheet under the canvas,
  // opened at half the screen by tapping a person or one of its tabs and
  // shut by tapping the empty canvas. The tall sheet leaves the chart a
  // strip showing who is selected. Neither state does anything from `lg`
  // up, where both are always shown.
  const small = useSmallScreen();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelSize, setPanelSize] = useState<PanelSize>("closed");
  const openPanel = useCallback(() => setPanelSize(size => size === "closed" ? "half" : size), []);
  const closePanel = useCallback(() => setPanelSize("closed"), []);
  const [smallNoticeDismissed, setSmallNoticeDismissed] = useState(() => {
    try { return localStorage.getItem(SMALL_SCREEN_NOTICE_KEY) === "true"; } catch { return false; }
  });

  useKeyboardShortcuts();

  // Notices (what an edit did, or why it was refused) fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.kind === "error" ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps

  const { notFound } = useEditorSession({ id, slug, example });
  const activeTitle = useAppStore(s => s.activeTitle) ?? undefined;

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
      <CanvasSidebar open={sidebarOpen} onImportClick={() => setImportOpen(true)} />

      {/* Right column: toolbar + editing area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Toolbar
          onSettingsClick={() => setSettingsOpen(true)}
          onExportSvgClick={() => setExportDialogOpen(true)}
          onMenuClick={() => setSidebarOpen(open => !open)}
        />

        <PageZoomNotice />

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
          <div className={`min-h-0 min-w-0 relative ${panelSize === "full" ? "max-lg:h-[min(7rem,20dvh)] max-lg:flex-none lg:flex-1" : "flex-1"}`}>
            {/* The minimap would cover a third of a phone's canvas. */}
            {uShapeView
              ? <UShapeView onPersonTap={openPanel} onPaneTap={closePanel} />
              : <PedigreeCanvas showMinimap={showMinimap && !small} compact={compact}
                  onPersonTap={openPanel} onPaneTap={closePanel} />}
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

          <div className={`lg:w-60 lg:border-l max-lg:border-t bg-white shrink-0 overflow-hidden ${panelSize === "half" ? "max-lg:h-[50dvh]" : panelSize === "full" ? "max-lg:flex-1 max-lg:min-h-0" : ""}`}>
            <EditPanel onManageTags={() => setTagsOpen(true)} size={panelSize} onSizeChange={setPanelSize} />
          </div>
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        showMinimap={showMinimap}
        onToggleMinimap={v => {
          setShowMinimap(v);
          try { localStorage.setItem("showMinimap", String(v)); } catch { /* storage unavailable */ }
        }}
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
