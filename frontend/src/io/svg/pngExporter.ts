/**
 * Rasterise an SVG string to a PNG Blob at the given scale factor.
 * scale=2 produces a Retina-density image (recommended for journal submission).
 * Requires a browser environment (Canvas API).
 */
export function exportPng(svgString: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const match = svgString.match(/width="(\d+\.?\d*)"[^>]*height="(\d+\.?\d*)"/);
    if (!match) {
      reject(new Error("SVG string missing width/height attributes"));
      return;
    }
    const svgWidth  = parseFloat(match[1]);
    const svgHeight = parseFloat(match[2]);

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = Math.ceil(svgWidth  * scale);
      canvas.height = Math.ceil(svgHeight * scale);

      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (pngBlob) => {
          URL.revokeObjectURL(url);
          if (pngBlob) resolve(pngBlob);
          else reject(new Error("canvas.toBlob returned null"));
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
