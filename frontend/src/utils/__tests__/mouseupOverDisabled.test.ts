import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { endMouseGesturesOverDisabled } from "../mouseupOverDisabled";

// No DOM in these tests: a window and document made of EventTargets, with the
// document passing what is dispatched on it up to the window, as bubbling does.
class FakeMouseEvent extends Event {
  clientX: number; clientY: number;
  constructor(type: string, init: MouseEventInit = {}) {
    super(type, init);
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
  }
}

function fakeWindow() {
  const win = new EventTarget() as EventTarget & { document: EventTarget; setTimeout: typeof setTimeout };
  const document = new EventTarget();
  const dispatch = document.dispatchEvent.bind(document);
  document.dispatchEvent = (e: Event) => { dispatch(e); return win.dispatchEvent(e); };
  win.document = document;
  win.setTimeout = setTimeout;
  return win;
}

describe("endMouseGesturesOverDisabled (#185)", () => {
  let win: ReturnType<typeof fakeWindow>;
  let remove: () => void;
  let got: FakeMouseEvent[];

  beforeEach(() => {
    vi.stubGlobal("MouseEvent", FakeMouseEvent);
    win = fakeWindow();
    got = [];
    win.addEventListener("mouseup", e => got.push(e as FakeMouseEvent));
    remove = endMouseGesturesOverDisabled(win as unknown as Window);
  });
  afterEach(() => { remove(); vi.unstubAllGlobals(); });

  /** A pointerup whose target is (inside) a disabled control or not. */
  const pointerUp = (disabled: boolean, pointerType = "mouse") => {
    const e = new FakeMouseEvent("pointerup", { clientX: 12, clientY: 34 });
    Object.defineProperty(e, "pointerType", { value: pointerType });
    Object.defineProperty(e, "target", { value: { closest: (sel: string) => (sel === ":disabled" && disabled ? {} : null) } });
    win.dispatchEvent(e);
  };
  const tick = () => new Promise(r => setTimeout(r, 5));

  it("sends the mouseup the browser leaves out over a disabled control, where the window hears it", async () => {
    pointerUp(true);
    await tick();
    expect(got).toHaveLength(1);
    expect([got[0].clientX, got[0].clientY]).toEqual([12, 34]);
  });

  it("sends nothing more when the browser sent its own mouseup", async () => {
    pointerUp(true);
    win.dispatchEvent(new FakeMouseEvent("mouseup"));
    await tick();
    expect(got).toHaveLength(1);
  });

  it("leaves enabled controls and touch alone", async () => {
    pointerUp(false);
    pointerUp(true, "touch");
    await tick();
    expect(got).toHaveLength(0);
  });

  it("stops once removed", async () => {
    remove();
    pointerUp(true);
    await tick();
    expect(got).toHaveLength(0);
  });
});
