import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePedigreeFields, usePedigreeStore } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import { chartTitle } from "./labels";
import { branchOf, drawnPedigree, isBranchPlaceholderId } from "./collapse";
import { activeFilters } from "./viewFilters";
import { NODE_SIZE } from "./constants";
import { uShapeViewDrawing, U_SHAPE_OMITS, U_SHAPE_REFUSALS, U_SHAPE_UNAVAILABLE } from "./uShapeView";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
/** A press that moves further than this (px) is a pan, not a click. */
const CLICK_SLOP = 3;
const HALF = NODE_SIZE / 2;
const SVG_NS = "http://www.w3.org/2000/svg";
/** Height kept clear for the banner when fitting (px). */
const BANNER_ROOM = 40;

interface View { x: number; y: number; k: number }

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** The person (or group symbol) under a pointer: each is a `<g>` the exporter marks with its id. */
function personAt(target: EventTarget | null): string | null {
  const g = (target as Element | null)?.closest?.("[data-id], [data-dup-of]");
  return g ? g.getAttribute("data-id") ?? g.getAttribute("data-dup-of") : null;
}

function personElements(root: Element, id: string): Element[] {
  const q = CSS.escape(id);
  return [...root.querySelectorAll(`[data-id="${q}"], [data-dup-of="${q}"]`)];
}

interface Gesture {
  pointers: Map<number, { x: number; y: number }>;
  /** Where the current one-finger or mouse pan started, and the view then. */
  start: { x: number; y: number; view: View };
  pinch?: { dist: number; mid: { x: number; y: number }; view: View };
  moved: boolean;
  personId: string | null;
  mouse: boolean;
  /** A Shift+drag, which would draw a rubber band on the chart: refused, no pan. */
  band: boolean;
}

/**
 * The U-shape view (#220): the U-shape export's figure in place of the
 * chart, redrawn on every edit. It pans (drag), zooms (wheel, pinch, the
 * buttons) and selects (click, Shift / Ctrl / Cmd+click to add), and the
 * Person tab edits whoever is selected. What the chart does on top of that
 * (drag, right-click menus, rubber band, picking) is refused with a notice
 * saying why, as the toolbar's add buttons and Reset layout are.
 *
 * The figure is the exporter's SVG string set as HTML, so the selection
 * outline is added to the person's `<g>` (already turned with the track)
 * after each draw rather than rendered by React.
 */
