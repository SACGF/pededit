import { usePedigreeStore, usePedigreeFields } from "../../store/usePedigreeStore";
import { DELETE_TITLE, REMOVE_WITH_ANCESTORS_TITLE, REMOVE_WITH_DESCENDANTS_TITLE } from "../removal";
import { BATCH_LOCK_TITLE, BATCH_UNLOCK_TITLE, batchLockState, batchCollapseState } from "../selection";
import { batchStatus, batchSexProblem } from "../batch";
import { conditionMode, conditionTags, soleCondition } from "../conditions";
import { capitalised } from "../../utils/text";
import { MenuItem, MenuSection, MenuSwatch, menuTags, menuTagsLabel, type MenuAction } from "./menuParts";

/**
 * Select with descendants, and with several selected (this person among
 * them) the batch unlock and lock.
 */
export function SelectionMenuSection({ individualId, action }: { individualId: string; action: MenuAction }) {
  const { pedigree, selectedIds } = usePedigreeFields("pedigree", "selectedIds");
  const { selectDescendants, unlockIndividuals, lockIndividuals, startPickingRelatedness, setDescendantsHidden } = usePedigreeStore.getState();
  const batch = selectedIds.length > 1 && selectedIds.includes(individualId);
  const { toUnlock, toLock } = batchLockState(pedigree, batch ? selectedIds : []);
  // Collapse a selection: hide (or show) the descendants of every
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
        <MenuItem onClick={() => action(() => unlockIndividuals(toUnlock))} title={BATCH_UNLOCK_TITLE}>
          Unlock {toUnlock.length}
        </MenuItem>
      )}
      {toLock.length > 0 && (
        <MenuItem onClick={() => action(() => lockIndividuals(toLock))} title={BATCH_LOCK_TITLE}>
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
 * The status items for a multiple selection: each applies to every
 * selected person as one undo step, and is left out when it would change
 * nobody. Items that only make sense for one person (proband, add, twins,
 * sibling order, adoption, pregnancy, assisted reproduction) are not
 * offered; click one person to get them.
 */
export function BatchMenuItems({ ids, action }: { ids: string[]; action: MenuAction }) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const {
    setAffectedMany, setDeceasedMany, setCarrierStatusMany, setSexMany, setIndividualTagMany, setConditionStatusMany,
    deleteIndividuals, removeWithDescendants, removeWithAncestors,
  } = usePedigreeStore.getState();
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
        {/* With several conditions, carriers are marked per condition below. */}
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
        <MenuSection label={`${menuTagsLabel(pedigree)} of ${n}`}>
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
                  <MenuSwatch tag={tag} pedigree={pedigree} />
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
                {capitalised(sex)}
              </MenuItem>
            );
          })}
        </div>
      </MenuSection>

      <div className="border-t mt-1 pt-1">
        <MenuItem onClick={() => action(() => deleteIndividuals(st.ids))} destructive title={DELETE_TITLE}>
          Delete {n}
        </MenuItem>
        <MenuItem
          onClick={() => action(() => removeWithDescendants(st.ids))}
          destructive
          title={REMOVE_WITH_DESCENDANTS_TITLE}
        >
          Remove {n} with descendants
        </MenuItem>
        <MenuItem
          onClick={() => action(() => removeWithAncestors(st.ids))}
          destructive
          title={REMOVE_WITH_ANCESTORS_TITLE}
        >
          Remove {n} with ancestors
        </MenuItem>
      </div>
    </>
  );
}
