import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { usePedigreeStore, usePedigreeFields } from "../store/usePedigreeStore";
import { forgetRecentPedigree } from "../utils/recentPedigrees";
import { requestErrorMessage } from "../api/errors";
import type { ExamplePedigree } from "../data/examples";

/**
 * What `CanvasPage` does to open, save and close the pedigree its URL
 * names: the example of `/example/<slug>` or the saved pedigree of
 * `/p/<id>`, auto-save, saving at once when the tab is hidden or closed,
 * emptying the editor on leaving, the pedigree list when signed in, and the
 * page title. True when the server has no pedigree with that id (or could
 * not be reached).
 */
export function useEditorSession({ id, slug, example }: { id?: string; slug?: string; example?: ExamplePedigree }): { notFound: boolean } {
  const navigate = useNavigate();
  const {
    isAuthenticated, activePedigreeId, example: openExampleInfo,
    loadPedigrees, openPedigree, openExample, saveActivePedigree, closePedigree,
  } = useAppStore();
  const { isDirty, pedigree, setNotice } = usePedigreeFields("isDirty", "pedigree", "setNotice");
  // Failed creates of an example's copy so far, which spaces out the retries.
  const [copyRetries, setCopyRetries] = useState(0);
  const [notFound, setNotFound] = useState(false);

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

  return { notFound };
}
