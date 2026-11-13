import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { problemsOf, problemSubject, problemTarget, type Problem } from "../pedigree/validation";

/**
 * Select the person a problem is about and focus its field in the edit
 * panel (#116). The panel renders after the selection changes, so this
 * waits a few frames for the field to appear.
 */
export function focusProblem(problem: Problem): void {
  const store = usePedigreeStore.getState();
  const target = problemTarget(store.pedigree, problem);
  if (!target) return;
  store.setSelectedId(target);
  if (!problem.field) return;
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
  const [open, setOpen] = useState(false);
  // After picking an item, focus goes to the field, not back to this button.
  const picked = useRef(false);
  const { all, errors } = problemsOf(pedigree);
  if (all.length === 0) return null;
  const label = `${all.length} ${all.length === 1 ? "problem" : "problems"}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost" size="sm"
          className="h-7 px-2 gap-1 text-xs"
          title="Things in this pedigree that look wrong or incomplete. They never stop you saving."
          data-testid="problems-menu"
        >
          <ProblemIcon severity={errors > 0 ? "error" : "warning"} />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1 max-h-[min(24rem,var(--radix-popover-content-available-height))] overflow-y-auto" side="bottom" align="end"
        onCloseAutoFocus={e => { if (picked.current) { e.preventDefault(); picked.current = false; } }}
      >
        <ul data-testid="problems-list">
          {all.map(p => (
            <li key={p.id}>
              <button
                type="button"
                data-problem-id={p.id}
                onClick={() => { picked.current = true; setOpen(false); focusProblem(p); }}
                className="w-full text-left px-2 py-1 rounded-sm hover:bg-gray-100 flex gap-2 items-start"
              >
                <span className="mt-0.5"><ProblemIcon severity={p.severity} /></span>
                <span className="text-xs">
                  <span className="font-medium">{problemSubject(pedigree, p)}</span>
                  <span className="block text-gray-600">{p.message}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
