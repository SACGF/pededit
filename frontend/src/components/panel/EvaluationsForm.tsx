import { useState } from "react";
import type { Evaluation, EvaluationResult, Individual } from "@pedigree-editor/layout-engine";
import { usePedigreeFields } from "@/store/usePedigreeStore";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/Legend";
import { EVALUATION_RESULT_OPTIONS, evaluationsOf } from "@/pedigree/evaluation";
import { CheckboxRow, OptionSelect, ProblemHighlight, type ProblemProps } from "./fields";

/**
 * Evaluations and test results (NSGC): each drawn under the symbol as
 * "detail +" (NSGC 2022, no "E"); a documented one
 * adds a "*" at the symbol's lower right.
 *
 * "Add evaluation" opens a draft row that lives only here until something is
 * entered, so a row just added and not yet typed into is not saved empty and
 * does not raise the empty evaluation warning. Keyed by person at the
 * call site, so the draft goes when the selection changes.
 */
export function EvaluationsForm({ individual, problems }: { individual: Individual; problems: ProblemProps }) {
  const { setEvaluations } = usePedigreeFields("setEvaluations");
  const [draft, setDraft] = useState(false);
  const saved = evaluationsOf(individual);
  const evs: Evaluation[] = draft ? [...saved, {}] : saved;
  const change = (i: number, patch: Partial<Evaluation>) => {
    const next: Evaluation = { ...evs[i], ...patch };
    if (!next.result) delete next.result;
    if (!next.detail) delete next.detail;
    if (!next.documented) delete next.documented;
    if (i === saved.length) {
      // The draft row: saved once it holds something, and then it is an ordinary row.
      if (Object.keys(next).length === 0) return;
      setDraft(false);
      setEvaluations(individual.id, [...saved, next]);
      return;
    }
    setEvaluations(individual.id, saved.map((e, k) => (k === i ? next : e)));
  };
  const remove = (i: number) => {
    if (i === saved.length) setDraft(false);
    else setEvaluations(individual.id, saved.filter((_, k) => k !== i));
  };
  return (
    <div className={`border-t pt-3 ${evs.length ? "space-y-2" : ""}`} data-testid="evaluations-form">
      <SectionHeader action={
        <button
          type="button"
          data-testid="add-evaluation"
          onClick={() => setDraft(true)}
          disabled={draft}
          className="text-xs text-gray-600 underline hover:text-black disabled:text-gray-300 disabled:no-underline"
        >
          Add
        </button>
      }>Evaluations</SectionHeader>
      <ProblemHighlight {...problems}>
      {evs.map((ev, i) => (
        <div key={i} className="space-y-1" data-evaluation-row={i}>
          <div className="flex items-center gap-1 text-xs">
            <OptionSelect<EvaluationResult>
              label={`Evaluation ${i + 1} result`}
              none="No result"
              value={ev.result}
              options={EVALUATION_RESULT_OPTIONS}
              onChange={result => change(i, { result })}
              className="flex-1 min-w-0 h-6 border rounded px-1 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
            />
            <button
              type="button"
              aria-label={`Remove evaluation ${i + 1}`}
              title="Remove this evaluation"
              onClick={() => remove(i)}
              className="px-1 text-gray-500 hover:text-black"
            >
              ×
            </button>
          </div>
          <Input
            value={ev.detail ?? ""}
            aria-label={`Evaluation ${i + 1} detail`}
            onChange={e => change(i, { detail: e.target.value })}
            className="h-6 text-xs"
            placeholder="e.g. BRCA1 c.5266dupC, echo"
          />
          <CheckboxRow
            label="Documented (*)"
            ariaLabel={`Evaluation ${i + 1} documented`}
            title="Documented: examined by your team, or an outside result reviewed and verified. Draws a * at the symbol's lower right (NSGC)."
            checked={!!ev.documented}
            onChange={documented => change(i, { documented })}
            className="flex items-center gap-1 cursor-pointer text-xs"
          />
        </div>
      ))}
      </ProblemHighlight>
    </div>
  );
}
