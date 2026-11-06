import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePedigreeStore, MAX_ADD_CHILDREN } from "../../store/usePedigreeStore";

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_ADD_CHILDREN, Math.max(1, Math.floor(n)));
}

interface MoreMenuProps {
  individualId: string;
}

export function MoreMenu({ individualId }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const [showAddChildren, setShowAddChildren] = useState(false);
  const [childCount, setChildCount] = useState(2);
  const {
    pedigree,
    addPartner,
    addChildren,
    setAffected,
    setDeceased,
    setCarrier,
    setProband,
    setSex,
    moveSibLeft,
    moveSibRight,
    deleteIndividual,
    setSelectedId,
    unpinIndividual,
  } = usePedigreeStore();

  const individual = pedigree.individuals.find(i => i.id === individualId);
  if (!individual) return null;

  const isPinned = !!pedigree.pinnedPositions?.[individualId];

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
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setShowAddChildren(false); }}>
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
        className="w-44 p-1"
        side="bottom"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <MenuSection label="Add">
          <MenuItem onClick={() => action(() => addPartner(individualId))}>
            Add partner
          </MenuItem>
          <MenuItem onClick={() => setShowAddChildren(v => !v)} active={showAddChildren}>
            Add children...
          </MenuItem>
          {showAddChildren && (
            <div className="pl-2">
              <div className="flex items-center gap-1 px-2 py-1">
                <span className="text-[10px] text-gray-400">Count</span>
                <button
                  title="Fewer"
                  onClick={() => setChildCount(c => clampCount(c - 1))}
                  className="w-5 h-5 border rounded text-xs leading-none hover:bg-gray-100"
                >
                  -
                </button>
                <input
                  type="number"
                  aria-label="Number of children"
                  min={1}
                  max={MAX_ADD_CHILDREN}
                  value={childCount}
                  onChange={e => setChildCount(clampCount(Number(e.target.value)))}
                  className="w-9 h-5 border rounded text-xs text-center"
                />
                <button
                  title="More"
                  onClick={() => setChildCount(c => clampCount(c + 1))}
                  className="w-5 h-5 border rounded text-xs leading-none hover:bg-gray-100"
                >
                  +
                </button>
              </div>
              <MenuItem onClick={() => action(() => addChildren(individualId, childCount, "male"))}>
                Add {childCount} {childCount === 1 ? "son" : "sons"}
              </MenuItem>
              <MenuItem onClick={() => action(() => addChildren(individualId, childCount, "female"))}>
                Add {childCount} {childCount === 1 ? "daughter" : "daughters"}
              </MenuItem>
              <MenuItem onClick={() => action(() => addChildren(individualId, childCount, "unknown"))}>
                Add {childCount} of unknown sex
              </MenuItem>
            </div>
          )}
        </MenuSection>

        <MenuSection label="Sibling order">
          <MenuItem onClick={() => action(() => moveSibLeft(individualId))}>
            Move left
          </MenuItem>
          <MenuItem onClick={() => action(() => moveSibRight(individualId))}>
            Move right
          </MenuItem>
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

        <MenuSection label="Sex">
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
        </MenuSection>

        <div className="border-t mt-1 pt-1">
          <MenuItem
            onClick={() => action(() => { deleteIndividual(individualId); setSelectedId(null); })}
            destructive
          >
            Delete
          </MenuItem>
        </div>

        {isPinned && (
          <div className="border-t mt-1 pt-1">
            <MenuItem onClick={() => action(() => unpinIndividual(individualId))}>
              Unpin position
            </MenuItem>
          </div>
        )}
      </PopoverContent>
    </Popover>
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
}

function MenuItem({ onClick, children, active, destructive, disabled }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full text-left px-2 py-1 rounded text-xs
        hover:bg-gray-100 transition-colors
        ${active ? "font-medium" : ""}
        ${destructive ? "text-red-600 hover:bg-red-50" : ""}
        ${disabled ? "opacity-30 cursor-not-allowed hover:bg-transparent" : ""}
      `}
    >
      {children}
    </button>
  );
}
