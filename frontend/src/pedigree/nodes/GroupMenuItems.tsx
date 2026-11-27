import { usePedigreeStore } from "../../store/usePedigreeStore";
import { selectionTargets } from "../actionInventory";
import { linkPartnerProblem } from "../partners";
import { ZYGOSITY_OPTIONS, twinSetOf, twinSetProblem } from "../twins";
import { MenuItem, MenuSection, type MenuAction } from "./menuParts";

/**
 * What a multiple selection offers as a group (#243), from the targets it
 * is (`selectionTargets`): two people who are not partners can be made
 * partners, and two or more children of one couple can be made twins.
 */
export function GroupMenuItems({ ids, action }: { ids: string[]; action: MenuAction }) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const { linkPartner, setTwins, removeTwins, setNotice } = usePedigreeStore.getState();
  const targets = selectionTargets(pedigree, ids);
  const pair = targets.find(t => t.kind === "pair");
  const siblings = targets.find(t => t.kind === "siblings");
  if (!pair && !siblings) return null;
  const refused = (why: string | null) => { if (why) setNotice({ kind: "error", text: why }); };
  const pairProblem = pair && linkPartnerProblem(pedigree, pair.a, pair.b);
  // The set the siblings are in now, when they are all in the same one.
  const sets = siblings ? siblings.ids.map(id => twinSetOf(pedigree, id)?.set) : [];
  const shared = sets[0] && sets.every(s => s === sets[0]) && sets[0].members.length === siblings!.ids.length ? sets[0] : undefined;
  return (
    <>
      {pair && (
        <MenuSection label="The two">
          <MenuItem
            onClick={() => action(() => refused(linkPartner(pair.a, pair.b)))}
            disabled={!!pairProblem}
            title={pairProblem ?? "Join the two with a couple line, whatever their sexes (a relative too)"}
          >
            Make partners
          </MenuItem>
        </MenuSection>
      )}
      {siblings && (
        <MenuSection label={`Twins: the ${siblings.ids.length}`}>
          {ZYGOSITY_OPTIONS.map(o => {
            const why = twinSetProblem(pedigree, siblings.partnershipId, siblings.ids, o.value);
            return (
              <MenuItem
                key={o.value}
                onClick={() => action(() => refused(setTwins(siblings.partnershipId, siblings.ids, o.value)))}
                active={shared?.zygosity === o.value}
                disabled={!!why}
                title={why ?? undefined}
              >
                {o.label}
              </MenuItem>
            );
          })}
          {sets.some(Boolean) && (
            <MenuItem onClick={() => action(() => removeTwins(siblings.ids))} title="Take the selected siblings out of their twin sets">
              Not twins
            </MenuItem>
          )}
        </MenuSection>
      )}
    </>
  );
}
