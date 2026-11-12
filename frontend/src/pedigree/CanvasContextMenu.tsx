import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { MoreMenuItems, CoupleMenuItems, MENU_CONTENT_CLASS } from "./nodes/MoreMenu";

/** Where the right-click menu opens (client coordinates) and for what. */
export type ContextMenuTarget =
  | { x: number; y: number; individualId: string }
  | { x: number; y: number; partnershipId: string };

/**
 * The right-click menu (#95). A person gets the more menu's own item list,
 * a couple line the couple items, opened at the cursor. Radix closes it on
 * Escape and on a click outside, which calls `onClose`.
 */
export function CanvasContextMenu({ target, onClose }: { target: ContextMenuTarget | null; onClose: () => void }) {
  return (
    <Popover open={!!target} onOpenChange={o => { if (!o) onClose(); }}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          style={{ position: "fixed", left: target?.x ?? 0, top: target?.y ?? 0, width: 0, height: 0, pointerEvents: "none" }}
        />
      </PopoverAnchor>
      {target && (
        <PopoverContent
          // A new target is a new menu: reset "Add children..." and scroll.
          key={"individualId" in target ? `i:${target.individualId}:${target.x},${target.y}` : `p:${target.partnershipId}:${target.x},${target.y}`}
          data-context-menu
          className={MENU_CONTENT_CLASS}
          side="bottom"
          align="start"
          sideOffset={2}
          collisionPadding={8}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
        >
          {"individualId" in target
            ? <MoreMenuItems individualId={target.individualId} onDone={onClose} />
            : <CoupleMenuItems partnershipId={target.partnershipId} onDone={onClose} />}
        </PopoverContent>
      )}
    </Popover>
  );
}
