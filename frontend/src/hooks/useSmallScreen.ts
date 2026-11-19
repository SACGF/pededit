import { useEffect, useState } from "react";

/**
 * Below Tailwind's `lg` (1024px) the editor uses its small-screen layout:
 * the left sidebar behind a menu button, the side panel a sheet under
 * the canvas. The classes do the layout (`lg:` / `max-lg:`); this is for what
 * CSS cannot do, such as not mounting the minimap. A phone on its side is
 * about 850px wide, so it counts as small too.
 */
const SMALL_SCREEN = "(max-width: 1023px)";

/** The answer now, for an event handler that does not need to redraw when it changes. */
export function isSmallScreen(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(SMALL_SCREEN).matches;
}

export function useSmallScreen(): boolean {
  const [small, setSmall] = useState(isSmallScreen);
  useEffect(() => {
    const query = window.matchMedia?.(SMALL_SCREEN);
    if (!query) return;
    const onChange = () => setSmall(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return small;
}
