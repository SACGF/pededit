import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  exportSvg, exportUShapeSvg, exportPng, exportPdf,
  svgPixelSize, pngSizeForDpi, PNG_DPI_CHOICES, DEFAULT_PNG_DPI, CSS_PX_PER_INCH,
  DEIDENTIFY_KEEP_DEFAULTS, deidentifiableText,
} from "../io/svg/index";
import type { DeidentifyKeep } from "../io/svg/index";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { chartTitle } from "../pedigree/labels";
import { clinicalDetailLines } from "../pedigree/clinicalDetails";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { uShapeExportLayout } from "../pedigree/uShapeView";
import { selectionLabel, selectionPedigree, selectionSubset } from "../pedigree/selectionSubset";
import { downloadBlob } from "../utils/download";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pedigree: Pedigree;
  /** The pedigree's name: the file name, and the chart title unless the pedigree sets its own. */
  title: string;
  /** Initial state of the compact toggle, normally the canvas setting. */
  defaultCompact?: boolean;
}

export function ExportDialog({ open, onOpenChange, pedigree: whole, title, defaultCompact = false }: ExportDialogProps) {
  const [format, setFormat]         = useState<"svg" | "png" | "pdf">("svg");
  const [deident, setDeident]       = useState(false);
  const [ageBuckets, setAgeBuckets] = useState(false);
  // Free text a de-identified export keeps. Like the other choices
  // here, they last while the page is open and are not saved.
  const [keep, setKeep]             = useState<DeidentifyKeep>(DEIDENTIFY_KEEP_DEFAULTS);
  const setKept = (key: keyof DeidentifyKeep, value: boolean) => setKeep(k => ({ ...k, [key]: value }));
  const [pngDpi, setPngDpi]         = useState<number>(DEFAULT_PNG_DPI);
  const [error, setError]           = useState<string | null>(null);
  const [uShape, setUShape]         = useState(false);
  const [busy, setBusy]             = useState(false);

  const [uPartners, setUPartners]   = useState(true);
  const [compact, setCompact]       = useState(defaultCompact);
  const [onlySelected, setOnlySelected] = useState(false);

  // Follow the canvas setting each time the dialog opens.
  useEffect(() => {
    if (open) setCompact(defaultCompact);
    if (open) setError(null);
    // An ordinary export draws everyone, whatever was ticked last time.
    if (open) setOnlySelected(false);
  }, [open, defaultCompact]);

  // The people selected on the canvas: with two or more, the figure can be of them alone.
  const selectedIds = usePedigreeStore(s => s.selectedIds);
  // A figure of the selected people alone, with whoever joins them into one chart.
  const subset = useMemo(
    () => (open && selectedIds.length >= 2 ? selectionSubset(whole, selectedIds) : null),
    [open, whole, selectedIds],
  );
  const subsetOffered = !!subset && subset.selected.length >= 2;
  const useSubset = onlySelected && subsetOffered && subset.joined;
  // What the figure is drawn from. The title still comes from the whole pedigree's name.
  const pedigree = useMemo(
    () => (useSubset && subset ? selectionPedigree(whole, subset) : whole),
    [useSubset, subset, whole],
  );

  // The U shape is a descendant chart of one founder couple. With nobody to
  // descend from there is nothing to bend, so the option is switched off.
  const uFigure = useMemo(
    () => (open ? uShapeExportLayout(pedigree, uPartners) : null),
    [open, pedigree, uPartners],
  );
  const uAvailable = !!uFigure?.layout && uFigure.layout.maxDepth > 0;
  const useU = uShape && uAvailable;
  const omittedCount = uFigure?.omitted ?? 0;

  // The SVG every format is made from. Built while the dialog is open so the
  // PNG option can show the pixel and printed size it will produce.
  const svgString = useMemo(() => {
    if (!open) return null;
    const exportFn = useU ? exportUShapeSvg : exportSvg;
    return exportFn(pedigree, {
      deidentify: deident,
      ageBuckets: deident && ageBuckets,
      deidentifyKeep: keep,
      // The chart title, as on the canvas. A de-identified export has none.
      title: deident ? undefined : chartTitle(pedigree, title) || undefined,
      uShapePartners: uPartners,
      compact,
    });
  }, [open, useU, pedigree, deident, ageBuckets, keep, title, uPartners, compact]);

  // Which free-text choices this pedigree has anything for.
  const freeText = useMemo(() => (open && deident ? deidentifiableText(pedigree) : null), [open, deident, pedigree]);
  const keepBox = (key: keyof DeidentifyKeep, label: string, indent = "ml-5") => (
    <label className={`flex items-center gap-2 text-xs cursor-pointer ${indent}`}>
      <input
        type="checkbox"
        data-testid={`deidentify-keep-${key}`}
        checked={keep[key]}
        onChange={e => setKept(key, e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );

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

          {/* PNG resolution, only when PNG selected */}
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
            {freeText?.evaluationDetail && (
              <>
                {keepBox("evaluationDetail", "Include evaluation details (BRCA1 c.5266dupC …)")}
                {!keep.evaluationDetail && keepBox("evaluationMarks", "Keep the result (+ / - / u) without the detail", "ml-10")}
              </>
            )}
            {freeText?.onset && keepBox("onset", "Include age of onset")}
            {freeText?.consanguinityLabels && keepBox("consanguinityLabels", "Include the relationship text above double lines")}
            {freeText?.textTags && keepBox("textTags", "Include text tags (genotypes …)")}
            {freeText?.childlessReason && keepBox("childlessReason", "Include the reason under no-children marks")}
            {deident && clinicalDetailLines(pedigree).length > 0 && (
              <p className="text-[10px] text-gray-500 ml-5">The clinical details (referral, ancestry, historian, recorder, date) are left out.</p>
            )}
          </div>

          {/* Part of the chart: the people selected on the canvas */}
          {subsetOffered && subset && (
            <div className="space-y-1.5">
              <label className={`flex items-center gap-2 text-xs ${subset.joined ? "cursor-pointer" : "text-muted-foreground"}`}>
                <input
                  type="checkbox"
                  data-testid="export-only-selected"
                  checked={useSubset}
                  disabled={!subset.joined}
                  onChange={e => setOnlySelected(e.target.checked)}
                />
                <span className="font-medium">{selectionLabel(subset)}</span>
              </label>
              {!subset.joined && (
                <p className="text-xs text-muted-foreground ml-5">
                  The selected people are in separate families with nobody to join them into one chart.
                </p>
              )}
            </div>
          )}

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
                    ` ${omittedCount} of ${uFigure!.total} people ${omittedCount === 1 ? "is" : "are"} outside that line` +
                    `${uFigure!.notDrawn > 0 ? " or not drawn on the chart" : ""} and will be left out.`}
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
