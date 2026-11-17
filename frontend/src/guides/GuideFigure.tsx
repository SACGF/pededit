import { useMemo } from "react";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { exportSvg } from "../io/svg/svgExporter";

/** The figure as PedEdit's SVG export draws it, without the key, as a data URL. */
export function figureImage(pedigree: Pedigree): { src: string; width: number; height: number } {
  const svg = exportSvg(pedigree, { padding: 10, key: false });
  const size = (attr: string) => Number(new RegExp(`${attr}="(\\d+(?:\\.\\d+)?)"`).exec(svg)?.[1] ?? 0);
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: size("width"), height: size("height") };
}

/**
 * A pedigree drawn by PedEdit itself for a guide page. An <img> rather than
 * inline SVG: every figure's markup reuses the same ids (patterns, clip
 * paths), which would clash in one document. Works in the prerender, which
 * has no DOM.
 */
export function GuideFigure({ pedigree, alt, caption, scale = 1 }: {
  pedigree: Pedigree;
  alt: string;
  caption?: string;
  /** Drawn size against the export's own pixel size. */
  scale?: number;
}) {
  const img = useMemo(() => figureImage(pedigree), [pedigree]);
  return (
    <figure className="my-4">
      <img
        src={img.src}
        alt={alt}
        width={Math.round(img.width * scale)}
        height={Math.round(img.height * scale)}
        className="max-w-full h-auto"
      />
      {caption && <figcaption className="mt-1 text-xs text-gray-500">{caption}</figcaption>}
    </figure>
  );
}
