/**
 * PNG resolution (#18): the pixel size of a PNG export at a chosen DPI, and
 * the pHYs chunk that records that DPI so Word, journals' upload checks and
 * image editors read the intended physical size.
 *
 * The SVG export is in CSS pixels, 96 to the inch, so its printed size is
 * width / 96 inches and a PNG at D dpi is drawn at scale D / 96.
 */

export const CSS_PX_PER_INCH = 96;

/** Resolutions offered in the export dialog. */
export const PNG_DPI_CHOICES = [96, 150, 300, 600] as const;
export const DEFAULT_PNG_DPI = 300;

/**
 * Browser canvas limits. Chrome and Safari refuse a side over 16384 (iOS
 * Safari far less in area), and toBlob on a canvas past the area a browser
 * can allocate returns null. 64 megapixels is 256 MB of RGBA, which desktop
 * browsers manage; past either limit the DPI is lowered to fit.
 */
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 64_000_000;

export interface PngSize {
  width: number;
  height: number;
  /** DPI the PNG is drawn at and labelled with: the requested one unless capped. */
  dpi: number;
  /** True when the requested DPI would exceed the canvas limits. */
  capped: boolean;
}

/** Pixel size of a PNG of an SVG `svgWidth` x `svgHeight` CSS px at `dpi`, capped to what a canvas can hold. */
export function pngSizeForDpi(svgWidth: number, svgHeight: number, dpi: number): PngSize {
  const at = (d: number) => ({
    width:  Math.ceil(svgWidth  * d / CSS_PX_PER_INCH),
    height: Math.ceil(svgHeight * d / CSS_PX_PER_INCH),
  });
  const fits = (s: { width: number; height: number }) =>
    s.width <= MAX_CANVAS_SIDE && s.height <= MAX_CANVAS_SIDE && s.width * s.height <= MAX_CANVAS_AREA;

  const wanted = at(dpi);
  if (fits(wanted)) return { ...wanted, dpi, capped: false };

  const maxScale = Math.min(
    MAX_CANVAS_SIDE / svgWidth,
    MAX_CANVAS_SIDE / svgHeight,
    Math.sqrt(MAX_CANVAS_AREA / (svgWidth * svgHeight)),
  );
  let d = Math.max(1, Math.floor(maxScale * CSS_PX_PER_INCH));
  while (d > 1 && !fits(at(d))) d--;
  return { ...at(d), dpi: d, capped: true };
}

/** Pixels per metre for a DPI, as the pHYs chunk stores it. */
export function dpiToPixelsPerMetre(dpi: number): number {
  return Math.round(dpi / 0.0254);
}

let crcTable: Uint32Array | null = null;

/** CRC-32 as PNG uses it (ISO 3309, polynomial 0xEDB88320). */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(png: Uint8Array): boolean {
  return png.length >= 8 && PNG_SIGNATURE.every((b, i) => png[i] === b);
}

interface Chunk { type: string; start: number; end: number }

/** Byte ranges of every chunk (length, type, data, CRC) after the signature. */
function chunks(png: Uint8Array): Chunk[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Chunk[] = [];
  let pos = 8;
  while (pos + 12 <= png.length) {
    const len  = view.getUint32(pos);
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    const end  = pos + 12 + len;
    if (end > png.length) throw new Error(`PNG chunk ${type} runs past the end of the file`);
    out.push({ type, start: pos, end });
    pos = end;
    if (type === "IEND") break;
  }
  return out;
}

/** A pHYs chunk (length, type, data, CRC) giving `dpi` on both axes, unit metre. */
export function physChunk(dpi: number): Uint8Array {
  const chunk = new Uint8Array(21);
  const view  = new DataView(chunk.buffer);
  const ppm   = dpiToPixelsPerMetre(dpi);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

/**
 * Return a copy of `png` with a pHYs chunk for `dpi` straight after IHDR
 * (the spec wants it before the first IDAT), replacing any pHYs already there.
 */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  if (!isPng(png)) throw new Error("Not a PNG file");
  const list = chunks(png);
  if (list[0]?.type !== "IHDR") throw new Error("PNG does not start with IHDR");

  const phys  = physChunk(dpi);
  const parts: Uint8Array[] = [png.subarray(0, list[0].end), phys];
  let last = list[0].end;
  for (const c of list.slice(1)) {
    if (c.type === "pHYs") {
      parts.push(png.subarray(last, c.start));
      last = c.end;
    }
  }
  parts.push(png.subarray(last));

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** DPI recorded in a PNG's pHYs chunk, or null when it has none in metres. Rounded to the nearest whole DPI. */
export function readPngDpi(png: Uint8Array): { x: number; y: number } | null {
  if (!isPng(png)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (const c of chunks(png)) {
    if (c.type === "IDAT") return null;
    if (c.type === "pHYs" && png[c.start + 16] === 1) {
      return {
        x: Math.round(view.getUint32(c.start + 8) * 0.0254),
        y: Math.round(view.getUint32(c.start + 12) * 0.0254),
      };
    }
  }
  return null;
}
