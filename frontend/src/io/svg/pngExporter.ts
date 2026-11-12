import { DEFAULT_PNG_DPI, pngSizeForDpi, setPngDpi } from "./pngDpi";

/** Width and height (CSS px) from the root of an exported SVG string, or null. */
export function svgPixelSize(svgString: string): { width: number; height: number } | null {
  const match = svgString.match(/width="(\d+\.?\d*)"[^>]*height="(\d+\.?\d*)"/);
  return match ? { width: parseFloat(match[1]), height: parseFloat(match[2]) } : null;
}

/**
 * Rasterise an SVG string to a PNG Blob at `dpi` (#18), taking the SVG's CSS
 * pixels as 96 to the inch, and record the DPI in a pHYs chunk so the image
 * keeps its printed size in Word and journal systems. When the pedigree is
 * too large for a browser canvas at that DPI it is drawn at the highest DPI
 * that fits (`pngSizeForDpi`), and that DPI is what the file records.
 * Requires a browser environment (Canvas API).
 */
export function exportPng(svgString: string, dpi = DEFAULT_PNG_DPI): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgSize = svgPixelSize(svgString);
    if (!svgSize) {
      reject(new Error("SVG string missing width/height attributes"));
      return;
    }
    const size = pngSizeForDpi(svgSize.width, svgSize.height, dpi);

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = size.width;
      canvas.height = size.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error(`The browser could not make a ${size.width} x ${size.height} px canvas`));
        return;
      }
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (pngBlob) => {
          if (!pngBlob) {
            reject(new Error(`The browser could not encode a ${size.width} x ${size.height} px PNG. Try a lower resolution.`));
            return;
          }
          pngBlob.arrayBuffer().then(
            (buf) => resolve(new Blob([setPngDpi(new Uint8Array(buf), size.dpi)], { type: "image/png" })),
            reject,
          );
        },
        "image/png",
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG as image"));
    };

    img.src = url;
  });
}
