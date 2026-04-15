import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { exportSvg, exportUShapeSvg, exportPng, exportPdf } from "../io/svg/index";
import type { Pedigree } from "@pedigree-editor/layout-engine";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pedigree: Pedigree;
  title: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportDialog({ open, onOpenChange, pedigree, title }: ExportDialogProps) {
  const [format, setFormat]         = useState<"svg" | "png" | "pdf">("svg");
  const [deident, setDeident]       = useState(false);
  const [ageBuckets, setAgeBuckets] = useState(false);
  const [pngScale, setPngScale]     = useState<1 | 2 | 3>(2);
  const [uShape, setUShape]         = useState(false);
  const [busy, setBusy]             = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      const exportFn = uShape ? exportUShapeSvg : exportSvg;
      const svgString = exportFn(pedigree, {
        deidentify: deident,
        ageBuckets: deident && ageBuckets,
        title: deident ? undefined : title,
      });

      if (format === "svg") {
        downloadBlob(new Blob([svgString], { type: "image/svg+xml" }), `${title}.svg`);
      } else if (format === "png") {
        const blob = await exportPng(svgString, pngScale);
        downloadBlob(blob, `${title}.png`);
      } else {
        const blob = await exportPdf(svgString, title);
        downloadBlob(blob, `${title}.pdf`);
      }

      onOpenChange(false);
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

          {/* PNG scale — only when PNG selected */}
          {format === "png" && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-gray-700">Resolution</div>
              <div className="flex gap-4">
                {([1, 2, 3] as const).map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="pngScale"
                      value={s}
                      checked={pngScale === s}
                      onChange={() => setPngScale(s)}
                    />
                    {s}×{s === 2 && " (retina)"}
                  </label>
                ))}
              </div>
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
          </div>

          {/* U-shape layout */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={uShape}
                onChange={e => setUShape(e.target.checked)}
              />
              <span className="font-medium">U-shape layout (horseshoe)</span>
            </label>
          </div>
        </div>

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
