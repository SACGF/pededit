import { useEffect, useRef, useState } from "react";
import type { Sex } from "@pedigree-editor/layout-engine";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePedigreeStore, hasPartnerOrChild, MAX_ADD_CHILDREN } from "../../store/usePedigreeStore";
import { LIFE_STATUS_OPTIONS } from "../lifeStatus";
import { CHILDLESS_OPTIONS } from "../childless";
import { ADOPTION_OPTIONS } from "../adoption";
import { ZYGOSITY_OPTIONS, parentPartnershipOf, twinSetOf, twinSetProblem } from "../twins";
import { adjacentSibling } from "../../components/EditPanel";
import { batchLockState } from "../selection";
import { coupleConsanguinity } from "../consanguinity";
import { hasDescendants } from "../collapse";

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
    setProband,
    setSex,
    setLifeStatus,
    moveSibLeft,
    moveSibRight,
    deleteIndividual,
    setSelectedId,
    unpinIndividual,
    setIndividualTag,
    setPartnershipChildless,
    setPartnershipConsanguineous,
    setAdopted,
    setTwins,
    removeTwin,
    removeWithDescendants,
    removeWithAncestors,
    setDescendantsHidden,
    startPickingParents,
    startPickingChild,
    startPickingPartner,
  } = usePedigreeStore();

  const individual = pedigree.individuals.find(i => i.id === individualId);
  if (!individual) return null;

  const isPinned = !!pedigree.pinnedPositions?.[individualId];
  const hasParentsAlready = Object.values(pedigree.parentOf).some(kids => kids.includes(individualId));
  const ownPartnerships = partnerChoices(pedigree, individualId);
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

  // Collect sexes that would create a same-sex pairing (grey them out)
  const disabledSexes = new Set<string>();
  for (const p of pedigree.partnerships) {
    const partnerId =
      p.individual1 === individualId ? p.individual2 :
      p.individual2 === individualId ? p.individual1 : null;
    if (!partnerId) continue;
    const partner = pedigree.individuals.find(i => i.id === partnerId);
    if (partner && partner.sex !== "unknown") {
      disabledSexes.add(partner.sex);
    }
  }

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
          {ownPartnerships.length > 0 && !individual.lifeStatus && (
            <MenuItem
              onClick={() => action(() => startPickingChild(ownPartnerships[0]!.partnershipId))}
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
          <MenuItem onClick={() => action(() => setAffected(individualId, !individual.affected))}>
            {individual.affected ? "Mark unaffected" : "Mark affected"}
          </MenuItem>
          <MenuItem onClick={() => action(() => setDeceased(individualId, !individual.deceased))}>
            {individual.deceased ? "Mark living" : "Mark deceased"}
          </MenuItem>
          <MenuItem onClick={() => action(() => setCarrier(individualId, !individual.carrier))}>
            {individual.carrier ? "Unmark carrier" : "Mark carrier"}
          </MenuItem>
          <MenuItem onClick={() => action(() => setProband(individualId))}>
            {individual.proband ? "Unmark proband" : "Mark as proband"}
          </MenuItem>
        </MenuSection>

        {(pedigree.tags?.length ?? 0) > 0 && (
          <MenuSection label="Tags">
            {pedigree.tags!.map(tag => {
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
              disabled={disabledSexes.has(sex)}
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

        {ownPartnerships.length > 0 && (
          <MenuSection label="Consanguinity">
            {ownPartnerships.map(c => (
              <ConsanguineousItem
                key={c.partnershipId}
                partnershipId={c.partnershipId}
                label={ownPartnerships.length > 1 ? `Consanguineous with ${c.label}` : "Consanguineous"}
                onToggle={on => action(() => setPartnershipConsanguineous(c.partnershipId, on))}
              />
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
  const { pedigree, setPartnershipChildless, setPartnershipConsanguineous, startPickingChild } = usePedigreeStore();
  const partnership = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!partnership) return null;
  const nameOf = (id: string) => pedigree.individuals.find(i => i.id === id)?.name?.trim();
  const n1 = nameOf(partnership.individual1), n2 = nameOf(partnership.individual2);
  const childless = (pedigree.parentOf[partnershipId] ?? []).length === 0;

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
        <MenuItem
          onClick={() => action(() => startPickingChild(partnershipId))}
          title="Click an existing person on the canvas to make them a child of this couple"
        >
          Add existing child...
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
  const { pedigree, selectedIds, selectDescendants, unlockIndividuals, lockIndividuals } = usePedigreeStore();
  const batch = selectedIds.length > 1 && selectedIds.includes(individualId);
  const { toUnlock, toLock } = batchLockState(pedigree, batch ? selectedIds : []);
  return (
    <MenuSection label={batch ? `${selectedIds.length} selected` : "Select"}>
      <MenuItem
        onClick={() => action(() => selectDescendants(individualId))}
        title="Select this person, everyone below them and the partners who married in, to move the branch together"
      >
        Select with descendants
      </MenuItem>
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
    </MenuSection>
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
