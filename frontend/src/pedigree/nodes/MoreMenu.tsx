import { useEffect, useRef, useState } from "react";
import type { Pedigree, Sex, Tag } from "@pedigree-editor/layout-engine";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePedigreeStore, hasPartnerOrChild, MAX_ADD_CHILDREN } from "../../store/usePedigreeStore";
import { LIFE_STATUS_OPTIONS } from "../lifeStatus";
import { CHILDLESS_OPTIONS } from "../childless";
import { ADOPTION_OPTIONS } from "../adoption";
import { addDonorProblem, addSurrogateProblem } from "../assisted";
import { ZYGOSITY_OPTIONS, parentPartnershipOf, twinSetOf, twinSetProblem } from "../twins";
import { adjacentSibling } from "../../components/EditPanel";
import { batchLockState, batchCollapseState } from "../selection";
import { coupleConsanguinity } from "../consanguinity";
import { namedCoupleRelationship } from "../consanguinityLabel";
import { hasDescendants } from "../collapse";
import { batchStatus, batchSexProblem, carrierStatusOf } from "../batch";
import { CONDITION_NOT_RECORDED, affectedControlOn, isConditionTag, conditionMode, conditionStateOf, conditionTags, soleCondition } from "../conditions";
import { donorPairFor, sameSexCouple } from "../sameSex";

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_ADD_CHILDREN, Math.max(1, Math.floor(n)));
}

interface MoreMenuProps {
  individualId: string;
  /**
   * Called whenever the menu closes. The menu is portalled, so after an item
   * removes it from under the cursor the hover pill gets no mouseleave; the
   * pill uses this to hide itself.
   */
  onClose?: () => void;
}

/**
 * Classes for a popover holding `MoreMenuItems` or `CoupleMenuItems`: never
 * taller than the room Radix finds on the chosen side, since the menu is
 * about 600px and must stay usable on a 1280x720 laptop.
 */
export const MENU_CONTENT_CLASS = "w-44 p-1 overflow-y-auto max-h-(--radix-popover-content-available-height)";

