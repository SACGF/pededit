import { useEffect, useState } from "react";

interface ZoomedView {
  scale: number;
  left: number;
  top: number;
  width: number;
}

/** The visual viewport while the browser has zoomed the page in, else null. */
function zoomedView(): ZoomedView | null {
  const vv = typeof window === "undefined" ? undefined : window.visualViewport;
  if (!vv || vv.scale <= 1.01) return null;
  return { scale: vv.scale, left: vv.offsetLeft, top: vv.offsetTop, width: vv.width };
}

const PAGE_ZOOM_NOTICE = "The page is zoomed in. Pinch here, on the toolbar or on the side panel to zoom it back out. A pinch on the chart zooms the chart.";

/**
 * While the page is pinch-zoomed (a pinch off the canvas, #193), a strip at
 * the top of what is on screen says how to zoom back out. The canvas keeps
 * every touch for the chart, so a page zoomed until the canvas fills the
 * screen could not otherwise be zoomed out; the strip itself takes a pinch.
 * Fixed elements stay with the unzoomed page, so it follows the visual
 * viewport and is scaled back to its normal size.
 */
export function PageZoomNotice() {
  const [view, setView] = useState<ZoomedView | null>(zoomedView);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setView(zoomedView());
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  if (!view) return null;
  return (
    <div
      role="status"
      data-testid="page-zoom-notice"
      className="fixed left-0 top-0 z-[100] border-b bg-white px-3 py-2 text-xs leading-snug text-gray-700"
      style={{
        width: view.width * view.scale,
        transformOrigin: "0 0",
        transform: `translate(${view.left}px, ${view.top}px) scale(${1 / view.scale})`,
      }}
    >
      {PAGE_ZOOM_NOTICE}
    </div>
  );
}
