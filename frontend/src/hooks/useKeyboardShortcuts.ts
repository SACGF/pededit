import { useEffect } from "react";
import { usePedigreeStore } from "../store/usePedigreeStore";

export function useKeyboardShortcuts() {
  const { undo, redo, deleteIndividual, removeWithDescendants, removeWithAncestors, selectedId, setActiveTool, picking, cancelPicking } = usePedigreeStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        // Guard: don't delete when typing in an input
        if (document.activeElement?.tagName === "INPUT") return;
        if (document.activeElement?.tagName === "TEXTAREA") return;
        if (document.activeElement?.tagName === "SELECT") return;
        e.preventDefault();
        // Shift: with descendants; Alt: with ancestors (#34).
        if (e.shiftKey) removeWithDescendants([selectedId]);
        else if (e.altKey) removeWithAncestors([selectedId]);
        else deleteIndividual(selectedId);
      }
      if (e.key === "Escape") { if (picking) cancelPicking(); setActiveTool("select"); }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, deleteIndividual, removeWithDescendants, removeWithAncestors, selectedId, setActiveTool, picking, cancelPicking]);
}