/** The "···" button in the hover pill and the menu it opens. */
export function MoreMenu({ individualId, onClose }: MoreMenuProps) {
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
          className="px-1.5 py-0.5 rounded-full text-[10px] leading-none hover:bg-gray-100 transition-colors"
        >
          ···
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
 * and the right-click menu (#95) both show this list, so an item added here
 * appears in both. `onDone` closes whichever popover holds it.
 */
export function MoreMenuItems({ individualId, onDone }: { individualId: string; onDone: () => void }) {
  const [showAddChildren, setShowAddChildren] = useState(false);
  const {
    pedigree,
    addPartner,
    addChildren,
    setAffected,
    setDeceased,
    setCarrier,
    setPresymptomatic,
    setProband,
    setConsultand,
    setFamilyHistoryUnknown,
    setSex,
    setLifeStatus,
    moveSibLeft,
    moveSibRight,
    deleteIndividual,
    setSelectedId,
    unpinIndividual,
    setIndividualTag,
    setConditionStatus,
    setPartnershipChildless,
    setPartnershipConsanguineous,
    setPartnershipEnded,
    swapPartnerSides,
    setAdopted,
    addDonor,
    addSurrogate,
    setTwins,
    removeTwin,
    removeWithDescendants,
    removeWithAncestors,
    setDescendantsHidden,
    startPickingParents,
    startPickingChild,
    startPickingPartner,
    startPickingDonor,
    startPickingSurrogate,
    detachFromParents,
    removePartnership,
  } = usePedigreeStore();
  const selectedIds = usePedigreeStore(s => s.selectedIds);

  const individual = pedigree.individuals.find(i => i.id === individualId);
  if (!individual) return null;

  // Several selected, this person among them (#35): the menu acts on all of
  // them, and only offers what applies to a group.
  if (selectedIds.length > 1 && selectedIds.includes(individualId)) {
    const act = (fn: () => void) => { fn(); onDone(); };
    return (
      <>
        <SelectionMenuSection individualId={individualId} action={act} />
        <BatchMenuItems ids={selectedIds} action={act} />
      </>
    );
  }

  const isPinned = !!pedigree.pinnedPositions?.[individualId];
  const hasParentsAlready = Object.values(pedigree.parentOf).some(kids => kids.includes(individualId));
  const ownPartnerships = partnerChoices(pedigree, individualId);
  // Gamete donation pairs (#45) have no couple line, so no line to mark.
  const couples = ownPartnerships.filter(c => !pedigree.partnerships.find(p => p.id === c.partnershipId)?.donorConception);
  // Twins (#11): the current set, or the sibling drawn next to this person to pair with.
  const twin = twinSetOf(pedigree, individualId);
  const twinPartnership = parentPartnershipOf(pedigree, individualId);
  const twinMembers = twin?.set.members ?? [individualId, adjacentSibling(pedigree, individualId) ?? ""].filter(Boolean);
  // Partnerships of this person with no children: the childless mark applies to these (#15).
  const childlessCouples = partnerChoices(pedigree, individualId)
    .filter(c => (pedigree.parentOf[c.partnershipId] ?? []).length === 0)
    .map(c => ({ ...c, status: pedigree.partnerships.find(p => p.id === c.partnershipId)?.childless }));
  // A pregnancy or pregnancy loss cannot have a partner or children, and vice versa.
  const isLifeStatusLocked = !individual.lifeStatus && hasPartnerOrChild(pedigree, individualId);

  // Partners may share a sex (#105); a child's two genetic parents may not.
  const sexProblem = (sex: Sex) => individual.sex === sex ? null : batchSexProblem(pedigree, [individualId], sex);

  function action(fn: () => void) {
    fn();
    onDone();
  }

  return (
      <>
        <SelectionMenuSection individualId={individualId} action={action} />
        <MenuSection label="Add">
          <MenuItem
            onClick={() => action(() => addPartner(individualId))}
            disabled={!!individual.lifeStatus}
            title={individual.lifeStatus ? "A pregnancy or pregnancy loss cannot have a partner" : undefined}
          >
            Add partner
          </MenuItem>
          {pedigree.individuals.length > 1 && (
            <MenuItem
              onClick={() => action(() => startPickingPartner(individualId))}
              disabled={!!individual.lifeStatus}
              title={individual.lifeStatus
                ? "A pregnancy or pregnancy loss cannot have a partner"
                : "Click someone already on the tree to make them this person's partner, for example a relative"}
            >
              Add existing partner...
            </MenuItem>
          )}
          <MenuItem
            onClick={() => setShowAddChildren(v => !v)}
            active={showAddChildren}
            disabled={!!individual.lifeStatus}
            title={individual.lifeStatus ? "A pregnancy or pregnancy loss cannot have children" : undefined}
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
          {ownPartnerships.length > 0 && !individual.lifeStatus && (
            <MenuItem
              onClick={() => action(() => startPickingChild(ownPartnerships[0]!.partnershipId, individualId))}
              title={ownPartnerships.length > 1
                ? `Click an existing person on the canvas to make them a child of this couple (with ${ownPartnerships[0]!.label}; use Set parents on the child for another partner)`
                : "Click an existing person on the canvas to make them a child of this couple"}
            >
              Add existing child...
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
          {/* With one condition, carrier is a carrier of it; with several, a plain flag the Conditions section replaces (#115). */}
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
          <MenuItem onClick={() => action(() => setProband(individualId))}>
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
                  <ConditionItemLabel tag={tag} text={`Affected with ${tag.label}`} on={state === "affected"} />
                </MenuItem>,
                <MenuItem
                  key={`${tag.id}-c`} checked={state === "carrier"}
                  onClick={() => action(() => setConditionStatus(individualId, tag.id, state === "carrier" ? "none" : "carrier"))}
                >
                  <ConditionItemLabel tag={tag} text={`Carrier of ${tag.label}`} on={state === "carrier"} />
                </MenuItem>,
              ];
            })}
          </MenuSection>
        )}

        {menuTags(pedigree).length > 0 && (
          <MenuSection label="Tags">
            {menuTags(pedigree).map(tag => {
              const on = individual.tags?.includes(tag.id) ?? false;
              return (
                <MenuItem
                  key={tag.id}
                  onClick={() => action(() => setIndividualTag(individualId, tag.id, !on))}
                  active={on}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 border border-black/20"
                      style={{ background: tag.color, borderRadius: tag.style === "dot" ? "50%" : 0 }}
                    />
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
              {sex.charAt(0).toUpperCase() + sex.slice(1)}
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
                  title={why ?? (twin ? undefined : "Pairs with the sibling drawn next to this person; pick others in the edit panel")}
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
              title={isLifeStatusLocked ? "Not available: this individual has a partner or children" : undefined}
            >
              {o.label}
            </MenuItem>
          ))}
        </MenuSection>

        {couples.length > 0 && (
          <MenuSection label="Consanguinity">
            {couples.map(c => (
              <ConsanguineousItem
                key={c.partnershipId}
                partnershipId={c.partnershipId}
                label={couples.length > 1 ? `Consanguineous with ${c.label}` : "Consanguineous"}
                onToggle={on => action(() => setPartnershipConsanguineous(c.partnershipId, on))}
              />
            ))}
          </MenuSection>
        )}

        {couples.length > 0 && (
          <MenuSection label="Relationship">
            {couples.map(c => {
              const ended = !!pedigree.partnerships.find(p => p.id === c.partnershipId)?.ended;
              return (
                <MenuItem
                  key={c.partnershipId}
                  onClick={() => action(() => setPartnershipEnded(c.partnershipId, !ended))}
                  active={ended}
                  checked={ended}
                  title={ENDED_TITLE}
                >
                  {couples.length > 1 ? `Ended with ${c.label}` : "Ended"}
                </MenuItem>
              );
            })}
            {couples.map(c => (
              <MenuItem
                key={`swap:${c.partnershipId}`}
                onClick={() => action(() => swapPartnerSides(c.partnershipId))}
                title={SWAP_SIDES_TITLE}
              >
                {couples.length > 1 ? `Swap sides with ${c.label}` : "Swap sides"}
              </MenuItem>
            ))}
          </MenuSection>
        )}

        {childlessCouples.length > 0 && (
          <MenuSection label="Couple without children">
            {childlessCouples.map(c => (
              <div key={c.partnershipId}>
                {childlessCouples.length > 1 && (
                  <div className="px-2 text-[10px] text-gray-500 truncate">With {c.label}</div>
                )}
                <MenuItem onClick={() => action(() => setPartnershipChildless(c.partnershipId, undefined))} active={!c.status}>
                  No mark
                </MenuItem>
                {CHILDLESS_OPTIONS.map(o => (
                  <MenuItem
                    key={o.value}
                    onClick={() => action(() => setPartnershipChildless(c.partnershipId, o.value))}
                    active={c.status === o.value}
                  >
                    {o.label}
                  </MenuItem>
                ))}
                <MenuItem
                  onClick={() => action(() => removePartnership(c.partnershipId))}
                  destructive
                  title={REMOVE_PARTNERSHIP_TITLE}
                >
                  Remove partnership
                </MenuItem>
              </div>
            ))}
          </MenuSection>
        )}

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
            onClick={() => action(() => { deleteIndividual(individualId); setSelectedId(null); })}
            destructive
            title="Delete (children stay, as founders)"
          >
            Delete
          </MenuItem>
          <MenuItem
            onClick={() => action(() => removeWithDescendants([individualId]))}
            destructive
            title="Shift+Delete. Also removes everyone below and partners who married in"
          >
            Remove with descendants
          </MenuItem>
          <MenuItem
            onClick={() => action(() => removeWithAncestors([individualId]))}
            destructive
            title="Alt+Delete. Also removes everyone above; descendants become founders"
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

/**
 * "Text above line..." for a couple with a double line (#97): opens a text
 * box in the menu, filled with the couple's text or else the relationship's
 * name. Enter or Apply sets it, an empty box clears it.
 */
function ConsanguinityLabelItem({ partnershipId, onDone }: { partnershipId: string; onDone: () => void }) {
  const { pedigree, setPartnershipConsanguinityLabel } = usePedigreeStore();
  const [value, setValue] = useState<string | null>(null);
  const state = coupleConsanguinity(pedigree, partnershipId);
  const partnership = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!state || !partnership || !(state.related || state.flagged)) return null;
  const apply = () => { setPartnershipConsanguinityLabel(partnershipId, (value ?? "").trim()); onDone(); };
  if (value === null) {
    return (
      <MenuItem
        onClick={() => setValue(partnership.consanguinityLabel ?? namedCoupleRelationship(pedigree, partnership) ?? "")}
        title="Write the degree of relationship above the double line, e.g. third cousins"
      >
        Text above line...
      </MenuItem>
    );
  }
  return (
    <div className="px-2 py-1 space-y-1" data-consanguinity-label-editor>
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") apply(); }}
        placeholder="e.g. third cousins"
        aria-label="Text above the double line"
        className="w-full h-6 border rounded px-1 text-xs focus:outline-hidden focus:ring-1 focus:ring-black"
      />
      <button type="button" onClick={apply} className="w-full text-xs border rounded py-0.5 hover:bg-gray-100">
        Apply
      </button>
    </div>
  );
}

const ENDED_TITLE = "Separated or divorced: two short strokes across the couple line";

/**
 * The consanguinity override for one couple (#92), as a toggle. A couple the
 * pedigree already shows to be related is ticked and disabled, as in the
 * edit panel: their line is double whatever the flag says.
 */
function ConsanguineousItem({ partnershipId, label, onToggle }: {
  partnershipId: string;
  label: string;
  onToggle: (on: boolean) => void;
}) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const state = coupleConsanguinity(pedigree, partnershipId);
  if (!state) return null;
  const on = state.related || state.flagged;
  return (
    <MenuItem
      onClick={() => onToggle(!state.flagged)}
      active={on}
      disabled={state.related}
      checked={on}
      title={state.related
        ? "The pedigree shows they are related, so the couple line is already double"
        : "Draws the couple line double, for a couple known to be related when the pedigree does not show how"}
    >
      {label}
    </MenuItem>
  );
}

/**
 * The right-click menu of a couple line (#95, #92): what the more menu offers
 * for one partnership, without the person items.
 */
export function CoupleMenuItems({ partnershipId, onDone }: { partnershipId: string; onDone: () => void }) {
  const { pedigree, setPartnershipChildless, setPartnershipConsanguineous, setPartnershipEnded, swapPartnerSides, startPickingChild, removePartnership } = usePedigreeStore();
  const partnership = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!partnership) return null;
  const nameOf = (id: string) => pedigree.individuals.find(i => i.id === id)?.name?.trim();
  const n1 = nameOf(partnership.individual1), n2 = nameOf(partnership.individual2);
  const childless = (pedigree.parentOf[partnershipId] ?? []).length === 0;
  const sameSex = !!sameSexCouple(pedigree, partnershipId);

  function action(fn: () => void) {
    fn();
    onDone();
  }

  return (
    <>
      <MenuSection label={n1 && n2 ? `${n1} and ${n2}` : "Couple"}>
        <ConsanguineousItem
          partnershipId={partnershipId}
          label="Consanguineous"
          onToggle={on => action(() => setPartnershipConsanguineous(partnershipId, on))}
        />
        <ConsanguinityLabelItem partnershipId={partnershipId} onDone={onDone} />
        <MenuItem
          onClick={() => action(() => setPartnershipEnded(partnershipId, !partnership.ended))}
          active={!!partnership.ended}
          checked={!!partnership.ended}
          title={ENDED_TITLE}
        >
          Relationship ended
        </MenuItem>
        <MenuItem onClick={() => action(() => swapPartnerSides(partnershipId))} title={SWAP_SIDES_TITLE}>
          Swap sides
        </MenuItem>
        {sameSex ? (
          <SameSexChildItems partnershipId={partnershipId} action={action} />
        ) : (
          <MenuItem
            onClick={() => action(() => startPickingChild(partnershipId))}
            title="Click an existing person on the canvas to make them a child of this couple"
          >
            Add existing child...
          </MenuItem>
        )}
        <MenuItem
          onClick={() => action(() => removePartnership(partnershipId))}
          destructive
          disabled={!childless}
          title={childless ? REMOVE_PARTNERSHIP_TITLE : "This couple has children: use Replace parents or Detach from parents on them first"}
        >
          Remove partnership
        </MenuItem>
      </MenuSection>
      {childless && (
        <MenuSection label="Couple without children">
          <MenuItem onClick={() => action(() => setPartnershipChildless(partnershipId, undefined))} active={!partnership.childless}>
            No mark
          </MenuItem>
          {CHILDLESS_OPTIONS.map(o => (
            <MenuItem
              key={o.value}
              onClick={() => action(() => setPartnershipChildless(partnershipId, o.value))}
              active={partnership.childless === o.value}
            >
              {o.label}
            </MenuItem>
          ))}
        </MenuSection>
      )}
    </>
  );
}

