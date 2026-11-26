import type { ReactNode } from "react";
import { Lock, MoreHorizontal, Unlock } from "lucide-react";
import type { Individual } from "@pedigree-editor/layout-engine";
import { usePedigreeFields } from "../store/usePedigreeStore";
import { parentPartnershipOf } from "../pedigree/twins";
import { MoreMenu } from "../pedigree/nodes/MoreMenu";

const ACTION_CLASS = "flex min-w-0 flex-1 h-12 flex-col items-center justify-center gap-1 border-r last:border-r-0 text-[10px] leading-none text-gray-700 active:bg-gray-100 disabled:text-gray-300";

/**
 * Small screens: the hover pill's buttons (`pedigree/nodes/HoverPill.tsx`)
 * as a row at the top of the Person tab's sheet, where a finger can hit
 * them and they cover nothing on the chart. The pill is not shown after a
 * tap there. A new button on the pill belongs here too. The U-shape view
 * (#220), which has no pill, shows the row on any screen, without the lock:
 * nobody is dragged there.
 */
export function PersonActions({ individual }: { individual: Individual }) {
  const { pedigree, addParent, addChild, addSibling, lockIndividual, unlockIndividual, uShapeView } = usePedigreeFields("pedigree", "addParent", "addChild", "addSibling", "lockIndividual", "unlockIndividual", "uShapeView");
  const id = individual.id;
  const hasParents = !!parentPartnershipOf(pedigree, id);
  // A pregnancy or pregnancy loss cannot have children.
  const noChildren = !!individual.lifeStatus;
  const nodesMoveable = pedigree.canvasSettings?.nodesMoveable ?? false;
  const unlocked = (pedigree.unlockedIndividuals ?? []).includes(id);
  return (
    // On a phone, one row across the sheet. In the 240px side panel (the
    // U-shape view) the labels need two rows of three.
    <div className="flex border lg:grid lg:grid-cols-3 lg:border-r-0 lg:border-b-0 lg:*:border-b lg:*:border-r lg:*:last:border-r" data-testid="person-actions">
      <Action glyph="↑" label="Parents" title="Add parents" disabled={hasParents} onClick={() => addParent(id, "male")} />
      <Action glyph="□↓" label="Son" title="Add son" disabled={noChildren} onClick={() => addChild(id, "male")} />
      <Action glyph="○↓" label="Daughter" title="Add daughter" disabled={noChildren} onClick={() => addChild(id, "female")} />
      <Action glyph="◇↓" label="Child" title="Add child (unknown sex)" disabled={noChildren} onClick={() => addChild(id, "unknown")} />
      <Action glyph="←│→" label="Sibling" title="Add sibling" disabled={!hasParents} onClick={() => addSibling(id)} />
      {!nodesMoveable && !uShapeView && (
        <Action
          glyph={unlocked ? <Unlock size={14} strokeWidth={1.5} /> : <Lock size={14} strokeWidth={1.5} />}
          label={unlocked ? "Lock" : "Unlock"}
          title={unlocked ? "Lock position" : "Unlock to drag"}
          onClick={() => unlocked ? lockIndividual(id) : unlockIndividual(id)}
        />
      )}
      <MoreMenu individualId={id} triggerClassName={ACTION_CLASS}>
        <MoreHorizontal size={14} />
        <span>More</span>
      </MoreMenu>
    </div>
  );
}

function Action({ glyph, label, title, disabled, onClick }: { glyph: ReactNode; label: string; title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className={ACTION_CLASS}>
      <span className="flex h-3.5 items-center font-mono text-xs leading-none" aria-hidden>{glyph}</span>
      <span>{label}</span>
    </button>
  );
}
