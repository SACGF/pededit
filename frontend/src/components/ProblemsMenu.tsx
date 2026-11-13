import { useEffect, useRef, useState } from "react";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { adjacentProblem, problemsOf, problemSubject, problemTarget, type Problem } from "../pedigree/validation";
import { pedigreeNumbers } from "../pedigree/layoutToFlow";
import { ProblemFixes } from "./ProblemFixes";

/** The problem gone to last, by the list or the keyboard, and where it was in the list. */
let lastProblem: { id: string; index: number } | null = null;

/**
 * Select the person a problem is about and focus its field in the edit
 * panel (#116). The panel renders after the selection changes, so this
 * waits a few frames for the field to appear.
 */
export function focusProblem(problem: Problem): void {
  const store = usePedigreeStore.getState();
  const target = problemTarget(store.pedigree, problem);
  if (!target) return;
  lastProblem = { id: problem.id, index: Math.max(0, problemsOf(store.pedigree).all.findIndex(p => p.id === problem.id)) };
  store.setSelectedId(target);
  if (typeof document === "undefined") return;
  // No field to focus: leave the last one, which now belongs to someone else.
  if (!problem.field) { (document.activeElement as HTMLElement | null)?.blur?.(); return; }
  const selector = `[data-problem-for="${CSS.escape(target)}"][data-problem-field="${problem.field}"]`;
  let tries = 0;
  const look = () => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) { if (++tries < 30) requestAnimationFrame(look); return; }
    el.scrollIntoView({ block: "center" });
    el.querySelector<HTMLElement>("input:not([type=checkbox]), select, textarea, button")?.focus();
  };
  requestAnimationFrame(look);
}

/**
 * Go to the next (1) or previous (-1) problem from the keyboard (F8 and
 * Shift+F8, #116), selecting the person and focusing the field, so the
 * list can be worked through in the edit panel. False when there are none.
 */
export function stepProblem(dir: 1 | -1): boolean {
  const { pedigree, selectedId } = usePedigreeStore.getState();
  const next = adjacentProblem(pedigree, problemsOf(pedigree).all, lastProblem, dir, selectedId);
  if (!next) return false;
  focusProblem(next);
  return true;
}

/** Forget the problem gone to last (tests, and a new pedigree). */
export function resetProblemStep(): void {
  lastProblem = null;
}

/** A warning sign: a hollow circle with "!" for a warning, filled for an error. Black and white, like the canvas marker. */
export function ProblemIcon({ severity, size = 12 }: { severity: Problem["severity"]; size?: number }) {
  const error = severity === "error";
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <circle cx="6" cy="6" r="5.25" fill={error ? "black" : "white"} stroke="black" strokeWidth="1.2" />
      <rect x="5.35" y="2.6" width="1.3" height="4.4" fill={error ? "white" : "black"} />
      <rect x="5.35" y="8.1" width="1.3" height="1.3" fill={error ? "white" : "black"} />
    </svg>
  );
}

/**
 * The toolbar's problems count and list (#116). Hidden while there are none,
 * so a clean pedigree shows nothing. Clicking an item selects the person and
 * focuses the field.
 */
export function ProblemsMenu() {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const setHighlight = usePedigreeStore(s => s.setProblemHighlightId);
  const [open, setOpen] = useState(false);
  // After picking an item, focus goes to the field, not back to this button.
  const picked = useRef(false);
  const { all, errors } = problemsOf(pedigree);
  // The canvas outline follows the hovered item; none once the list closes or empties.
  useEffect(() => { if (!open || all.length === 0) setHighlight(null); }, [open, all.length, setHighlight]);
  if (all.length === 0) return null;
  const label = `${all.length} ${all.length === 1 ? "problem" : "problems"}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost" size="sm"
          className="h-7 px-2 gap-1 text-xs"
          title="Things in this pedigree that look wrong or incomplete. They never stop you saving. F8 goes to the next, Shift+F8 the previous."
          data-testid="problems-menu"
        >
          <ProblemIcon severity={errors > 0 ? "error" : "warning"} />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1 max-h-[min(24rem,var(--radix-popover-content-available-height))] overflow-y-auto" side="bottom" align="end"
        onCloseAutoFocus={e => { if (picked.current) { e.preventDefault(); picked.current = false; } }}
      >
        <ProblemList pedigree={pedigree} all={all} onPick={p => { picked.current = true; setOpen(false); focusProblem(p); }} />
        <p className="px-2 pt-1 pb-0.5 text-[10px] text-gray-500 border-t mt-1">F8 next problem, Shift+F8 previous.</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The list itself: who (pedigree number and name), the message and its
 * fixes. Hovering or focusing an item outlines the person on the canvas.
 */
function ProblemList({ pedigree, all, onPick }: { pedigree: Pedigree; all: Problem[]; onPick: (p: Problem) => void }) {
  const setHighlight = usePedigreeStore(s => s.setProblemHighlightId);
  const numbers = pedigreeNumbers(pedigree);
  return (
    <ul data-testid="problems-list" onMouseLeave={() => setHighlight(null)}>
      {all.map(p => {
        const target = problemTarget(pedigree, p) ?? null;
        return (
          <li
            key={p.id}
            data-problem-item={p.id}
            className="rounded-sm hover:bg-gray-100 px-2 py-1 flex gap-2 items-start"
            onMouseEnter={() => setHighlight(target)}
            onFocus={() => setHighlight(target)}
          >
            <span className="mt-0.5"><ProblemIcon severity={p.severity} /></span>
            <span className="text-xs min-w-0">
              <button type="button" data-problem-id={p.id} onClick={() => onPick(p)} className="text-left w-full">
                <span className="font-medium" data-problem-subject>{problemSubject(pedigree, p, numbers)}</span>
                <span className="block text-gray-600">{p.message}</span>
              </button>
              <span className="block text-gray-600"><ProblemFixes problem={p} all={all} /></span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