/**
 * "Add child..." on a same-sex couple's line (#105): partners of the same
 * sex have no genetic children together, so the menu asks which of them is
 * the genetic parent and the child gets a donor of the other sex (see
 * `applySameSexChildren`). Opposite-sex couples never see this.
 */
function SameSexChildItems({ partnershipId, action }: { partnershipId: string; action: (fn: () => void) => void }) {
  const { pedigree, addChildren, startPickingChild } = usePedigreeStore();
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<string | undefined>();
  const p = pedigree.partnerships.find(x => x.id === partnershipId)!;
  const ids = [p.individual1, p.individual2];
  const nameOf = (id: string, k: number) => pedigree.individuals.find(i => i.id === id)?.name?.trim() || `Partner ${k + 1}`;
  const sex = pedigree.individuals.find(i => i.id === p.individual1)?.sex;
  const donorKind = sex === "female" ? "sperm donor" : "egg donor";
  const other = parent && ids.find(id => id !== parent);
  const pair = parent && other ? donorPairFor(pedigree, parent, other) : undefined;
  const donorText = pair ? `the same ${donorKind} as before` : `a new ${donorKind}`;
  const need = parent ? undefined : "Choose the genetic parent first";
  return (
    <>
      <MenuItem
        onClick={() => setOpen(v => !v)}
        active={open}
        title="Partners of the same sex have no genetic children together: choose which of them is the genetic parent, and a donor is added"
      >
        Add child...
      </MenuItem>
      {open && (
        <div className="pl-2" data-same-sex-child>
          <div className="px-2 pt-1 text-[10px] text-gray-400">Genetic parent</div>
          <div className="flex">
            {ids.map((id, k) => (
              <MenuItem key={id} onClick={() => setParent(id)} active={parent === id} checked={parent === id}>
                {nameOf(id, k)}
              </MenuItem>
            ))}
          </div>
          {parent && other && (
            <div className="px-2 py-1 text-[10px] text-gray-500 leading-tight">
              With {donorText}; {nameOf(other, ids.indexOf(other))} is a parent who is not genetic.
            </div>
          )}
          <MenuItem disabled={!parent} title={need} onClick={() => action(() => addChildren(parent!, 1, "male", partnershipId))}>
            Add son
          </MenuItem>
          <MenuItem disabled={!parent} title={need} onClick={() => action(() => addChildren(parent!, 1, "female", partnershipId))}>
            Add daughter
          </MenuItem>
          <MenuItem disabled={!parent} title={need} onClick={() => action(() => addChildren(parent!, 1, "unknown", partnershipId))}>
            Add child of unknown sex
          </MenuItem>
          <MenuItem
            disabled={!parent}
            title={need ?? "Click an existing person on the canvas to make them this child"}
            onClick={() => action(() => startPickingChild(partnershipId, parent))}
          >
            Existing child...
          </MenuItem>
        </div>
      )}
    </>
  );
}

