import { useState } from "react";
import type { Individual, Pedigree, Zygosity } from "@pedigree-editor/layout-engine";
import { usePedigreeFields } from "@/store/usePedigreeStore";
import { ZYGOSITY_OPTIONS, adjacentSibling, twinSetOf, twinSetProblem } from "@/pedigree/twins";
import { childrenOf, parentCoupleOf } from "@/pedigree/graph";
import { CheckboxRow, Field, Hint, OptionSelect } from "./fields";

/** Name or a short description of a sibling, for the twins checkboxes. */
function siblingLabel(pedigree: Pedigree, id: string): string {
  const ind = pedigree.individuals.find(i => i.id === id);
  const name = ind?.name?.trim();
  if (name) return name;
  const sex = ind?.sex === "male" ? "Brother" : ind?.sex === "female" ? "Sister" : "Sibling";
  const couple = parentCoupleOf(pedigree, id);
  const sibs = couple ? childrenOf(pedigree, couple.id) : [];
  return `${sex} ${sibs.indexOf(id) + 1}`;
}

/**
 * Twins: zygosity for the selected person's twin set and which
 * siblings are in it. Choosing a zygosity when the person is not a twin yet
 * pairs them with the sibling drawn next to them.
 */
export function TwinsForm({ individual }: { individual: Individual }) {
  const { pedigree, setTwins, removeTwin } = usePedigreeFields("pedigree", "setTwins", "removeTwin");
  const [problem, setProblem] = useState<string | null>(null);
  const partnership = parentCoupleOf(pedigree, individual.id);
  const siblings = partnership ? childrenOf(pedigree, partnership.id).filter(id => id !== individual.id) : [];
  if (!partnership || siblings.length === 0) return null;

  const twin = twinSetOf(pedigree, individual.id);
  const members = twin?.set.members ?? [];

  const apply = (zygosity: Zygosity | "", nextMembers: string[]) => {
    if (zygosity === "") { removeTwin(individual.id); setProblem(null); return; }
    const chosen = [individual.id, ...nextMembers.filter(m => m !== individual.id)];
    setProblem(setTwins(partnership.id, chosen, zygosity));
  };

  return (
    <div className="space-y-1" data-testid="twins-form">
      <Field inline label="Twin">
        <OptionSelect<Zygosity>
          label="Zygosity"
          none="Not a twin"
          value={twin?.set.zygosity}
          options={ZYGOSITY_OPTIONS.map(o => {
            const next = members.length >= 2 ? members : [individual.id, adjacentSibling(pedigree, individual.id)!];
            const why = twinSetProblem(pedigree, partnership.id, next, o.value);
            return { ...o, disabled: !!why, title: why ?? undefined };
          })}
          onChange={z => {
            const next = members.length >= 2 ? members : [adjacentSibling(pedigree, individual.id)!];
            apply(z ?? "", next);
          }}
        />
      </Field>
      {twin && (
        <div className="space-y-1 pl-20">
          <div className="text-xs text-gray-600">Twin of</div>
          {siblings.map(id => (
            <CheckboxRow
              key={id}
              label={siblingLabel(pedigree, id)}
              ariaLabel={`Twin of ${siblingLabel(pedigree, id)}`}
              checked={members.includes(id)}
              onChange={on => apply(twin.set.zygosity, on ? [...members, id] : members.filter(m => m !== id))}
              className="flex items-center gap-2 text-xs cursor-pointer"
            />
          ))}
          {twin.set.zygosity === "monozygotic" && (
            <Hint>Changing the sex of one monozygotic twin changes all of them.</Hint>
          )}
        </div>
      )}
      {problem && <p className="text-[10px] text-red-600" role="alert">{problem}</p>}
    </div>
  );
}
