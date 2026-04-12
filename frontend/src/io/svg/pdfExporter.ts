import jsPDF from "jspdf";
import "svg2pdf.js"; // jsPDF plugin for SVG rendering

export async function exportPdf(svgString: string, title: string): Promise<Blob> {
  // Parse SVG dimensions from the string
  const match = svgString.match(/width="(\d+\.?\d*)"[^>]*height="(\d+\.?\d*)"/);
  const svgWidth  = parseFloat(match?.[1] ?? "400");
  const svgHeight = parseFloat(match?.[2] ?? "300");

  // Fit to A4, landscape if wider than tall
  const landscape = svgWidth > svgHeight;
  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt" });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 30;
  const scale = Math.min((pageW - margin * 2) / svgWidth, (pageH - margin * 2) / svgHeight);

  const parser = new DOMParser();
  const svgEl = parser.parseFromString(svgString, "image/svg+xml").documentElement;
  await pdf.svg(svgEl, { x: margin, y: margin, width: svgWidth * scale, height: svgHeight * scale });

  return pdf.output("blob");
}
