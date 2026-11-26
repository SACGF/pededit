import { useState } from "react";
import type { Individual, ReproductiveRole } from "@pedigree-editor/layout-engine";
import { usePedigreeFields } from "@/store/usePedigreeStore";
import { REPRODUCTIVE_ROLE_OPTIONS, geneticParents, symbolLetter } from "@/pedigree/assisted";
import { assistedCandidates, reproductiveRoleProblem } from "@/pedigree/assistedEdits";
import { personLabel } from "@/pedigree/personLabel";
import { parentCoupleOf } from "@/pedigree/graph";
import { Field, Hint, OptionSelect, SELECT, type ProblemsOn } from "./fields";

/**
 * Assisted reproduction: the letter in this person's symbol, and for
 * a child, who carried them and who are their social parents. Donors and
 * surrogates are added from the more menu.
 */
export function AssistedForm({ individual, problemsOn }: { individual: Individual; problemsOn: ProblemsOn }) {
  const { pedigree, setReproductiveRole, setCarriedBy, setSocialParents } = usePedigreeFields("pedigree", "setReproductiveRole", "setCarriedBy", "setSocialParents");
  const candidates = assistedCandidates(pedigree, individual.id);
  const label = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    const letter = ind && symbolLetter(ind);
    return ind?.name?.trim() || (letter ? `${letter === "D" ? "Donor" : "Surrogate"} (${ind!.sex})` : personLabel(pedigree, id, "unnamed", { start: true }));
  };
  const hasParents = geneticParents(pedigree, individual.id).length > 0;
  const donorConceived = !!parentCoupleOf(pedigree, individual.id)?.donorConception;
  const linked = !!individual.carriedBy || !!individual.socialParents?.length || donorConceived;
  const [expanded, setExpanded] = useState(false);
  const social = individual.socialParents ?? [];
  const carriers = candidates.filter(c => c.sex !== "male" || c.id === individual.carriedBy);
  // An egg donor who also carried the child is a genetic parent, so not a candidate: keep her shown.
  const carrierInd = pedigree.individuals.find(i => i.id === individual.carriedBy);
  if (carrierInd && !carriers.some(c => c.id === carrierInd.id)) carriers.unshift(carrierInd);
  const addable = candidates.filter(c => !social.includes(c.id) && c.id !== individual.carriedBy);
  return (
    <div className="space-y-2" data-testid="assisted-form">
      <Field inline label="Donor / surrogate" {...problemsOn("reproductiveRole")}>
        <OptionSelect<ReproductiveRole>
          label="Donor or surrogate"
          value={individual.reproductiveRole}
          options={REPRODUCTIVE_ROLE_OPTIONS.map(o => {
            // A man cannot be a surrogate; one recorded as such (an import) keeps the option to show it.
            const refused = o.value !== individual.reproductiveRole && !!reproductiveRoleProblem(pedigree, individual.id, o.value);
            return { value: o.value, label: `${o.label}${refused ? ", not for a male" : ""}`, disabled: refused };
          })}
          onChange={v => setReproductiveRole(individual.id, v)}
        />
      </Field>
      {hasParents && !linked && !expanded && (
        <button className="pl-20 text-[11px] text-left text-gray-500 underline hover:text-black" onClick={() => setExpanded(true)}>
          Carried by, social parents...
        </button>
      )}
      {(linked || expanded) && (
        <>
          <Field inline label="Carried by" {...problemsOn("carriedBy")}>
            <OptionSelect
              label="Carried by"
              none="The genetic mother"
              value={individual.carriedBy}
              options={carriers.map(c => ({ value: c.id, label: label(c.id) }))}
              onChange={v => setCarriedBy(individual.id, v)}
            />
            {individual.carriedBy && (
              <Hint>Solid line from her: she carried the pregnancy but is not the genetic mother, so not a parent for kinship.</Hint>
            )}
          </Field>
          <Field inline label="Social parents">
            {social.map(id => (
              <div key={id} className="flex items-center justify-between text-xs text-gray-600">
                <span className="truncate">{label(id)}</span>
                <button
                  className="px-1 text-gray-400 hover:text-black"
                  aria-label={`Remove ${label(id)} as social parent`}
                  onClick={() => setSocialParents(individual.id, social.filter(x => x !== id))}
                >
                  ×
                </button>
              </div>
            ))}
            {addable.length > 0 && (
              <select
                value=""
                aria-label="Add social parent"
                onChange={e => e.target.value && setSocialParents(individual.id, [...social, e.target.value])}
                className={`${SELECT} text-gray-500`}
              >
                <option value="">Add...</option>
                {addable.map(c => <option key={c.id} value={c.id}>{label(c.id)}</option>)}
              </select>
            )}
            {social.length > 0 && (
              <Hint>Dashed line: a parent who is not a genetic parent, such as the intended father with donor sperm.</Hint>
            )}
          </Field>
        </>
      )}
    </div>
  );
}
