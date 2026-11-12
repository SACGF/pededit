import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  exportSvg, exportUShapeSvg, layoutUShape, exportPng, exportPdf,
  svgPixelSize, pngSizeForDpi, PNG_DPI_CHOICES, DEFAULT_PNG_DPI, CSS_PX_PER_INCH,
} from "../io/svg/index";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { chartTitle } from "../pedigree/labels";
import { clinicalDetailLines } from "../pedigree/clinicalDetails";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pedigree: Pedigree;
  /** The pedigree's name: the file name, and the chart title unless the pedigree sets its own. */
  title: string;
  /** Initial state of the compact toggle, normally the canvas setting. */
  defaultCompact?: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportDialog({ open, onOpenChange, pedigree, title, defaultCompact = false }: ExportDialogProps) {
  const [format, setFormat]         = useState<"svg" | "png" | "pdf">("svg");
  const [deident, setDeident]       = useState(false);
  const [ageBuckets, setAgeBuckets] = useState(false);
  const [pngDpi, setPngDpi]         = useState<number>(DEFAULT_PNG_DPI);
  const [error, setError]           = useState<string | null>(null);
  const [uShape, setUShape]         = useState(false);
  const [busy, setBusy]             = useState(false);

  const [uPartners, setUPartners]   = useState(true);
  const [compact, setCompact]       = useState(defaultCompact);

  // Follow the canvas setting each time the dialog opens.
  useEffect(() => {
    if (open) setCompact(defaultCompact);
    if (open) setError(null);
  }, [open, defaultCompact]);

  // The U shape is a descendant chart of one founder couple. With nobody to
  // descend from there is nothing to bend, so the option is switched off.
  const uLayout = useMemo(
    () => (open ? layoutUShape(pedigree, { partners: uPartners }) : null),
    [open, pedigree, uPartners],
  );
  const uAvailable = !!uLayout && uLayout.maxDepth > 0;
  const useU = uShape && uAvailable;
  const omittedCount = uLayout?.omitted.length ?? 0;

  // The SVG every format is made from. Built while the dialog is open so the
  // PNG option can show the pixel and printed size it will produce.
  const svgString = useMemo(() => {
    if (!open) return null;
    const exportFn = useU ? exportUShapeSvg : exportSvg;
    return exportFn(pedigree, {
      deidentify: deident,
      ageBuckets: deident && ageBuckets,
      // The chart title (#20), as on the canvas. A de-identified export has none.
      title: deident ? undefined : chartTitle(pedigree, title) || undefined,
      uShapePartners: uPartners,
      compact,
    });
  }, [open, useU, pedigree, deident, ageBuckets, title, uPartners, compact]);

  const svgSize = svgString ? svgPixelSize(svgString) : null;
  const pngSize = svgSize ? pngSizeForDpi(svgSize.width, svgSize.height, pngDpi) : null;
  const cm = (cssPx: number) => (cssPx / CSS_PX_PER_INCH * 2.54).toFixed(1);

  async function handleDownload() {
    if (!svgString) return;
    setBusy(true);
    setError(null);
    try {

      if (format === "svg") {
        downloadBlob(new Blob([svgString], { type: "image/svg+xml" }), `${title}.svg`);
      } else if (format === "png") {
        const blob = await exportPng(svgString, pngDpi);
        downloadBlob(blob, `${title}.png`);
      } else {
        const blob = await exportPdf(svgString, title);
        downloadBlob(blob, `${title}.pdf`);
      }

      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Export pedigree</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-gray-700">Format</div>
            <div className="flex gap-4">
              {(["svg", "png", "pdf"] as const).map(f => (
                <label key={f} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                  />
                  {f.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          {/* PNG resolution (#18), only when PNG selected */}
          {format === "png" && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-gray-700">Resolution</div>
              <div className="flex gap-4">
                {PNG_DPI_CHOICES.map(d => (
                  <label key={d} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="pngDpi"
                      value={d}
                      checked={pngDpi === d}
                      onChange={() => setPngDpi(d)}
                    />
                    {d} dpi{d === CSS_PX_PER_INCH && " (screen)"}
                  </label>
                ))}
              </div>
              {svgSize && pngSize && (
                <p className="text-xs text-muted-foreground" data-testid="png-size">
                  {pngSize.width} × {pngSize.height} px, printed {cm(svgSize.width)} × {cm(svgSize.height)} cm
                  {pngSize.capped &&
                    `. Too large for a browser at ${pngDpi} dpi, so it will be saved at ${pngSize.dpi} dpi at the same printed size. Use SVG or PDF for full resolution.`}
                </p>
              )}
            </div>
          )}

          {/* De-identification */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={deident}
                onChange={e => setDeident(e.target.checked)}
              />
              <span className="font-medium">De-identify (replace names with I-1, II-2 … notation)</span>
            </label>

            {deident && (
              <label className="flex items-center gap-2 text-xs cursor-pointer ml-5">
                <input
                  type="checkbox"
                  checked={ageBuckets}
                  onChange={e => setAgeBuckets(e.target.checked)}
                />
                <span>Include age range (infant / child / 30s …)</span>
              </label>
            )}
            {deident && clinicalDetailLines(pedigree).length > 0 && (
              <p className="text-[10px] text-gray-500 ml-5">The clinical details (referral, ancestry, historian, recorder, date) are left out.</p>
            )}
          </div>

          {/* Compact spacing (standard layout only; the U shape has its own geometry) */}
          {!useU && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={compact}
                  onChange={e => setCompact(e.target.checked)}
                />
                <span className="font-medium">Compact layout (tighter spacing between generations)</span>
              </label>
            </div>
          )}

          {/* U-shape layout */}
          <div className="space-y-1.5">
            <label className={`flex items-center gap-2 text-xs ${uAvailable ? "cursor-pointer" : "text-muted-foreground"}`}>
              <input
                type="checkbox"
                checked={useU}
                disabled={!uAvailable}
                onChange={e => setUShape(e.target.checked)}
              />
              <span className="font-medium">Render in U shape (for very wide pedigrees)</span>
            </label>

            {!uAvailable && (
              <p className="text-xs text-muted-foreground ml-5">
                Needs a couple with descendants. This pedigree has none to bend around a U.
              </p>
            )}

            {useU && (
              <>
                <label className="flex items-center gap-2 text-xs cursor-pointer ml-5">
                  <input
                    type="checkbox"
                    checked={uPartners}
                    onChange={e => setUPartners(e.target.checked)}
                  />
                  <span>Include married-in partners</span>
                </label>
                <p className="text-xs text-muted-foreground ml-5">
                  Draws one founding couple and their descendants
                  {uPartners ? ", each with their partners." : " by blood only."}
                  {omittedCount > 0 &&
                    ` ${omittedCount} of ${pedigree.individuals.length} individuals ${omittedCount === 1 ? "is" : "are"} outside that line and will be left out.`}
                </p>
              </>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-red-700" role="alert">Export failed: {error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleDownload} disabled={busy}>
            {busy ? "Exporting…" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
