/**
 * Ends mouse gestures that are let go over a disabled control.
 *
 * Browsers send no mouse events to a disabled button, input or select, only
 * pointer events. React Flow's node drag and pan (d3-drag, d3-zoom) end on a
 * `mouseup` on the window, so a drag let go over one of the hover pill's
 * disabled buttons never ended: the person stayed stuck to the mouse and was
 * never pinned. The pill moves with the person, so the mouse only reaches it
 * when the release comes before React has drawn the last move, which is
 * common on a large pedigree. (shadcn's `Button` has
 * `disabled:pointer-events-none`, so a release over one already reaches what
 * is behind it.)
 *
 * On a mouse `pointerup` over a disabled control, this sends the `mouseup`
 * the browser left out, on the document so it bubbles to the window, unless
 * a real one arrives first (a browser that sends both gets only its own).
 * Returns a function that removes the listeners.
 */
export function endMouseGesturesOverDisabled(win: Window = window): () => void {
  let pending: PointerEvent | null = null;

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const target = e.target as Element | null;
    if (!target?.closest?.(":disabled")) return;
    pending = e;
    win.setTimeout(() => {
      const p = pending;
      pending = null;
      if (!p) return;
      win.document.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true, cancelable: true, view: win,
        clientX: p.clientX, clientY: p.clientY, screenX: p.screenX, screenY: p.screenY,
        button: p.button, buttons: p.buttons,
        ctrlKey: p.ctrlKey, shiftKey: p.shiftKey, altKey: p.altKey, metaKey: p.metaKey,
      }));
    }, 0);
  };
  const onMouseUp = () => { pending = null; };

  win.addEventListener("pointerup", onPointerUp, { capture: true });
  win.addEventListener("mouseup", onMouseUp, { capture: true });
  return () => {
    win.removeEventListener("pointerup", onPointerUp, { capture: true });
    win.removeEventListener("mouseup", onMouseUp, { capture: true });
  };
}
