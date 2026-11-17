import type { Individual, Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tags } from "lucide-react";
import { SectionHeader, TagSwatchSvg } from "./Legend";
import { CONDITIONS_AND_TAGS, conditionStateOf, conditionTags, isConditionTag, type ConditionState } from "@/pedigree/conditions";
import { pedigreeTags } from "@/pedigree/tags";
import { collapseInfo } from "@/pedigree/collapse";

interface ConditionsAndTagsProps {
  pedigree: Pedigree;
  individual: Individual;
  onConditionState: (tagId: string, state: ConditionState) => void;
  onToggleTag: (tagId: string, on: boolean) => void;
  /** Age of onset of a condition the person is affected with. */
  onSetTagOnset: (tagId: string, value: string) => void;
  onManageTags?: () => void;
}

/**
 * One person's conditions and tags on the Person tab, the only place
 * the panel records a condition, whatever the number of conditions: each
 * condition (`isConditionTag`) has a No / Affected / Carrier select, every
 * other tag (traits, dots, text) a checkbox. Conditions come first, then the
 * rest, each in pedigree order. The swatches are those of the key, a
 * carrier's in the carrier pattern, so the rows are this person's key and the
 * full legend lives only on the Pedigree tab.
 */
export function ConditionsAndTags({ pedigree, individual, onConditionState, onToggleTag, onSetTagOnset, onManageTags }: ConditionsAndTagsProps) {
  // Swatch geometry follows the conditions in use on the drawn chart, as the legend's does.
  const { drawn } = collapseInfo(pedigree);
  const conditions = conditionTags(pedigree);
  const others = pedigreeTags(pedigree).filter(t => !isConditionTag(t));

  const manage = onManageTags && (
    <Button
      variant="outline" size="sm"
      className="h-6 px-1.5 gap-1 text-[11px]"
      title="Define conditions and tags for this pedigree"
      onClick={onManageTags}
    >
      <Tags size={11} />
      Add / edit
    </Button>
  );

  // Names wrap rather than truncate, since the select leaves them little room.
  const swatch = (tag: Tag, carrier = false) => (
    <div className="flex items-center justify-center w-10 h-7 shrink-0">
      <TagSwatchSvg tag={tag} pedigree={drawn} carrier={carrier} />
    </div>
  );

  return (
    <div className="border-t pt-3 space-y-1" data-testid="conditions-and-tags">
      <SectionHeader action={manage}>{CONDITIONS_AND_TAGS}</SectionHeader>
      {conditions.length + others.length === 0 && (
        <p className="text-[10px] text-gray-400">None defined for this pedigree yet.</p>
      )}
      {conditions.map(tag => {
        const state = conditionStateOf(individual, tag.id);
        return (
          <div key={tag.id} data-condition-row={tag.id}>
            <div className="flex items-center gap-1.5 min-w-0">
              {swatch(tag, state === "carrier")}
              <span className="flex-1 min-w-0 text-xs leading-tight text-gray-800 break-words">{tag.label}</span>
              <select
                value={state}
                aria-label={`${tag.label} status`}
                onChange={e => onConditionState(tag.id, e.target.value as ConditionState)}
                className="w-[5.25rem] shrink-0 h-6 border rounded px-1 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
              >
                <option value="none">No</option>
                <option value="affected">Affected</option>
                <option value="carrier">Carrier</option>
              </select>
            </div>
            {state === "affected" && (
              <div className="flex items-center gap-2 pl-[2.875rem] pb-1 text-xs text-gray-600">
                <span className="shrink-0">Age of onset</span>
                <Input
                  value={individual.tagOnset?.[tag.id] ?? ""}
                  aria-label={`Age of onset of ${tag.label}`}
                  onChange={e => onSetTagOnset(tag.id, e.target.value)}
                  className="h-6 text-xs"
                  placeholder="e.g. 45y"
                />
              </div>
            )}
          </div>
        );
      })}
      {others.map(tag => (
        // Swatch, name, control, as the condition rows, so the swatches line up as a key.
        <label key={tag.id} className="flex items-center gap-1.5 cursor-pointer min-w-0" data-tag-row={tag.id}>
          {swatch(tag)}
          <span className="flex-1 min-w-0 text-xs leading-tight text-gray-800 break-words">{tag.label}</span>
          <input
            type="checkbox"
            checked={individual.tags?.includes(tag.id) ?? false}
            aria-label={tag.label}
            onChange={e => onToggleTag(tag.id, e.target.checked)}
            className="accent-black shrink-0 mr-1"
          />
        </label>
      ))}
    </div>
  );
}
