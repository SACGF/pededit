import type { ReactNode } from "react";
import type { Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { TagSwatchSvg } from "../chart/keySwatches";
import { drawnPedigree } from "../collapse";
import { CONDITIONS_AND_TAGS, conditionMode, isConditionTag } from "../conditions";

// The pieces the more menu, the couple items and the batch items are built from.

/** Runs an item's edit, then closes the menu. */
export type MenuAction = (fn: () => void) => void;

/** The `action` of a menu whose popover `onDone` closes. */
export function menuAction(onDone: () => void): MenuAction {
  return fn => { fn(); onDone(); };
}

/**
 * Tags listed in the menus' Tags sections: all of them, except that with two
 * or more conditions the condition tags have their own section.
 * Traits stay here: they are plain tags.
 */
export function menuTags(pedigree: Pedigree): Tag[] {
  const tags = pedigree.tags ?? [];
  return conditionMode(pedigree) === "per-condition" ? tags.filter(t => !isConditionTag(t)) : tags;
}

/**
 * The heading over `menuTags`: "Tags" once the conditions have their own
 * section, "Conditions and tags" while the sole condition is listed here too
 * (glossary in the root AGENTS.md: a tag is anything that is not a condition).
 */
export function menuTagsLabel(pedigree: Pedigree): string {
  return menuTags(pedigree).some(isConditionTag) ? CONDITIONS_AND_TAGS : "Tags";
}

/**
 * A tag's swatch beside its menu item: the key's swatch (`TagSwatchSvg`),
 * so it is painted as the chart paints the tag, black and white patterns
 * included, shrunk to the height of a line of menu text. Read from the drawn
 * pedigree, as the Person tab's swatches are, since a condition's section
 * depends on which conditions are in use there.
 */
export function MenuSwatch({ tag, pedigree, carrier }: { tag: Tag; pedigree: Pedigree; carrier?: boolean }) {
  return (
    <span className="inline-flex shrink-0 -my-1 [&>svg]:h-4 [&>svg]:w-auto" data-menu-swatch={tag.id} aria-hidden>
      <TagSwatchSvg tag={tag} pedigree={drawnPedigree(pedigree)} carrier={carrier} />
    </span>
  );
}

/** A condition's item: its swatch and text. The item's `checked` draws the tick. */
export function ConditionItemLabel({ tag, pedigree, carrier, text }: { tag: Tag; pedigree: Pedigree; carrier?: boolean; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <MenuSwatch tag={tag} pedigree={pedigree} carrier={carrier} />
      {text}
    </span>
  );
}

export function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-2 py-0.5 text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
      {children}
    </div>
  );
}

interface MenuItemProps {
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
  /** A toggle: shows a tick when true and sets aria-checked. */
  checked?: boolean;
}

export function MenuItem({ onClick, children, active, destructive, disabled, title, checked }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      role={checked === undefined ? undefined : "menuitemcheckbox"}
      aria-checked={checked}
      disabled={disabled}
      title={title}
      className={`
        w-full text-left px-2 py-1 rounded text-xs
        hover:bg-gray-100 transition-colors
        ${active ? "font-medium" : ""}
        ${destructive ? "text-red-600 hover:bg-red-50" : ""}
        ${disabled ? "opacity-30 cursor-not-allowed hover:bg-transparent" : ""}
      `}
    >
      {children}
      {checked && <span className="text-gray-400"> ✓</span>}
    </button>
  );
}
