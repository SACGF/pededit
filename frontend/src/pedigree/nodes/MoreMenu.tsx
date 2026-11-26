import { useState, type ReactNode } from "react";
import type { Sex } from "@pedigree-editor/layout-engine";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePedigreeStore, usePedigreeFields } from "../../store/usePedigreeStore";
import { LIFE_STATUS_LOCKED_TITLE, LIFE_STATUS_OPTIONS, NO_CHILDREN_TITLE, NO_PARTNER_TITLE, lifeStatusLocked } from "../lifeStatus";
import { probandTitle } from "../proband";
import { DELETE_TITLE, REMOVE_WITH_ANCESTORS_TITLE, REMOVE_WITH_DESCENDANTS_TITLE } from "../removal";
import { ADOPTION_OPTIONS } from "../adoption";
import { addDonorProblem, addSurrogateProblem } from "../assisted";
import { ZYGOSITY_OPTIONS, adjacentSibling, twinSetOf, twinSetProblem } from "../twins";
import { hasDescendants } from "../collapse";
import { batchSexProblem, carrierStatusOf } from "../batch";
import { CONDITION_NOT_RECORDED, affectedControlOn, conditionMode, conditionStateOf, conditionTags, soleCondition } from "../conditions";
import { coupleOfPair, personCouples } from "../partners";
import { hasParents, parentCoupleOf } from "../graph";
import { capitalised } from "../../utils/text";
import { ConditionItemLabel, MenuItem, MenuSection, MenuSwatch, menuAction, menuTags, menuTagsLabel } from "./menuParts";
import { CoupleMenuItems } from "./CoupleMenuItems";
import { AddChildrenPanel } from "./AddChildrenPanel";
import { BatchMenuItems, SelectionMenuSection } from "./BatchMenuItems";

interface MoreMenuProps {
  individualId: string;
  /**
   * Called whenever the menu closes. The menu is portalled, so after an item
   * removes it from under the cursor the hover pill gets no mouseleave; the
   * pill uses this to hide itself.
   */
  onClose?: () => void;
  /** The trigger's classes and content, in place of the pill's "···". */
  triggerClassName?: string;
  children?: ReactNode;
}

/**
 * Classes for a popover holding `MoreMenuItems` or `CoupleMenuItems`: never
 * taller than the room Radix finds on the chosen side, since the menu is
 * about 600px and must stay usable on a 1280x720 laptop.
 */
export const MENU_CONTENT_CLASS = "w-44 p-1 overflow-y-auto max-h-(--radix-popover-content-available-height)";

