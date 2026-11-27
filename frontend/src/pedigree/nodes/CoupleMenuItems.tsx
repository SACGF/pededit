import { useState } from "react";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { ENDED_LABEL, ENDED_TITLE } from "../ended";
import { CHILDLESS_OPTIONS } from "../childless";
import { coupleConsanguinity } from "../consanguinity";
import { namedCoupleRelationship } from "../consanguinityLabel";
import { donorPairFor, sameSexCouple } from "../sameSex";
import { couplePartnerLabel, drawBesideOptions } from "../partners";
import { raisedChildrenOf } from "../graph";
import { MenuItem, MenuSection, menuAction, type MenuAction } from "./menuParts";
import { AddChildrenPanel } from "./AddChildrenPanel";
import { NO_CHILDREN_TITLE } from "../lifeStatus";

/**
 * Everything offered for one couple: the right-click menu of a couple line,
 * the menu of both partners selected together, and one group per couple in
 * a partner's own menu (`fromId`, that partner), which names the other
 * partner as `personCouples` does. A new couple item goes here only.
 */
export function CoupleMenuItems({ partnershipId, fromId, onDone }: { partnershipId: string; fromId?: string; onDone: () => void }) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const { setPartnershipChildless, setPartnershipConsanguineous, setPartnershipEnded, swapPartnerSides, startPickingChild, removePartnership, addChildren } = usePedigreeStore.getState();
  const [addingChildren, setAddingChildren] = useState(false);
  const partnership = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!partnership) return null;
  // A pregnancy or loss in the couple cannot have children.
  const noChildren = [partnership.individual1, partnership.individual2]
    .some(id => pedigree.individuals.find(i => i.id === id)?.lifeStatus) ? NO_CHILDREN_TITLE : null;
  const nameOf = (id: string) => pedigree.individuals.find(i => i.id === id)?.name?.trim();
  const n1 = nameOf(partnership.individual1), n2 = nameOf(partnership.individual2);
  const heading = fromId
    ? `With ${couplePartnerLabel(pedigree, partnershipId, fromId === partnership.individual1 ? partnership.individual2 : partnership.individual1, { fromId })}`
    : n1 && n2 ? `${n1} and ${n2}` : "Couple";
  const childless = raisedChildrenOf(pedigree, partnershipId).length === 0;
  const sameSex = !!sameSexCouple(pedigree, partnershipId);
  const action = menuAction(onDone);

  return (
    <>
      <MenuSection label={heading}>
        <ConsanguineousItem
          partnershipId={partnershipId}
          label="Consanguineous"
          onToggle={on => action(() => setPartnershipConsanguineous(partnershipId, on))}
        />
        <ConsanguinityLabelItem partnershipId={partnershipId} action={action} />
        <MenuItem
          onClick={() => action(() => setPartnershipEnded(partnershipId, !partnership.ended))}
          active={!!partnership.ended}
          checked={!!partnership.ended}
          title={ENDED_TITLE}
        >
          {ENDED_LABEL}
        </MenuItem>
        <MenuItem onClick={() => action(() => swapPartnerSides(partnershipId))} title={SWAP_SIDES_TITLE}>
          Swap sides
        </MenuItem>
        {sameSex ? (
          <SameSexChildItems partnershipId={partnershipId} fromId={fromId} action={action} />
        ) : (
          <>
            <MenuItem
              onClick={() => setAddingChildren(v => !v)}
              active={addingChildren}
              disabled={!!noChildren}
              title={noChildren ?? "Add sons, daughters or children of unknown sex to this couple"}
            >
              Add children...
            </MenuItem>
            {addingChildren && !noChildren && (
              <AddChildrenPanel
                individualId={partnership.individual1}
                partnershipId={partnershipId}
                onAdd={(sex, count) => action(() => addChildren(partnership.individual1, count, sex, partnershipId))}
              />
            )}
            <MenuItem
              onClick={() => action(() => startPickingChild(partnershipId))}
              title="Click an existing person on the canvas to make them a child of this couple"
            >
              Add existing child...
            </MenuItem>
          </>
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
      <DrawBesideSection partnershipId={partnershipId} fromId={fromId} action={action} />
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
 * "Text above line..." for a couple with a double line: opens a text
 * box in the menu, filled with the couple's text or else the relationship's
 * name. Enter or Apply sets it, an empty box clears it.
 */
function ConsanguinityLabelItem({ partnershipId, action }: { partnershipId: string; action: MenuAction }) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const [value, setValue] = useState<string | null>(null);
  const state = coupleConsanguinity(pedigree, partnershipId);
  const partnership = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!state || !partnership || !(state.related || state.flagged)) return null;
  const apply = () => action(() => usePedigreeStore.getState().setPartnershipConsanguinityLabel(partnershipId, (value ?? "").trim()));
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

/**
 * The consanguinity override for one couple, as a toggle. A couple the
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
 * "Draw this couple beside": the partner at whose place a couple is drawn,
 * which decides who is drawn twice in a family with a loop. Renders nothing
 * for a couple with no choice to make; a stored choice the structure no
 * longer allows can still be handed back to the layout.
 */
function DrawBesideSection({ partnershipId, fromId, action }: { partnershipId: string; fromId?: string; action: MenuAction }) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const { setCoupleDrawnBeside } = usePedigreeStore.getState();
  const partnership = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!partnership) return null;
  const options = drawBesideOptions(pedigree, partnershipId);
  const choices = options.length > 0 ? options : partnership.drawnBeside ? [partnership.drawnBeside] : [];
  if (choices.length === 0) return null;
  return (
    <div data-draw-beside={partnershipId}>
      <MenuSection label="Draw this couple beside">
        {choices.map(id => (
          <MenuItem
            key={id}
            onClick={() => action(() => setCoupleDrawnBeside(partnershipId, id))}
            active={partnership.drawnBeside === id}
            checked={partnership.drawnBeside === id}
            title={DRAW_BESIDE_TITLE}
          >
            {couplePartnerLabel(pedigree, partnershipId, id, { fromId, start: true })}
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => action(() => setCoupleDrawnBeside(partnershipId, null))}
          active={!partnership.drawnBeside}
          checked={!partnership.drawnBeside}
          title="The layout chooses where this couple is drawn and who is on the left"
        >
          Automatic
        </MenuItem>
      </MenuSection>
    </div>
  );
}

/**
 * "Add child..." on a same-sex couple's line: partners of the same
 * sex have no genetic children together, so the menu asks which of them is
 * the genetic parent and the child gets a donor of the other sex (see
 * `applySameSexChildren`). Opposite-sex couples never see this.
 */
function SameSexChildItems({ partnershipId, fromId, action }: { partnershipId: string; fromId?: string; action: MenuAction }) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const { addChildren, startPickingChild } = usePedigreeStore.getState();
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<string | undefined>();
  const p = pedigree.partnerships.find(x => x.id === partnershipId)!;
  const ids = [p.individual1, p.individual2];
  const nameOf = (id: string, start: boolean) => couplePartnerLabel(pedigree, partnershipId, id, { fromId, start });
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
            {ids.map(id => (
              <MenuItem key={id} onClick={() => setParent(id)} active={parent === id} checked={parent === id}>
                {nameOf(id, true)}
              </MenuItem>
            ))}
          </div>
          {parent && other && (
            <div className="px-2 py-1 text-[10px] text-gray-500 leading-tight">
              With {donorText}; {nameOf(other, false)} is a parent who is not genetic.
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
const DRAW_BESIDE_TITLE = "Draw the couple where this partner is placed. In a family with a loop the other partner is then the one drawn twice. Nobody is pinned";
const REMOVE_PARTNERSHIP_TITLE = "Remove the couple line, keeping both people (for a partner linked by mistake)";