const SWAP_SIDES_TITLE = "Draw the partners the other way round. Partner order is free under NSGC 2022; nobody is pinned";
const REMOVE_PARTNERSHIP_TITLE = "Remove the couple line, keeping both people (for a partner linked by mistake)";

/** Partners of individualId, one per partnership, in partnership order. */
function partnerChoices(pedigree: ReturnType<typeof usePedigreeStore.getState>["pedigree"], individualId: string) {
  return pedigree.partnerships
    .filter(p => p.individual1 === individualId || p.individual2 === individualId)
    .map((p, i) => {
      const otherId = p.individual1 === individualId ? p.individual2 : p.individual1;
      const other = pedigree.individuals.find(ind => ind.id === otherId);
      const name = other?.name?.trim();
      const sexLabel = other?.sex === "male" ? "male" : other?.sex === "female" ? "female" : "unknown sex";
      return { partnershipId: p.id, label: name || `Partner ${i + 1} (${sexLabel})` };
    });
}

/**
 * Count stepper, partner choice (when there are several) and the three add
 * buttons. The count is typed as text and clamped on blur or Enter, so typing
 * "4" after clearing the box gives 4, not 1 then 10.
 */
function AddChildrenPanel({ individualId, onAdd }: {
  individualId: string;
  onAdd: (sex: Sex, count: number, partnershipId: string | undefined) => void;
}) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const [count, setCount] = useState(2);
  const [draft, setDraft] = useState("2");
  const partners = partnerChoices(pedigree, individualId);
  const [partnershipId, setPartnershipId] = useState<string | undefined>(partners[0]?.partnershipId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { ref.current?.scrollIntoView?.({ block: "nearest" }); }, []);

  function commit(raw: string): number {
    const n = raw.trim() === "" ? count : clampCount(Number(raw));
    setCount(n);
    setDraft(String(n));
    return n;
  }
  function step(delta: number) {
    const n = clampCount(commit(draft) + delta);
    setCount(n);
    setDraft(String(n));
  }
  function add(sex: Sex) {
    onAdd(sex, commit(draft), partnershipId);
  }

  // What the buttons will add, read from the box as typed so they never lie.
  const shown = draft.trim() === "" ? count : clampCount(Number(draft));

  return (
    <div className="pl-2" ref={ref}>
      <div className="flex items-center gap-1 px-2 py-1">
        <span className="text-[10px] text-gray-400">Count</span>
        <button
          title="Fewer"
          onClick={() => step(-1)}
          className="w-5 h-5 border rounded text-xs leading-none hover:bg-gray-100"
        >
          -
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label="Number of children"
          value={draft}
          onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(draft); }}
          className="w-9 h-5 border rounded text-xs text-center"
        />
        <button
          title="More"
          onClick={() => step(1)}
          className="w-5 h-5 border rounded text-xs leading-none hover:bg-gray-100"
        >
          +
        </button>
      </div>
      {partners.length > 1 && (
        <label className="flex items-center gap-1 px-2 py-1">
          <span className="text-[10px] text-gray-400">With</span>
          <select
            aria-label="Other parent"
            value={partnershipId}
            onChange={e => setPartnershipId(e.target.value)}
            className="min-w-0 flex-1 h-5 border rounded text-xs bg-white"
          >
            {partners.map(p => (
              <option key={p.partnershipId} value={p.partnershipId}>{p.label}</option>
            ))}
          </select>
        </label>
      )}
      {sameSexCouple(pedigree, partnershipId) && (
        <div className="px-2 py-1 text-[10px] text-gray-500 leading-tight" data-same-sex-hint>
          Partners of the same sex: {shown === 1 ? "the child is" : "the children are"} this person's and a donor's.
        </div>
      )}
      <MenuItem onClick={() => add("male")}>
        Add {shown} {shown === 1 ? "son" : "sons"}
      </MenuItem>
      <MenuItem onClick={() => add("female")}>
        Add {shown} {shown === 1 ? "daughter" : "daughters"}
      </MenuItem>
      <MenuItem onClick={() => add("unknown")}>
        Add {shown} of unknown sex
      </MenuItem>
    </div>
  );
}

