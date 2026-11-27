import { twinSetProblem, twinSetOf } from "../../pedigree/twins";
import { swapSidesPlan, drawBesidePlan, couplePartnerLabel } from "../../pedigree/partners";
import { removeFromTwinSets, setOptional } from "./draft";
import type { EditTools, CoupleSlice } from "./state";
import { childrenOf } from "../../pedigree/graph";

/** Edits to what is recorded about a couple, twins among their children included. */

export function coupleSlice(tools: EditTools): CoupleSlice {
  const { get, mutate, editPartnership } = tools;

  return {
    setTwins: (partnershipId, members, zygosity) => {
      const unique = [...new Set(members)];
      const problem = twinSetProblem(get().pedigree, partnershipId, unique, zygosity);
      if (problem) {
        console.warn(`Cannot make twin set: ${problem}`);
        return problem;
      }
      mutate(draft => {
        const p = draft.partnerships.find(x => x.id === partnershipId);
        if (!p) return;
        const order = childrenOf(draft, partnershipId);
        const sorted = [...unique].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        const rest = (p.twins ?? [])
          .map(t => ({ ...t, members: t.members.filter(m => !unique.includes(m)) }))
          .filter(t => t.members.length >= 2);
        p.twins = [...rest, { members: sorted, zygosity }];
      });
      return null;
    },

    removeTwin: (id) => {
      if (!twinSetOf(get().pedigree, id)) return;
      mutate(draft => removeFromTwinSets(draft, id));
    },

    removeTwins: (ids) => {
      const twins = ids.filter(id => twinSetOf(get().pedigree, id));
      if (twins.length === 0) return;
      mutate(draft => { for (const id of twins) removeFromTwinSets(draft, id); });
    },

    setPartnershipChildless: (partnershipId, status) => {
      if (status !== undefined && childrenOf(get().pedigree, partnershipId).length > 0) {
        console.warn("Cannot mark a couple with children as childless");
        return;
      }
      editPartnership(partnershipId, p => {
        setOptional(p, "childless", status);
        if (status === undefined) delete p.childlessReason;
      });
    },

    setPartnershipChildlessReason: (partnershipId, reason) => editPartnership(partnershipId, p => { setOptional(p, "childlessReason", reason); }),

    setPartnershipConsanguineous: (partnershipId, related) => editPartnership(partnershipId, p => { setOptional(p, "consanguineous", related); }),

    setPartnershipConsanguinityLabel: (partnershipId, label) => editPartnership(partnershipId, p => { setOptional(p, "consanguinityLabel", label); }),

    setPartnershipEnded: (partnershipId, ended) => editPartnership(partnershipId, p => { setOptional(p, "ended", ended); }),

    swapPartnerSides: (partnershipId) => {
      const { pedigree } = get();
      const plan = swapSidesPlan(pedigree, partnershipId);
      if ("problem" in plan) {
        get().setNotice({ kind: "error", text: plan.problem });
        return plan.problem;
      }
      mutate(draft => {
        for (const p of draft.partnerships) if (plan.sides[p.id]) p.leftPartner = plan.sides[p.id];
      });
      const p = pedigree.partnerships.find(x => x.id === partnershipId)!;
      const pinned = [p.individual1, p.individual2].filter(id => pedigree.pinnedPositions?.[id]);
      if (pinned.length > 0) {
        const name = (id: string) => pedigree.individuals.find(i => i.id === id)?.name?.trim() || "a partner";
        get().setNotice({ kind: "info", text: `Sides swapped, but ${pinned.map(name).join(" and ")} ${pinned.length === 1 ? "is" : "are"} pinned and stay${pinned.length === 1 ? "s" : ""} where dragged: unpin to see the swap.`, undoable: true });
      }
      return null;
    },

    setCoupleDrawnBeside: (partnershipId, individualId) => {
      const { pedigree } = get();
      const plan = drawBesidePlan(pedigree, partnershipId, individualId);
      if ("unchanged" in plan) {
        get().setNotice({ kind: "info", text: plan.unchanged });
        return plan.unchanged;
      }
      editPartnership(partnershipId, p => {
        setOptional(p, "drawnBeside", plan.drawnBeside);
        setOptional(p, "leftPartner", plan.leftPartner);
      });
      const p = pedigree.partnerships.find(x => x.id === partnershipId)!;
      const pinned = [p.individual1, p.individual2].filter(id => pedigree.pinnedPositions?.[id]);
      const pinnedText = pinned.length > 0
        ? `${pinned.map(id => couplePartnerLabel(pedigree, partnershipId, id)).join(" and ")} ${pinned.length === 1 ? "is" : "are"} pinned and stay${pinned.length === 1 ? "s" : ""} where dragged: unpin to see the change.`
        : null;
      const text = [plan.notice, pinnedText].filter(Boolean).join(" ");
      if (text) get().setNotice({ kind: "info", text: text.charAt(0).toUpperCase() + text.slice(1), undoable: true });
      return null;
    },
  };
}
