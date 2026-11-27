import { useMemo, useState } from "react";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { exportPed } from "../io/ped/index.js";
import { exportLosses, lossLines } from "../io/losses.js";
import { PedTextBox } from "./PedTextBox";

/**
 * "View as text" in the Export PED menu (#218): the PED the PLINK export
 * writes, read-only in the text box beside the chart it draws, with Copy.
 */
export function PedTextViewDialog({ pedigree, open, onClose }: { pedigree: Pedigree; open: boolean; onClose: () => void }) {
  const text = useMemo(() => open ? exportPed(pedigree, { familyId: "1" }) : "", [pedigree, open]);
  const losses = useMemo(() => open ? lossLines(exportLosses(pedigree, "plink")) : [], [pedigree, open]);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }

  function close() {
    setCopied(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>PED text</DialogTitle>
          <DialogDescription>
            The PLINK PED file this pedigree exports as, and the chart that file draws.
            {losses.length > 0 && ` PED cannot carry ${losses.length === 1 ? "this" : `these ${losses.length}`}:`}
          </DialogDescription>
        </DialogHeader>
        {losses.length > 0 && (
          <ul className="text-xs text-gray-700 max-h-24 overflow-y-auto list-disc pl-5" data-testid="ped-text-losses">
            {losses.map((line, k) => <li key={k}>{line}</li>)}
          </ul>
        )}
        {open && <PedTextBox text={text} readOnly />}
        <DialogFooter className="gap-2 sm:items-center">
          {copied === "failed" && <span className="text-xs text-red-600">The browser refused to copy. Select the text and copy it instead.</span>}
          <Button variant="outline" onClick={close}>Close</Button>
          <Button onClick={copy} data-testid="ped-text-copy">{copied === "yes" ? "Copied" : "Copy"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