/**
 * Select with descendants, and with several selected (this person among
 * them) the batch unlock and lock (#21).
 */
function SelectionMenuSection({ individualId, action }: { individualId: string; action: (fn: () => void) => void }) {
  const { pedigree, selectedIds, selectDescendants, unlockIndividuals, lockIndividuals, startPickingRelatedness, setDescendantsHidden } = usePedigreeStore();
  const batch = selectedIds.length > 1 && selectedIds.includes(individualId);
  const { toUnlock, toLock } = batchLockState(pedigree, batch ? selectedIds : []);
  // Collapse a selection (#1): hide (or show) the descendants of every
  // selected person who has any.
  const { toHide, toShow } = batchCollapseState(pedigree, batch ? selectedIds : []);
  return (
    <MenuSection label={batch ? `${selectedIds.length} selected` : "Select"}>
      <MenuItem
        onClick={() => action(() => selectDescendants(individualId))}
        title="Select this person, everyone below them and the partners who married in, to move the branch together"
      >
        Select with descendants
      </MenuItem>
      {pedigree.individuals.length > 1 && (
        <MenuItem
          onClick={() => action(() => startPickingRelatedness(individualId))}
          title="Click another person to select the two and see their kinship and relationship"
        >
          Relatedness to...
        </MenuItem>
      )}
      {toUnlock.length > 0 && (
        <MenuItem onClick={() => action(() => unlockIndividuals(toUnlock))} title="Let the selected people be dragged">
          Unlock {toUnlock.length}
        </MenuItem>
      )}
      {toLock.length > 0 && (
        <MenuItem onClick={() => action(() => lockIndividuals(toLock))} title="Lock the selected people and drop their pinned positions">
          Lock {toLock.length} (return to auto layout)
        </MenuItem>
      )}
      {toHide.length > 0 && (
        <MenuItem
          onClick={() => action(() => setDescendantsHidden(toHide, true))}
          title="Leave everyone below the selected people out of the drawing and exports, without deleting them"
        >
          Hide descendants of {toHide.length}
        </MenuItem>
      )}
      {toShow.length > 0 && (
        <MenuItem onClick={() => action(() => setDescendantsHidden(toShow, false))} title="Draw everyone below the selected people again">
          Show descendants of {toShow.length}
        </MenuItem>
      )}
    </MenuSection>
  );
}