export function UShapeView({ onPersonTap, onPaneTap }: { onPersonTap?: () => void; onPaneTap?: () => void }) {
  const {
    pedigree, selectedIds, selectedId, problemHighlightId, revealRequest, layoutResetCount,
    setSelectedId, toggleSelected, setUShapeView, setNotice, setDescendantsHidden,
  } = usePedigreeFields(
    "pedigree", "selectedIds", "selectedId", "problemHighlightId", "revealRequest", "layoutResetCount",
    "setSelectedId", "toggleSelected", "setUShapeView", "setNotice", "setDescendantsHidden",
  );
  const name = useAppStore(s => s.activeTitle);
  // Typing a name redraws the whole figure; let the field keep up first.
  const shown = useDeferredValue(pedigree);
  const title = chartTitle(shown, name);
  const drawing = useMemo(() => uShapeViewDrawing(shown, title), [shown, title]);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const gesture = useRef<Gesture | null>(null);

  const figureSize = useCallback(() => {
    const svg = contentRef.current?.querySelector("svg");
    return svg ? { w: svg.width.baseVal.value, h: svg.height.baseVal.value } : null;
  }, []);

  /** Fit the whole figure in the view. False when nothing is laid out yet to fit. */
  const fit = useCallback(() => {
    const c = containerRef.current, size = figureSize();
    if (!c || !size || !c.clientWidth || !c.clientHeight) return false;
    // The banner takes the top; the figure (title first) goes below it.
    const top = BANNER_ROOM, h = Math.max(1, c.clientHeight - top);
    const k = clampZoom(Math.min(c.clientWidth / size.w, h / size.h, 1.5) * 0.95);
    setView({ x: (c.clientWidth - size.w * k) / 2, y: top + (h - size.h * k) / 2, k });
    return true;
  }, [figureSize]);

  // Fit when the view opens, a pedigree is opened, or a filter changes the
  // figure's size; edits keep the view where it is.
  const filters = JSON.stringify(pedigree.filters ?? {});
  const fitKey = `${layoutResetCount}-${filters}-${drawing ? "drawn" : "none"}`;
  const fitted = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!drawing || fitted.current === fitKey) return;
    if (fit()) fitted.current = fitKey;
  }, [fitKey, drawing, fit]);

  // Outline the selected people, and the person a hovered problem is about.
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    root.querySelectorAll("[data-u-highlight]").forEach(e => e.remove());
    const outline = (id: string, attrs: Record<string, string>) => {
      for (const g of personElements(root, id)) {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("data-u-highlight", "");
        for (const [k, v] of Object.entries(attrs)) rect.setAttribute(k, v);
        g.appendChild(rect);
      }
    };
    for (const id of selectedIds) {
      outline(id, { x: String(-HALF - 3), y: String(-HALF - 3), width: String(NODE_SIZE + 6), height: String(NODE_SIZE + 6), fill: "none", stroke: "#ef4444", "stroke-width": "2" });
    }
    if (problemHighlightId) {
      outline(problemHighlightId, { x: String(-HALF - 7), y: String(-HALF - 7), width: String(NODE_SIZE + 14), height: String(NODE_SIZE + 14), fill: "none", stroke: "black", "stroke-width": "2", "stroke-dasharray": "4 3" });
    }
  }, [drawing, selectedIds, problemHighlightId]);

  /** Pan, keeping the zoom, to centre someone who is off screen or near its edge. */
  const reveal = useCallback((id: string) => {
    const c = containerRef.current, root = contentRef.current;
    const el = root && personElements(root, id)[0];
    if (!c || !el) return;
    const box = c.getBoundingClientRect(), r = el.getBoundingClientRect();
    const margin = Math.min(40, box.width / 4, box.height / 4);
    if (r.left >= box.left + margin && r.right <= box.right - margin && r.top >= box.top + margin && r.bottom <= box.bottom - margin) return;
    const cx = (r.left + r.right) / 2 - box.left, cy = (r.top + r.bottom) / 2 - box.top;
    setView(v => ({ ...v, x: v.x + box.width / 2 - cx, y: v.y + box.height / 2 - cy }));
  }, []);

  // A toolbar request (going to a problem) and, on a phone, the Person sheet
  // opening over the lower half both need the selected person brought back.
  useEffect(() => {
    if (!revealRequest) return;
    const frame = requestAnimationFrame(() => reveal(revealRequest.id));
    return () => cancelAnimationFrame(frame);
  }, [revealRequest, reveal]);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    let before = { w: c.clientWidth, h: c.clientHeight };
    const observer = new ResizeObserver(() => {
      const shrank = c.clientWidth < before.w || c.clientHeight < before.h;
      before = { w: c.clientWidth, h: c.clientHeight };
      if (shrank && selectedRef.current) reveal(selectedRef.current);
    });
    observer.observe(c);
    return () => observer.disconnect();
  }, [reveal]);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    setView(v => {
      const k = clampZoom(v.k * factor);
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    });
  }, []);

  // Wheel zooms about the cursor, as on the chart. React's wheel listener is
  // passive, so it could not stop the page scrolling.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = c.getBoundingClientRect();
      zoomAt(e.clientX - box.left, e.clientY - box.top, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002)));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as Element).closest("[data-u-shape-chrome]")) return;
    containerRef.current?.setPointerCapture(e.pointerId);
    const g: Gesture = gesture.current ?? {
      pointers: new Map(),
      start: { x: e.clientX, y: e.clientY, view: viewRef.current },
      moved: false,
      personId: personAt(e.target),
      mouse: e.pointerType === "mouse",
      band: e.pointerType === "mouse" && e.shiftKey,
    };
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }, view: viewRef.current };
      g.moved = true;
    }
    gesture.current = g;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const box = containerRef.current!.getBoundingClientRect();
    if (g.pinch && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = { x: (a!.x + b!.x) / 2 - box.left, y: (a!.y + b!.y) / 2 - box.top };
      const v0 = g.pinch.view, m0 = { x: g.pinch.mid.x - box.left, y: g.pinch.mid.y - box.top };
      const k = clampZoom(v0.k * dist / g.pinch.dist);
      // The point under the fingers' first midpoint stays under their midpoint.
      setView({ k, x: mid.x - (m0.x - v0.x) * (k / v0.k), y: mid.y - (m0.y - v0.y) * (k / v0.k) });
      return;
    }
    const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) > CLICK_SLOP) {
      g.moved = true;
      if (g.band) setNotice({ kind: "info", text: U_SHAPE_REFUSALS.band });
      // A mouse drag on a person moves them on the chart. A finger's is a pan.
      else if (g.mouse && g.personId && !isBranchPlaceholderId(g.personId)) setNotice({ kind: "info", text: U_SHAPE_REFUSALS.drag });
    }
    if (g.moved && !g.band) setView({ ...g.start.view, x: g.start.view.x + dx, y: g.start.view.y + dy });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !g.pointers.has(e.pointerId)) return;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size === 1) {
      // One finger lifted from a pinch: the other pans on from where it is.
      const [rest] = [...g.pointers.values()];
      g.pinch = undefined;
      g.start = { x: rest!.x, y: rest!.y, view: viewRef.current };
      return;
    }
    if (g.pointers.size > 0) return;
    gesture.current = null;
    if (g.moved || e.type === "pointercancel") return;
    const id = g.personId;
    if (id && isBranchPlaceholderId(id)) {
      // A group symbol: shows the branch again, as on the chart.
      const branch = branchOf(drawnPedigree(usePedigreeStore.getState().pedigree), id);
      if (branch && branch.roots.length > 0) setDescendantsHidden(branch.roots, false);
    } else if (id) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSelected(id);
      else { setSelectedId(id); onPersonTap?.(); }
    } else if (!e.shiftKey) {
      setSelectedId(null);
      onPaneTap?.();
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    const id = personAt(e.target);
    if (!id || isBranchPlaceholderId(id)) return;
    e.preventDefault();
    setNotice({ kind: "info", text: U_SHAPE_REFUSALS.menu });
  };

  const filtered = activeFilters(pedigree).length > 0;
  const zoomBy = (factor: number) => {
    const c = containerRef.current;
    if (c) zoomAt(c.clientWidth / 2, c.clientHeight / 2, factor);
  };

  return (
    <div
      ref={containerRef}
      data-testid="u-shape-view"
      className="relative w-full h-full overflow-hidden bg-white select-none cursor-grab active:cursor-grabbing"
      // Every touch is the figure's, as on the chart: two fingers zoom it, not the page.
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
    >
      {drawing ? (
        <div
          ref={contentRef}
          data-u-shape-figure
          className="absolute left-0 top-0 [&_[data-id]]:cursor-pointer [&_[data-dup-of]]:cursor-pointer"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}
          dangerouslySetInnerHTML={{ __html: drawing.svg }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-gray-500" data-testid="u-shape-unavailable">
          {U_SHAPE_UNAVAILABLE}
        </div>
      )}

      <div
        data-u-shape-chrome
        data-testid="u-shape-banner"
        role="status"
        className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-max max-w-[calc(100%-1rem)] text-center bg-white border border-gray-400 px-3 py-1 text-xs cursor-default"
      >
        <span title={drawing && drawing.drawn < drawing.total ? U_SHAPE_OMITS : undefined}>
          {drawing
            ? drawing.drawn < drawing.total
              ? `U-shape view: ${drawing.drawn} of ${drawing.total} people drawn${filtered ? " (filter on)" : ""}.`
              : `U-shape view: all ${drawing.total} people drawn.`
            : "U-shape view."}
        </span>{" "}
        <button
          className="ml-1 underline underline-offset-2 whitespace-nowrap hover:text-black"
          data-testid="u-shape-back"
          onClick={() => setUShapeView(false)}
        >
          Back to standard chart
        </button>
      </div>

      {drawing && (
        <div data-u-shape-chrome className="absolute bottom-3 left-3 z-10 flex flex-col border border-gray-300 bg-white text-gray-700 cursor-default">
          <ZoomButton label="Zoom in" onClick={() => zoomBy(1.25)}>+</ZoomButton>
          <ZoomButton label="Zoom out" onClick={() => zoomBy(0.8)}>−</ZoomButton>
          <ZoomButton label="Fit view" onClick={() => { fit(); }}>⤢</ZoomButton>
        </div>
      )}
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
      className="w-7 h-7 flex items-center justify-center text-sm border-b last:border-b-0 border-gray-300 hover:bg-gray-100">
      {children}
    </button>
  );
}
