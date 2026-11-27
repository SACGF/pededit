import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  exportSvg, exportUShapeSvg, exportPng, exportPdf,
  svgPixelSize, pngSizeForDpi, PNG_DPI_CHOICES, DEFAULT_PNG_DPI, CSS_PX_PER_INCH,
  DEIDENTIFY_KEEP_DEFAULTS, deidentifiableText,
} from "../io/svg/index";
import type { DeidentifyKeep } from "../io/svg/index";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { chartTitle, showsNotes } from "../pedigree/labels";
import { KEY_POSITIONS, keyPositionOf } from "../io/svg/keyPlacement";
import type { KeyPosition } from "../io/svg/types";
import type { KeyPositionSetting } from "../utils/keyPositionSetting";
import { clinicalDetailLines, type ClinicalDetailField } from "../pedigree/clinicalDetails";
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
  /** "Key position in exports" from Settings: the corner picked when the dialog opens, or "auto". */
  defaultKeyPosition?: KeyPositionSetting;
}

export function ExportDialog({ open, onOpenChange, pedigree: whole, title, defaultCompact = false, defaultKeyPosition = "auto" }: ExportDialogProps) {
  const [format, setFormat]         = useState<"svg" | "png" | "pdf">("svg");
  const [deident, setDeident]       = useState(false);
  const [ageBuckets, setAgeBuckets] = useState(false);
  // Free text a de-identified export keeps. Like the other choices
  // here, they last while the page is open and are not saved.
  const [keep, setKeep]             = useState<DeidentifyKeep>(DEIDENTIFY_KEEP_DEFAULTS);
  const setKept = (key: keyof DeidentifyKeep, value: boolean) => setKeep(k => ({ ...k, [key]: value }));
  // Clinical details a de-identified export keeps: none at first, each added back by hand.
  const [keepClinical, setKeepClinical] = useState<readonly ClinicalDetailField[]>([]);
  const setClinicalKept = (field: ClinicalDetailField, value: boolean) =>
    setKeepClinical(k => (value ? [...k.filter(f => f !== field), field] : k.filter(f => f !== field)));
  const [pngDpi, setPngDpi]         = useState<number>(DEFAULT_PNG_DPI);
  const [error, setError]           = useState<string | null>(null);
  const [uShape, setUShape]         = useState(false);
  const [busy, setBusy]             = useState(false);

  const [uPartners, setUPartners]   = useState(true);
  const [compact, setCompact]       = useState(defaultCompact);
  const [onlySelected, setOnlySelected] = useState(false);
  // The key's corner for this export: null follows the best corner, which
  // changes with what is drawn; a click picks one until the dialog closes.
  const [keyCorner, setKeyCorner] = useState<KeyPosition | null>(defaultKeyPosition === "auto" ? null : defaultKeyPosition);

  // Each time the dialog opens: follow the canvas setting, and draw
  // everyone, whatever was ticked last time. Set during render, so the
  // first frame already shows them.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCompact(defaultCompact);
      setError(null);
      setOnlySelected(false);
      setKeyCorner(defaultKeyPosition === "auto" ? null : defaultKeyPosition);
      // Notes are the free text most likely to name someone: including
      // them is chosen afresh for each export, not carried over.
      setKept("notes", false);
    }
  }

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
      deidentifyKeepClinical: keepClinical,
      // The chart title, as on the canvas. A de-identified export has none.
      title: deident ? undefined : chartTitle(pedigree, title) || undefined,
      uShapePartners: uPartners,
      compact,
      ...(keyCorner ? { keyPosition: keyCorner } : {}),
    });
  }, [open, useU, pedigree, deident, ageBuckets, keep, keepClinical, title, uPartners, compact, keyCorner]);
  // The corner the key is in: the one picked, or the best one, read from the figure.
  const shownCorner = svgString ? keyPositionOf(svgString) : undefined;

  // Notes can be hidden by the pedigree setting, so say so when there are some.
  const hasNotes = useMemo(() => open && pedigree.individuals.some(i => !!i.notes?.trim()), [open, pedigree]);

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

        {/* min-w-0: a long clinical detail is cut, not widening the dialog's grid column. */}
        <div className="space-y-4 min-w-0">
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

          {hasNotes && !showsNotes(pedigree) && (
            <p className="text-xs text-muted-foreground" data-testid="export-notes-hint">
              Notes are not drawn; turn on Show notes on the chart in Settings.
            </p>
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
            {freeText?.notes && showsNotes(pedigree) && (
              <>
                {keepBox("notes", "Include notes")}
                {keep.notes && (
                  <p className="text-[10px] text-gray-500 ml-10" data-testid="export-notes-warning">
                    Notes are free text: check them for names and dates before sharing.
                  </p>
                )}
              </>
            )}
            {deident && clinicalDetailLines(pedigree).map(({ field, label, value }) => (
              <label key={field} className="flex items-center gap-2 text-xs cursor-pointer ml-5 min-w-0">
                <input
                  type="checkbox"
                  data-testid={`deidentify-keep-clinical-${field}`}
                  checked={keepClinical.includes(field)}
                  onChange={e => setClinicalKept(field, e.target.checked)}
                />
                {/* The value too, so whoever exports sees what they would share. */}
                <span className="truncate min-w-0">Include {label}: <span className="text-gray-500">{value}</span></span>
              </label>
            ))}
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

          {/* The key's corner (#241), when the figure has a key */}
          {shownCorner && (
            <div className="flex items-center gap-3">
              <KeyCornerPicker value={shownCorner} onChange={setKeyCorner} />
              <div className="text-xs">
                <div className="font-medium">Key position</div>
                <p className="text-muted-foreground" data-testid="key-corner-hint">
                  {keyCorner ? "Picked for this export." : "The corner with most room."} The key uses the chart's empty space there.
                </p>
              </div>
            </div>
          )}
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

const CORNER_LABELS: Record<KeyPosition, string> = {
  "top-left": "Top left", "top-right": "Top right", "bottom-left": "Bottom left", "bottom-right": "Bottom right",
};

/** A small square standing for the figure, with a button in each corner; the key's corner is pressed. */
function KeyCornerPicker({ value, onChange }: { value: KeyPosition; onChange: (v: KeyPosition) => void }) {
  return (
    <div role="radiogroup" aria-label="Key position" className="relative w-14 h-10 border border-gray-400 shrink-0" data-testid="key-corner-picker">
      {KEY_POSITIONS.map(p => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          aria-label={CORNER_LABELS[p]}
          title={CORNER_LABELS[p]}
          data-key-corner={p}
          onClick={() => onChange(p)}
          className={`absolute w-4 h-3 border ${value === p ? "bg-black border-black" : "bg-white border-gray-400 hover:border-black"} ${p.startsWith("top") ? "top-0.5" : "bottom-0.5"} ${p.endsWith("left") ? "left-0.5" : "right-0.5"}`}
        />
      ))}
    </div>
  );
}
