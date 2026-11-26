import type { ChildlessStatus, Zygosity } from "@pedigree-editor/layout-engine";
import { twinSetProblem, twinSetOf } from "../../pedigree/twins";
import { swapSidesPlan, drawBesidePlan, couplePartnerLabel } from "../../pedigree/partners";
import { removeFromTwinSets, setOptional } from "./draft";
import type { EditTools } from "./tools";

/** Edits to what is recorded about a couple, twins among their children included. */

export interface CoupleSlice {
  /**
   * Make (or replace) a twin set among the children of partnershipId.
   * Members already in another set of that partnership are moved into this
   * one. Returns the reason when refused (fewer than two members, not all
   * children of the couple, different sexes for monozygotic), else null.
   */
  setTwins: (partnershipId: string, members: string[], zygosity: Zygosity) => string | null;
  /** Take an individual out of their twin set; a set left with one member is dropped. */
  removeTwin: (id: string) => void;
  /**
   * Childless couple mark. Refused (no-op) when the partnership has
   * children. Clearing with undefined also drops the reason.
   */
  setPartnershipChildless: (partnershipId: string, status: ChildlessStatus | undefined) => void;
  /** Reason under the mark; empty clears it. */
  setPartnershipChildlessReason: (partnershipId: string, reason: string) => void;
  /**
   * The double-line override: mark a couple as related when the
   * pedigree does not show how. False removes the flag; a couple the
   * pedigree shows to be related keeps its double line either way.
   */
  setPartnershipConsanguineous: (partnershipId: string, related: boolean) => void;
  /** Text above the double line; empty clears it. */
  setPartnershipConsanguinityLabel: (partnershipId: string, label: string) => void;
  /** Ended relationship: two strokes across the couple line. False removes the flag. */
  setPartnershipEnded: (partnershipId: string, ended: boolean) => void;
  /**
   * Draw the couple's partners the other way round, by setting
   * `Partnership.leftPartner` (and the partner's other couple's, when they
   * have exactly two partners). One undo step, nobody pinned. Returns the
   * reason when refused, also shown as a notice.
   */
  swapPartnerSides: (partnershipId: string) => string | null;
  /**
   * Draw the couple where `individualId` (one of its partners) is placed, so
   * the other partner is the one drawn twice if someone must be; null hands
   * the choice back to the layout. Sets `Partnership.drawnBeside` and the
   * side it acts on. One undo step, nobody pinned. A notice says who is now
   * drawn twice, or why nothing changed (also returned).
   */
  setCoupleDrawnBeside: (partnershipId: string, individualId: string | null) => string | null;
}

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
        const order = draft.parentOf[partnershipId] ?? [];
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

    setPartnershipChildless: (partnershipId, status) => {
      if (status !== undefined && (get().pedigree.parentOf[partnershipId] ?? []).length > 0) {
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
