import { useEffect } from "react";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { stepProblem } from "../components/ProblemsMenu";

/** Focus is in a text field, where letters and Delete are typing, not shortcuts. */
function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

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
      // A and D (#35): toggle affected / deceased on everyone selected, as one
      // undo step. Mixed selections are all marked; all marked are all cleared.
      const letter = e.key.toLowerCase();
      if ((letter === "a" || letter === "d") && !meta && !e.altKey && !e.repeat && selectedIds.length > 0 && !typing()) {
        const { pedigree, setAffectedMany, setDeceasedMany } = usePedigreeStore.getState();
        const wanted = new Set(selectedIds);
        const people = pedigree.individuals.filter(i => wanted.has(i.id));
        if (people.length > 0) {
          e.preventDefault();
          if (letter === "a") setAffectedMany(selectedIds, !people.every(i => i.affected));
          else setDeceasedMany(selectedIds, !people.every(i => i.deceased));
        }
      }
      // F8 / Shift+F8 (#116): next / previous problem, also while typing in the
      // field the last one focused, so the list can be worked through there.
      if (e.key === "F8" && !meta && !e.altKey && !picking) {
        if (stepProblem(e.shiftKey ? -1 : 1)) e.preventDefault();
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