/**
 * The status items for a multiple selection (#35): each applies to every
 * selected person as one undo step, and is left out when it would change
 * nobody. Items that only make sense for one person (proband, add, twins,
 * sibling order, adoption, pregnancy, assisted reproduction, couples) are
 * not offered; click one person to get them.
 */
function BatchMenuItems({ ids, action }: { ids: string[]; action: (fn: () => void) => void }) {
  const {
    pedigree, setAffectedMany, setDeceasedMany, setCarrierStatusMany, setSexMany, setIndividualTagMany, setConditionStatusMany,
    deleteIndividuals, removeWithDescendants, removeWithAncestors,
  } = usePedigreeStore();
  const st = batchStatus(pedigree, ids);
  const n = st.ids.length;
  const item = (show: boolean, text: string, fn: () => void, title?: string) =>
    show ? <MenuItem key={text} onClick={() => action(fn)} title={title}>{text}</MenuItem> : null;
  return (
    <>
      <MenuSection label="Status">
        {item(st.affected < n, `Mark ${n} affected`, () => setAffectedMany(st.ids, true), "Shortcut: A")}
        {item(st.affected > 0, `Mark ${n} unaffected`, () => setAffectedMany(st.ids, false), "Shortcut: A")}
        {item(st.deceased < n, `Mark ${n} deceased`, () => setDeceasedMany(st.ids, true), "Shortcut: D")}
        {item(st.deceased > 0, `Mark ${n} living`, () => setDeceasedMany(st.ids, false), "Shortcut: D. Also clears their dates of death")}
        {/* With several conditions, carriers are marked per condition below (#115). */}
        {conditionMode(pedigree) !== "per-condition"
          && item(st.carrier.carrier < n, soleCondition(pedigree) ? `Mark ${n} ${n === 1 ? "carrier" : "carriers"} of ${soleCondition(pedigree)!.label}` : `Mark ${n} carrier`,
            () => setCarrierStatusMany(st.ids, "carrier"))}
        {item(st.carrier.presymptomatic < n, `Mark ${n} presymptomatic`, () => setCarrierStatusMany(st.ids, "presymptomatic"),
          "Presymptomatic carrier: a vertical line through the symbol (NSGC). Replaces a carrier dot")}
        {item(st.carrier.none < n, `Clear carrier status of ${n}`, () => setCarrierStatusMany(st.ids, "none"))}
      </MenuSection>

      {conditionMode(pedigree) === "per-condition" && (
        <MenuSection label={`Conditions of ${n}`}>
          {conditionTags(pedigree).flatMap(tag => {
            const c = st.conditions[tag.id]!;
            return [
              item(c.affected < n, `Mark ${n} affected with ${tag.label}`, () => setConditionStatusMany(st.ids, tag.id, "affected")),
              item(c.carrier < n, `Mark ${n} ${n === 1 ? "carrier" : "carriers"} of ${tag.label}`, () => setConditionStatusMany(st.ids, tag.id, "carrier")),
              item(c.none < n, `Clear ${tag.label} from ${n}`, () => setConditionStatusMany(st.ids, tag.id, "none")),
            ];
          })}
        </MenuSection>
      )}

      {menuTags(pedigree).length > 0 && (
        <MenuSection label={`Tags of ${n}`}>
          {menuTags(pedigree).map(tag => {
            const count = st.tags[tag.id] ?? 0;
            const all = count === n;
            return (
              <MenuItem
                key={tag.id}
                onClick={() => action(() => setIndividualTagMany(st.ids, tag.id, !all))}
                active={all}
                title={all ? `Remove ${tag.label} from all ${n}` : `Add ${tag.label} to all ${n}`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 border border-black/20"
                    style={{ background: tag.color, borderRadius: tag.style === "dot" ? "50%" : 0 }}
                  />
                  {tag.label}
                  {all ? <span className="text-gray-400">✓</span> : count > 0 ? <span className="text-gray-400">{count}/{n}</span> : null}
                </span>
              </MenuItem>
            );
          })}
        </MenuSection>
      )}

      <MenuSection label={`Sex of ${n}`}>
        <div className="flex">
          {(["male", "female", "unknown"] as const).map(sex => {
            const why = batchSexProblem(pedigree, st.ids, sex);
            return (
              <MenuItem
                key={sex}
                onClick={() => action(() => setSexMany(st.ids, sex))}
                active={st.sex[sex] === n}
                disabled={!!why || st.sex[sex] === n}
                title={why ?? (st.sex[sex] === n ? `All ${n} are already ${sex === "unknown" ? "of unknown sex" : sex}` : undefined)}
              >
                {sex.charAt(0).toUpperCase() + sex.slice(1)}
              </MenuItem>
            );
          })}
        </div>
      </MenuSection>

      <div className="border-t mt-1 pt-1">
        <MenuItem onClick={() => action(() => deleteIndividuals(st.ids))} destructive title="Delete. Children stay, as founders">
          Delete {n}
        </MenuItem>
        <MenuItem
          onClick={() => action(() => removeWithDescendants(st.ids))}
          destructive
          title="Shift+Delete. Also removes everyone below and partners who married in"
        >
          Remove {n} with descendants
        </MenuItem>
        <MenuItem
          onClick={() => action(() => removeWithAncestors(st.ids))}
          destructive
          title="Alt+Delete. Also removes everyone above; descendants become founders"
        >
          Remove {n} with ancestors
        </MenuItem>
      </div>
    </>
  );
}

/**
 * Tags listed in the menus' Tags sections: all of them, except that with two
 * or more conditions the condition tags have their own section (#115).
 * Traits (#118) stay here: they are plain tags.
 */
function menuTags(pedigree: Pedigree): Tag[] {
  const tags = pedigree.tags ?? [];
  return conditionMode(pedigree) === "per-condition" ? tags.filter(t => !isConditionTag(t)) : tags;
}

function ConditionItemLabel({ tag, text, on }: { tag: Tag; text: string; on: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2 h-2 border border-black/20" style={{ background: tag.color }} />
      {text}
      {on && <span className="text-gray-400">✓</span>}
    </span>
  );
}

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-2 py-0.5 text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
      {children}
    </div>
  );
}

interface MenuItemProps {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
  /** A toggle: shows a tick when true and sets aria-checked. */
  checked?: boolean;
}

function MenuItem({ onClick, children, active, destructive, disabled, title, checked }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      role={checked === undefined ? undefined : "menuitemcheckbox"}
      aria-checked={checked}
      disabled={disabled}
      title={title}
      className={`
        w-full text-left px-2 py-1 rounded text-xs
        hover:bg-gray-100 transition-colors
        ${active ? "font-medium" : ""}
        ${destructive ? "text-red-600 hover:bg-red-50" : ""}
        ${disabled ? "opacity-30 cursor-not-allowed hover:bg-transparent" : ""}
      `}
    >
      {children}
      {checked && <span className="text-gray-400"> ✓</span>}
    </button>
  );
}
