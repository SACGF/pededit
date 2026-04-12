import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePedigreeStore } from "../../store/usePedigreeStore";

interface MoreMenuProps {
  individualId: string;
}

export function MoreMenu({ individualId }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const {
    pedigree,
    addPartner,
    setAffected,
    setDeceased,
    setProband,
    setSex,
    moveSibLeft,
    moveSibRight,
    deleteIndividual,
    setSelectedId,
  } = usePedigreeStore();

  const individual = pedigree.individuals.find(i => i.id === individualId);
  if (!individual) return null;

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
    <Popover open={open} onOpenChange={setOpen}>
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
