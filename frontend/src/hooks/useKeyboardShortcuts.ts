import { useEffect } from "react";
import { usePedigreeStore } from "../store/usePedigreeStore";

export function useKeyboardShortcuts() {
  const { undo, redo, deleteIndividual, deleteIndividuals, removeWithDescendants, removeWithAncestors, selectedIds, setSelectedId, setActiveTool, picking, cancelPicking } = usePedigreeStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        // Guard: don't delete when typing in an input
        if (document.activeElement?.tagName === "INPUT") return;
        if (document.activeElement?.tagName === "TEXTAREA") return;
        if (document.activeElement?.tagName === "SELECT") return;
        e.preventDefault();
        // Shift: with descendants; Alt: with ancestors (#34). Every selected person (#21).
        if (e.shiftKey) removeWithDescendants(selectedIds);
        else if (e.altKey) removeWithAncestors(selectedIds);
        else if (selectedIds.length === 1) deleteIndividual(selectedIds[0]!);
        else deleteIndividuals(selectedIds);
      }
      if (e.key === "Escape") {
        if (picking) cancelPicking();
        else setSelectedId(null);
        setActiveTool("select");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, deleteIndividual, deleteIndividuals, removeWithDescendants, removeWithAncestors, selectedIds, setSelectedId, setActiveTool, picking, cancelPicking]);
}
