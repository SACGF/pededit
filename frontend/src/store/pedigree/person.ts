import type { Individual, Sex, LifeStatus, Adoption, ReproductiveRole, Evaluation } from "@pedigree-editor/layout-engine";
import { twinSetOf } from "../../pedigree/twins";
import { reproductiveRoleProblem } from "../../pedigree/assistedEdits";
import { batchSexProblem, batchSexTargets, carrierStatusOf, type CarrierStatus } from "../../pedigree/batch";
import { applyAffected, applyCarrier, applyConditionState, isConditionTag, type ConditionState } from "../../pedigree/conditions";
import { hasPartnerOrChild, dryRun, setOptional, removeTagOnset, setPlainTag } from "./draft";
import type { EditTools } from "./tools";

/**
 * Edits to what is recorded about a person, one at a time or for several
 * selected people as one undo step.
 */

export interface PersonSlice {
  updateIndividual: (id: string, updates: Partial<Individual>) => void;
  setSex: (id: string, sex: Sex) => void;
  /**
   * The plain Affected status. With exactly one condition tag it records that
   * condition too; unticking clears every affected condition
   * (`applyAffected`).
   */
  setAffected: (id: string, affected: boolean) => void;
  /**
   * One person's state for one condition (quadrant tag): affected,
   * carrier or neither (`applyConditionState`).
   */
  setConditionStatus: (id: string, tagId: string, state: ConditionState) => void;
  /**
   * Carrier with no condition recorded (the dot in 2008, the dotted half in
   * 2022); with exactly one condition tag, a carrier of it. Setting it
   * clears `presymptomatic`: the two are one carrier status.
   */
  setCarrier: (id: string, carrier: boolean) => void;
  /** Presymptomatic carrier, a vertical line through the symbol. Setting it clears `carrier`. */
  setPresymptomatic: (id: string, presymptomatic: boolean) => void;
  /** Unticking deceased also clears the date of death. */
  setDeceased: (id: string, deceased: boolean) => void;
  /** Date of death, "YYYY", "YYYY-MM" or "YYYY-MM-DD"; a non-empty one also ticks deceased, empty removes it. */
  setDateOfDeath: (id: string, dod: string | undefined) => void;
  /** Pregnancy / loss status. Refused (no-op) when the individual has a partner or children. */
  setLifeStatus: (id: string, status: LifeStatus | undefined) => void;
  /** Replace the person's evaluations; an empty list removes the field. */
  setEvaluations: (id: string, evaluations: Evaluation[]) => void;
  setProband: (id: string) => void;
  /** Consultand arrow without the "P". Several people may be consultands. */
  setConsultand: (id: string, consultand: boolean) => void;
  /** "?" above the symbol: family history not known. */
  setFamilyHistoryUnknown: (id: string, unknown: boolean) => void;
  /** Adoption brackets: "in", "out" or none. */
  setAdopted: (id: string, status: Adoption | undefined) => void;
  setReproductiveRole: (id: string, role: ReproductiveRole | undefined) => void;
  /** The woman who carried the child when not its genetic mother; undefined clears it. */
  setCarriedBy: (childId: string, carrierId: string | undefined) => void;
  /** Parents of the child who are not genetic parents (dashed line). */
  setSocialParents: (childId: string, parentIds: string[]) => void;
  setIndividualTag: (individualId: string, tagId: string, on: boolean) => void;
  /**
   * Age of onset of the affected status (tagId null) or of a condition
   * tag. An empty or blank value removes it.
   */
  setOnset: (individualId: string, tagId: string | null, value: string) => void;
  // Batch status changes on a multiple selection. Each is one undo step
  // and a no-op (no undo step) when nobody would change; the rules are the
  // single-person setters' applied to each person.
  setAffectedMany: (ids: string[], affected: boolean) => void;
  setDeceasedMany: (ids: string[], deceased: boolean) => void;
  /** Carrier dot, presymptomatic line or neither, kept exclusive as `setCarrier` / `setPresymptomatic` do. */
  setCarrierStatusMany: (ids: string[], status: CarrierStatus) => void;
  /** Refused with the reason (see `batchSexProblem`); monozygotic twins follow. */
  setSexMany: (ids: string[], sex: Sex) => string | null;
  setIndividualTagMany: (ids: string[], tagId: string, on: boolean) => void;
  /** `setConditionStatus` for several people, one undo step. */
  setConditionStatusMany: (ids: string[], tagId: string, state: ConditionState) => void;
}

