import { useEffect } from "react";
import { usePedigreeStore } from "../store/usePedigreeStore";

export function useKeyboardShortcuts() {
  const { undo, redo, deleteIndividual, selectedId, setActiveTool } = usePedigreeStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        // Guard: don't delete when typing in an input
        if (document.activeElement?.tagName === "INPUT") return;
        if (document.activeElement?.tagName === "TEXTAREA") return;
        deleteIndividual(selectedId);
      }
      if (e.key === "Escape") setActiveTool("select");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, deleteIndividual, selectedId, setActiveTool]);
}
