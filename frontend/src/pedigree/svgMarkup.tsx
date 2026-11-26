import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** SVG markup for some SVG elements, for the exports. Rendered inside an `<svg>` root, which React needs for SVG children. */
export function svgMarkup(children: ReactNode): string {
  return renderToStaticMarkup(<svg>{children}</svg>).slice("<svg>".length, -"</svg>".length);
}