export function personSlice(tools: EditTools): PersonSlice {
  const { get, mutate, editIndividual, mutateEach } = tools;

  return {
    updateIndividual: (id, updates) => editIndividual(id, ind => { Object.assign(ind, updates); }),

    /** Monozygotic twins share a sex, so changing one changes the whole set. */
    setSex: (id, sex) => {
      const problem = batchSexProblem(get().pedigree, [id], sex);
      if (problem) { get().setNotice({ kind: "error", text: problem }); return; }
      editIndividual(id, (ind, draft) => {
        ind.sex = sex;
        delete ind.placeholder; // a sex the user chose is a recorded fact
        const twin = twinSetOf(draft, id);
        if (twin?.set.zygosity === "monozygotic") {
          for (const m of twin.set.members) {
            const mate = draft.individuals.find(i => i.id === m);
            if (mate) mate.sex = sex;
          }
        }
      });
    },

    setAffected: (id, affected) => {
      const current = get().pedigree.individuals.find(i => i.id === id);
      if (!current || !dryRun(current, ind => applyAffected(ind, affected, get().pedigree))) return;
      // Onset belongs to the affected status; conditions follow it.
      editIndividual(id, (ind, draft) => { applyAffected(ind, affected, draft); });
    },

    setConditionStatus: (id, tagId, state) => {
      const { pedigree } = get();
      const current = pedigree.individuals.find(i => i.id === id);
      if (!current || !pedigree.tags?.some(t => t.id === tagId && isConditionTag(t))) return;
      if (!dryRun(current, ind => applyConditionState(ind, tagId, state, pedigree))) return;
      editIndividual(id, (ind, draft) => { applyConditionState(ind, tagId, state, draft); });
    },

    setCarrier: (id, carrier) => editIndividual(id, (ind, draft) => { applyCarrier(ind, carrier, draft); }),

    setPresymptomatic: (id, presymptomatic) => editIndividual(id, (ind, draft) => {
      // One carrier status: with one condition, its carrier state goes too.
      if (presymptomatic) applyCarrier(ind, false, draft);
      setOptional(ind, "presymptomatic", presymptomatic);
    }),

    setDeceased: (id, deceased) => editIndividual(id, ind => {
      ind.deceased = deceased;
      if (!deceased) delete ind.dod;
    }),

    setDateOfDeath: (id, dod) => editIndividual(id, ind => {
      if (dod) { ind.dod = dod; ind.deceased = true; }
      else delete ind.dod;
    }),

    /**
     * Set or clear the pregnancy / loss status. Clearing is always allowed.
     * Setting is refused when the individual has a partner or children, since
     * a pregnancy or pregnancy loss can have neither.
     */
    setLifeStatus: (id, status) => {
      if (status !== undefined && hasPartnerOrChild(get().pedigree, id)) {
        console.warn("Cannot mark an individual with a partner or children as a pregnancy or pregnancy loss");
        return;
      }
      editIndividual(id, ind => { setOptional(ind, "lifeStatus", status); });
    },

    setEvaluations: (id, evaluations) => editIndividual(id, ind => {
      setOptional(ind, "evaluations", evaluations.length > 0 && evaluations.map(e => ({ ...e })));
    }),

    /** Make `id` the only proband, or nobody when they already are. */
    setProband: (id) => {
      mutate(draft => {
        const already = !!draft.individuals.find(i => i.id === id)?.proband;
        for (const ind of draft.individuals) setOptional(ind, "proband", !already && ind.id === id);
      });
    },

    setConsultand: (id, consultand) => editIndividual(id, ind => { setOptional(ind, "consultand", consultand); }),

    setFamilyHistoryUnknown: (id, unknown) => editIndividual(id, ind => { setOptional(ind, "familyHistoryUnknown", unknown); }),

    setAdopted: (id, status) => editIndividual(id, ind => { setOptional(ind, "adopted", status); }),

    setReproductiveRole: (id, role) => {
      const problem = reproductiveRoleProblem(get().pedigree, id, role);
      if (problem) { get().setNotice({ kind: "error", text: problem }); return; }
      editIndividual(id, ind => { setOptional(ind, "reproductiveRole", role); });
    },

    setCarriedBy: (childId, carrierId) => editIndividual(childId, ind => {
      setOptional(ind, "carriedBy", carrierId !== childId && carrierId);
    }),

    setSocialParents: (childId, parentIds) => editIndividual(childId, ind => {
      const ids = [...new Set(parentIds)].filter(id => id !== childId);
      setOptional(ind, "socialParents", ids.length > 0 && ids);
    }),

    setIndividualTag: (individualId, tagId, on) => {
      // A condition tag means affected with it: ticking sets affected, unticking the last clears it.
      if (get().pedigree.tags?.some(t => t.id === tagId && isConditionTag(t))) {
        get().setConditionStatus(individualId, tagId, on ? "affected" : "none");
        return;
      }
      editIndividual(individualId, (ind, draft) => { setPlainTag(ind, tagId, on, draft); });
    },

    setOnset: (individualId, tagId, value) => editIndividual(individualId, ind => {
      const keep = value.trim() !== "";
      if (tagId === null) setOptional(ind, "onset", keep && value);
      else if (keep) ind.tagOnset = { ...(ind.tagOnset ?? {}), [tagId]: value };
      else removeTagOnset(ind, tagId);
    }),

    setAffectedMany: (ids, affected) => {
      const { pedigree } = get();
      mutateEach(ids, ind => dryRun(ind, c => applyAffected(c, affected, pedigree)), ind => {
        applyAffected(ind, affected, pedigree);
      }, n => `Marked ${n} ${affected ? "affected" : "unaffected"}.`);
    },

    setDeceasedMany: (ids, deceased) => {
      mutateEach(ids, ind => !!ind.deceased !== deceased, ind => {
        ind.deceased = deceased;
        if (!deceased) delete ind.dod;
      }, n => `Marked ${n} ${deceased ? "deceased" : "living"}.`);
    },

    setCarrierStatusMany: (ids, status) => {
      const { pedigree } = get();
      mutateEach(ids, ind => carrierStatusOf(ind, pedigree) !== status, ind => {
        // With one condition, carrier records it (`applyCarrier`).
        if (status === "carrier") applyCarrier(ind, true, pedigree);
        else if (status === "presymptomatic") { applyCarrier(ind, false, pedigree); ind.presymptomatic = true; }
        else { applyCarrier(ind, false, pedigree); delete ind.presymptomatic; }
      }, n => status === "none" ? `Cleared the carrier status of ${n}.`
        : `Marked ${n} ${status === "carrier" ? "carrier" : "presymptomatic carrier"}.`);
    },

    setSexMany: (ids, sex) => {
      const { pedigree } = get();
      const problem = batchSexProblem(pedigree, ids, sex);
      if (problem) { get().setNotice({ kind: "error", text: problem }); return problem; }
      mutateEach([...batchSexTargets(pedigree, ids)], ind => ind.sex !== sex, ind => { ind.sex = sex; },
        n => `Set ${n} to ${sex === "unknown" ? "unknown sex" : sex}.`);
      return null;
    },

    setIndividualTagMany: (ids, tagId, on) => {
      const tag = get().pedigree.tags?.find(t => t.id === tagId);
      if (!tag) return;
      // A condition tag is "affected with it": same rule as setConditionStatus. A trait is a plain tag.
      if (isConditionTag(tag)) {
        const { pedigree } = get();
        const state: ConditionState = on ? "affected" : "none";
        mutateEach(ids, ind => (ind.tags?.includes(tagId) ?? false) !== on, ind => {
          applyConditionState(ind, tagId, state, pedigree);
        }, n => `${on ? "Added" : "Removed"} ${tag.label} ${on ? "to" : "from"} ${n}.`);
        return;
      }
      const { pedigree } = get();
      mutateEach(ids, ind => (ind.tags?.includes(tagId) ?? false) !== on, ind => { setPlainTag(ind, tagId, on, pedigree); },
        n => `${on ? "Added" : "Removed"} ${tag.label} ${on ? "to" : "from"} ${n}.`);
    },

    setConditionStatusMany: (ids, tagId, state) => {
      const { pedigree } = get();
      const tag = pedigree.tags?.find(t => t.id === tagId && isConditionTag(t));
      if (!tag) return;
      mutateEach(ids, ind => dryRun(ind, c => applyConditionState(c, tagId, state, pedigree)), ind => {
        applyConditionState(ind, tagId, state, pedigree);
      }, n => state === "affected" ? `Marked ${n} affected with ${tag.label}.`
        : state === "carrier" ? `Marked ${n} ${n === 1 ? "carrier" : "carriers"} of ${tag.label}.`
          : `Cleared ${tag.label} from ${n}.`);
    },
  };
}
