import { useEffect } from "react";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { stepProblem } from "../components/ProblemsMenu";
import { affectedControlOn } from "../pedigree/conditions";

/** Focus is in a text field, where letters and Delete are typing, not shortcuts. */
function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/**
 * The editor's keyboard shortcuts. The handler reads the store when a key
 * is pressed and subscribes to nothing, so the page that mounts it does
 * not re-render when the store changes.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const store = usePedigreeStore.getState();
      const { selectedIds, picking, pedigree } = store;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); store.undo(); }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); store.redo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0 && !typing()) {
        e.preventDefault();
        // Shift: with descendants; Alt: with ancestors. Every selected person.
        if (e.shiftKey) store.removeWithDescendants(selectedIds);
        else if (e.altKey) store.removeWithAncestors(selectedIds);
        else if (selectedIds.length === 1) store.deleteIndividual(selectedIds[0]!);
        else store.deleteIndividuals(selectedIds);
      }
      // A and D: toggle affected / deceased on everyone selected, as one
      // undo step. Mixed selections are all marked; all marked are all cleared.
      const letter = e.key.toLowerCase();
      if ((letter === "a" || letter === "d") && !meta && !e.altKey && !e.repeat && selectedIds.length > 0 && !typing()) {
        const wanted = new Set(selectedIds);
        const people = pedigree.individuals.filter(i => wanted.has(i.id));
        if (people.length > 0) {
          e.preventDefault();
          if (letter === "a") store.setAffectedMany(selectedIds, !people.every(i => affectedControlOn(i, pedigree)));
          else store.setDeceasedMany(selectedIds, !people.every(i => i.deceased));
        }
      }
      // F8 / Shift+F8: next / previous problem, also while typing in the
      // field the last one focused, so the list can be worked through there.
      if (e.key === "F8" && !meta && !e.altKey && !picking) {
        if (stepProblem(e.shiftKey ? -1 : 1)) e.preventDefault();
      }
      if (e.key === "Escape") {
        if (picking) store.cancelPicking();
        else store.setSelectedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
