import type { Pedigree } from "@pedigree-editor/layout-engine";
import { exportSvg } from "../io/svg/svgExporter";

const figures = new WeakMap<Pedigree, { src: string; width: number; height: number }>();

/** The figure as PedEdit's SVG export draws it, without the key, as a data URL. Kept per pedigree object. */
export function figureImage(pedigree: Pedigree): { src: string; width: number; height: number } {
  const cached = figures.get(pedigree);
  if (cached) return cached;
  const svg = exportSvg(pedigree, { padding: 10, key: false });
  const size = (attr: string) => Number(new RegExp(`${attr}="(\\d+(?:\\.\\d+)?)"`).exec(svg)?.[1] ?? 0);
  const img = { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: size("width"), height: size("height") };
  figures.set(pedigree, img);
  return img;
}

/**
 * A pedigree drawn by PedEdit itself for a guide page. An <img> rather than
 * inline SVG: every figure's markup reuses the same ids (patterns, clip
 * paths), which would clash in one document. Works in the prerender, which
 * has no DOM. It uses no hooks: the export renders components to markup
 * (#139), and a server render nested in the prerender's own server render
 * clears the hook state of the component it is called from.
 */
export function GuideFigure({ pedigree, alt, caption, scale = 1 }: {
  pedigree: Pedigree;
  alt: string;
  caption?: string;
  /** Drawn size against the export's own pixel size. */
  scale?: number;
}) {
  const img = figureImage(pedigree);
  return (
    <figure className="my-4">
      <img
        src={img.src}
        alt={alt}
        width={Math.round(img.width * scale)}
        height={Math.round(img.height * scale)}
        className="max-w-full h-auto"
      />
      {caption && <figcaption className="mt-1 text-sm text-gray-500">{caption}</figcaption>}
    </figure>
  );
}