/** The "···" button in the hover pill and the menu it opens. */
export function MoreMenu({ individualId, onClose, triggerClassName, children }: MoreMenuProps) {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    onClose?.();
  }

  return (
    <Popover open={open} onOpenChange={(o) => { if (o) setOpen(true); else close(); }}>
      <PopoverTrigger asChild>
        <button
          title="More options"
          onClick={(e) => e.stopPropagation()}
          aria-label="More options"
          className={triggerClassName ?? "px-1.5 py-0.5 rounded-full text-[10px] leading-none hover:bg-gray-100 transition-colors pointer-coarse:px-2.5 pointer-coarse:py-2 pointer-coarse:text-xs"}
        >
          {children ?? "···"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={MENU_CONTENT_CLASS}
        side="bottom"
        align="end"
        collisionPadding={8}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreMenuItems individualId={individualId} onDone={close} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Everything the more menu offers for one person. The hover pill's "···"
 * and the right-click menu both show this list, so an item added here
 * appears in both. `onDone` closes whichever popover holds it.
 */
export function MoreMenuItems({ individualId, onDone }: { individualId: string; onDone: () => void }) {
  const [showAddChildren, setShowAddChildren] = useState(false);
  const { pedigree, selectedIds } = usePedigreeFields("pedigree", "selectedIds");
  // Actions never change, so they are read once rather than subscribed to.
  const {
    addPartner, addChildren, setAffected, setDeceased, setCarrier, setPresymptomatic, setProband, setConsultand,
    setFamilyHistoryUnknown, setSex, setLifeStatus, moveSibLeft, moveSibRight, deleteIndividual, unpinIndividual,
    setIndividualTag, setConditionStatus, setAdopted, addDonor, addSurrogate, setTwins, removeTwin,
    removeWithDescendants, removeWithAncestors, setDescendantsHidden, startPickingParents, startPickingPartner,
    startPickingDonor, startPickingSurrogate, detachFromParents,
  } = usePedigreeStore.getState();

  const individual = pedigree.individuals.find(i => i.id === individualId);
  if (!individual) return null;

  // Several selected, this person among them: the menu acts on all of
  // them, and only offers what applies to a group.
  const action = menuAction(onDone);

  if (selectedIds.length > 1 && selectedIds.includes(individualId)) {
    // The two partners of a couple: selecting both is another way to reach
    // what the couple line's menu offers.
    const couple = coupleOfPair(pedigree, selectedIds);
    return (
      <>
        <SelectionMenuSection individualId={individualId} action={action} />
        {couple && <CoupleMenuItems partnershipId={couple.id} onDone={onDone} />}
        <BatchMenuItems ids={selectedIds} action={action} />
      </>
    );
  }

  const isPinned = !!pedigree.pinnedPositions?.[individualId];
  const hasParentsAlready = hasParents(pedigree, individualId);
  // A gamete donation pair is not a relationship and has no couple line, so none of the couple items apply.
  const couples = personCouples(pedigree, individualId).filter(c => !c.donorPair);
  // Twins: the current set, or the sibling drawn next to this person to pair with.
  const twin = twinSetOf(pedigree, individualId);
  const twinPartnership = parentCoupleOf(pedigree, individualId);
  const twinMembers = twin?.set.members ?? [individualId, adjacentSibling(pedigree, individualId) ?? ""].filter(Boolean);
  const isLifeStatusLocked = lifeStatusLocked(pedigree, individual);

  // Partners may share a sex; a child's two genetic parents may not.
  const sexProblem = (sex: Sex) => individual.sex === sex ? null : batchSexProblem(pedigree, [individualId], sex);

  return (
      <>
        <SelectionMenuSection individualId={individualId} action={action} />
        <MenuSection label="Add">
          <MenuItem
            onClick={() => action(() => addPartner(individualId))}
            disabled={!!individual.lifeStatus}
            title={individual.lifeStatus ? NO_PARTNER_TITLE : undefined}
          >
            Add partner
          </MenuItem>
          {pedigree.individuals.length > 1 && (
            <MenuItem
              onClick={() => action(() => startPickingPartner(individualId))}
              disabled={!!individual.lifeStatus}
              title={individual.lifeStatus
                ? NO_PARTNER_TITLE
                : "Click someone already on the tree to make them this person's partner, for example a relative"}
            >
              Add existing partner...
            </MenuItem>
          )}
          <MenuItem
            onClick={() => setShowAddChildren(v => !v)}
            active={showAddChildren}
            disabled={!!individual.lifeStatus}
            title={individual.lifeStatus ? NO_CHILDREN_TITLE : undefined}
          >
            Add children...
          </MenuItem>
          {showAddChildren && !individual.lifeStatus && (
            <AddChildrenPanel
              individualId={individualId}
              onAdd={(sex, count, partnershipId) => action(() => addChildren(individualId, count, sex, partnershipId))}
            />
          )}
          <MenuItem
            onClick={() => action(() => startPickingParents(individualId))}
            title={hasParentsAlready ? "Click existing people on the canvas to replace the current parents" : "Click one or two existing people on the canvas to be the parents"}
          >
            {hasParentsAlready ? "Replace parents..." : "Set parents..."}
          </MenuItem>
          {hasParentsAlready && (
            <MenuItem
              onClick={() => action(() => detachFromParents(individualId))}
              title="Take this person out of their parents' sibship: they become a founder, and the parents stay"
            >
              Detach from parents
            </MenuItem>
          )}
        </MenuSection>

        <MenuSection label="Sibling order">
          <div className="flex">
            <MenuItem onClick={() => action(() => moveSibLeft(individualId))}>
              Move left
            </MenuItem>
            <MenuItem onClick={() => action(() => moveSibRight(individualId))}>
              Move right
            </MenuItem>
          </div>
        </MenuSection>

        <MenuSection label="Status">
          <MenuItem onClick={() => action(() => setAffected(individualId, !affectedControlOn(individual, pedigree)))}>
            {affectedControlOn(individual, pedigree) ? "Mark unaffected" : "Mark affected"}
          </MenuItem>
          <MenuItem onClick={() => action(() => setDeceased(individualId, !individual.deceased))}>
            {individual.deceased ? "Mark living" : "Mark deceased"}
          </MenuItem>
          {/* With one condition, carrier is a carrier of it; with several, a plain flag the Conditions section replaces. */}
          {(() => {
            const isCarrierNow = carrierStatusOf(individual, pedigree) === "carrier";
            const sole = soleCondition(pedigree);
            const what = sole ? `carrier of ${sole.label}` : conditionMode(pedigree) === "per-condition" ? `carrier ${CONDITION_NOT_RECORDED}` : "carrier";
            if (conditionMode(pedigree) === "per-condition" && !individual.carrier) return null;
            return (
              <MenuItem onClick={() => action(() => setCarrier(individualId, !isCarrierNow))}>
                {isCarrierNow ? `Unmark ${what}` : `Mark ${what}`}
              </MenuItem>
            );
          })()}
          <MenuItem
            onClick={() => action(() => setPresymptomatic(individualId, !individual.presymptomatic))}
            title="Clinically unaffected now but may develop the condition: a vertical line through the symbol (NSGC)"
            checked={!!individual.presymptomatic}
          >
            Presymptomatic carrier
          </MenuItem>
          <MenuItem onClick={() => action(() => setProband(individualId))} title={probandTitle(pedigree, individual)}>
            {individual.proband ? "Unmark proband" : "Mark as proband"}
          </MenuItem>
          <MenuItem
            onClick={() => action(() => setConsultand(individualId, !individual.consultand))}
            title="The person seeking counselling: an arrow without the P. A proband who is also the consultand keeps the P."
          >
            {individual.consultand ? "Unmark consultand" : "Mark as consultand"}
          </MenuItem>
          <MenuItem
            onClick={() => action(() => setFamilyHistoryUnknown(individualId, !individual.familyHistoryUnknown))}
            title="Draws a ? above the symbol (NSGC)"
            checked={!!individual.familyHistoryUnknown}
          >
            Family history not known
          </MenuItem>
        </MenuSection>

        {conditionMode(pedigree) === "per-condition" && (
          <MenuSection label="Conditions">
            {conditionTags(pedigree).flatMap(tag => {
              const state = conditionStateOf(individual, tag.id);
              return [
                <MenuItem
                  key={`${tag.id}-a`} checked={state === "affected"}
                  onClick={() => action(() => setConditionStatus(individualId, tag.id, state === "affected" ? "none" : "affected"))}
                >
                  <ConditionItemLabel tag={tag} pedigree={pedigree} text={`Affected with ${tag.label}`} />
                </MenuItem>,
                <MenuItem
                  key={`${tag.id}-c`} checked={state === "carrier"}
                  onClick={() => action(() => setConditionStatus(individualId, tag.id, state === "carrier" ? "none" : "carrier"))}
                >
                  <ConditionItemLabel tag={tag} pedigree={pedigree} carrier text={`Carrier of ${tag.label}`} />
                </MenuItem>,
              ];
            })}
          </MenuSection>
        )}

        {menuTags(pedigree).length > 0 && (
          <MenuSection label={menuTagsLabel(pedigree)}>
            {menuTags(pedigree).map(tag => {
              const on = individual.tags?.includes(tag.id) ?? false;
              return (
                <MenuItem
                  key={tag.id}
                  onClick={() => action(() => setIndividualTag(individualId, tag.id, !on))}
                  active={on}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <MenuSwatch tag={tag} pedigree={pedigree} />
                    {tag.label}
                    {on && <span className="text-gray-400">✓</span>}
                  </span>
                </MenuItem>
              );
            })}
          </MenuSection>
        )}

        <MenuSection label="Sex">
          <div className="flex">
          {(["male", "female", "unknown"] as const).map(sex => (
            <MenuItem
              key={sex}
              onClick={() => action(() => setSex(individualId, sex))}
              active={individual.sex === sex}
              disabled={!!sexProblem(sex)}
              title={sexProblem(sex) ?? undefined}
            >
              {capitalised(sex)}
            </MenuItem>
          ))}
          </div>
        </MenuSection>

        {twinPartnership && twinMembers.length >= 2 && (
          <MenuSection label="Twins">
            <MenuItem onClick={() => action(() => removeTwin(individualId))} active={!twin}>
              Not a twin
            </MenuItem>
            {ZYGOSITY_OPTIONS.map(o => {
              const why = twinSetProblem(pedigree, twinPartnership.id, twinMembers, o.value);
              return (
                <MenuItem
                  key={o.value}
                  onClick={() => action(() => setTwins(twinPartnership.id, twinMembers, o.value))}
                  active={twin?.set.zygosity === o.value}
                  disabled={!!why}
                  title={why ?? (twin ? undefined : "Pairs with the sibling drawn next to this person; pick others on the Person tab")}
                >
                  {o.label}
                </MenuItem>
              );
            })}
          </MenuSection>
        )}

        <MenuSection label="Adoption">
          <div className="flex">
            <MenuItem onClick={() => action(() => setAdopted(individualId, undefined))} active={!individual.adopted}>
              None
            </MenuItem>
            {ADOPTION_OPTIONS.map(o => (
              <MenuItem
                key={o.value}
                onClick={() => action(() => setAdopted(individualId, o.value))}
                active={individual.adopted === o.value}
              >
                {o.value === "in" ? "In" : "Out"}
              </MenuItem>
            ))}
          </div>
        </MenuSection>

        <MenuSection label="Assisted reproduction">
          {([["sperm", "Add sperm donor"], ["egg", "Add egg donor"]] as const).map(([gamete, text]) => {
            const why = addDonorProblem(pedigree, individualId, gamete);
            return (
              <div key={gamete}>
                <MenuItem
                  onClick={() => action(() => addDonor(individualId, gamete))}
                  disabled={!!why}
                  title={why ?? `This person was conceived with donor ${gamete}: the donor (D) becomes the genetic parent, and the parent they replace keeps a line to this person`}
                >
                  {text}
                </MenuItem>
                {pedigree.individuals.length > 1 && (
                  <MenuItem
                    onClick={() => action(() => startPickingDonor(individualId, gamete))}
                    disabled={!!why}
                    title={why ?? `Click someone already on the tree who gave the ${gamete}, for example a relative`}
                  >
                    Existing {gamete} donor...
                  </MenuItem>
                )}
              </div>
            );
          })}
          {(() => {
            const why = addSurrogateProblem(pedigree, individualId);
            return (
              <>
                <MenuItem
                  onClick={() => action(() => addSurrogate(individualId))}
                  disabled={!!why}
                  title={why ?? "A surrogate (S) carried this pregnancy: drawn with a solid line to this person, not a parent for kinship"}
                >
                  Add surrogate
                </MenuItem>
                {pedigree.individuals.length > 1 && (
                  <MenuItem
                    onClick={() => action(() => startPickingSurrogate(individualId))}
                    disabled={!!why}
                    title={why ?? "Click a woman already on the tree who carried this pregnancy, for example a relative"}
                  >
                    Existing surrogate...
                  </MenuItem>
                )}
              </>
            );
          })()}
        </MenuSection>

        <MenuSection label="Pregnancy / loss">
          <MenuItem
            onClick={() => action(() => setLifeStatus(individualId, undefined))}
            active={!individual.lifeStatus}
          >
            None
          </MenuItem>
          {LIFE_STATUS_OPTIONS.map(o => (
            <MenuItem
              key={o.value}
              onClick={() => action(() => setLifeStatus(individualId, o.value))}
              active={individual.lifeStatus === o.value}
              disabled={isLifeStatusLocked}
              title={isLifeStatusLocked ? LIFE_STATUS_LOCKED_TITLE : undefined}
            >
              {o.label}
            </MenuItem>
          ))}
        </MenuSection>

        {couples.map(c => (
          <CoupleMenuItems key={c.partnershipId} partnershipId={c.partnershipId} fromId={individualId} onDone={onDone} />
        ))}

        {(individual.descendantsHidden || hasDescendants(pedigree, individualId)) && (
          <div className="border-t mt-1 pt-1">
            <MenuItem
              onClick={() => action(() => setDescendantsHidden([individualId], !individual.descendantsHidden))}
              title={individual.descendantsHidden
                ? "Draw everyone below this person again"
                : "Leave everyone below this person out of the drawing and exports, without deleting them"}
            >
              {individual.descendantsHidden ? "Show descendants" : "Hide descendants"}
            </MenuItem>
          </div>
        )}

        <div className="border-t mt-1 pt-1">
          <MenuItem
            onClick={() => action(() => deleteIndividual(individualId))}
            destructive
            title={DELETE_TITLE}
          >
            Delete
          </MenuItem>
          <MenuItem
            onClick={() => action(() => removeWithDescendants([individualId]))}
            destructive
            title={REMOVE_WITH_DESCENDANTS_TITLE}
          >
            Remove with descendants
          </MenuItem>
          <MenuItem
            onClick={() => action(() => removeWithAncestors([individualId]))}
            destructive
            title={REMOVE_WITH_ANCESTORS_TITLE}
          >
            Remove with ancestors
          </MenuItem>
        </div>

        {isPinned && (
          <div className="border-t mt-1 pt-1">
            <MenuItem onClick={() => action(() => unpinIndividual(individualId))}>
              Unpin position
            </MenuItem>
          </div>
        )}
      </>
  );
}
