import { useEffect, useRef, useState } from "react";
import type { Sex } from "@pedigree-editor/layout-engine";
import { usePedigreeStore, MAX_ADD_CHILDREN } from "../../store/usePedigreeStore";
import { sameSexCouple } from "../sameSex";
import { personCouples } from "../partners";
import { MenuItem } from "./menuParts";

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_ADD_CHILDREN, Math.max(1, Math.floor(n)));
}

/**
 * The more menu's "Add children...": count stepper, partner choice (when
 * there are several) and the three add buttons. The count is typed as text
 * and clamped on blur or Enter, so typing "4" after clearing the box gives
 * 4, not 1 then 10.
 */
export function AddChildrenPanel({ individualId, partnershipId: fixed, onAdd }: {
  individualId: string;
  /** A couple's menu: the children are this couple's, with no choice of partner. */
  partnershipId?: string;
  onAdd: (sex: Sex, count: number, partnershipId: string | undefined) => void;
}) {
  const pedigree = usePedigreeStore(s => s.pedigree);
  const [count, setCount] = useState(2);
  const [draft, setDraft] = useState("2");
  const partners = personCouples(pedigree, individualId);
  const [chosen, setPartnershipId] = useState<string | undefined>(partners[0]?.partnershipId);
  const partnershipId = fixed ?? chosen;
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
      {!fixed && partners.length > 1 && (
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
