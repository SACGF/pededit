import { usePedigreeStore } from "../store/usePedigreeStore";
import { fixesOf, problemsLike, problemsOf, type Problem, type ProblemFix } from "../pedigree/validation";

/**
 * Apply `label`'s fix to every problem like `problem` (same rule, same fix
 * label), each through its own fix object, as one undo step (#116).
 */
export function fixAllLike(problem: Problem, label: string): number {
  const store = usePedigreeStore.getState();
  const like = problemsLike(problemsOf(store.pedigree).all, problem, label);
  store.groupEdits(() => { for (const { fix } of like) fix.apply(usePedigreeStore.getState()); });
  return like.length;
}

/**
 * A problem's one-click fixes as underlined links, and "Fix all N like
 * this" when the same fix applies to several problems (#116). The one place
 * fixes are drawn: the edit panel under a highlighted field and the
 * toolbar's problems list both use it, and every click goes through the
 * rule's own fix objects.
 */
export function ProblemFixes({ problem, all: given }: { problem: Problem; /** Every problem in the pedigree; worked out when not given. */ all?: Problem[] }) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const fixes = fixesOf(problem);
  if (fixes.length === 0) return null;
  const all = given ?? problemsOf(pedigree).all;
  const link = "underline underline-offset-2 hover:text-black";
  const fixAll = (f: ProblemFix, text: string) => {
    const n = problemsLike(all, problem, f.label).length;
    if (n < 2) return null;
    return (
      <>
        {" "}
        <button
          type="button"
          data-problem-fix-all={f.label}
          className={link}
          title={`${f.label}: all ${n} like this, as one undo step`}
          onClick={() => fixAllLike(problem, f.label)}
        >
          {text.replace("N", String(n))}
        </button>
      </>
    );
  };
  return (
    <span data-problem-fixes={problem.id}>
      {fixes.map((f, i) => (
        <span key={i}>
          {" "}
          <button
            type="button"
            data-problem-fix={f.label}
            className={link}
            onClick={() => f.apply(usePedigreeStore.getState())}
          >
            {f.label}
          </button>
          {fixes.length > 1 && fixAll(f, "(all N)")}
        </span>
      ))}
      {fixes.length === 1 && fixAll(fixes[0]!, "Fix all N like this")}
    </span>
  );
}
