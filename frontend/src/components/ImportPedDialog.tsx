import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { importPed, ValidationIssueCode } from "../io/ped/index.js";
import type { IssueSeverity } from "../io/ped/index.js";
import { importJson } from "../io/json/index.js";
import { importPhenopackets, isPhenopacketsJson } from "../io/phenopackets/index.js";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { PedTextBox } from "./PedTextBox";
import { readPedText, type PedTextReading } from "../io/ped/text";

/** Common shape of a PED or JSON import result, as rendered by this dialog. */
interface DialogResult {
  pedigrees: Array<{ familyId: string; pedigree: Pedigree }>;
  issues: Array<{ severity: IssueSeverity; code: string; message: string }>;
  hasErrors: boolean;
}

interface PendingImport {
  familyId: string;
  pedigree: Pedigree;
  title: string;
}

interface ImportPedDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (pedigrees: PendingImport[]) => void;
}

export function ImportPedDialog({ open, onClose, onImport }: ImportPedDialogProps) {
  const [result, setResult] = useState<DialogResult | null>(null);
  const [selectedFids, setSelectedFids] = useState<Set<string>>(new Set());
  const [baseTitle, setBaseTitle] = useState("Imported pedigree");
  const fileRef = useRef<HTMLInputElement>(null);
  // Text mode (#218): PED typed or pasted into a box, drawn as it is typed.
  const [textMode, setTextMode] = useState(false);
  const [pedText, setPedText] = useState("");
  const [reading, setReading] = useState<PedTextReading | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Derive default title from filename (strip extension)
    const name = file.name.replace(/\.(ped|fam|json)$/i, "");
    setBaseTitle(name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // Decided by content: a PED file never starts with "{", and a .json
      // file is either PedEdit's own or a Phenopackets family or pedigree.
      const isJson = /\.json$/i.test(file.name) || text.trimStart().startsWith("{");
      let imported: DialogResult;
      if (isJson && isPhenopacketsJson(text)) {
        imported = importPhenopackets(text);
      } else if (isJson) {
        const json = importJson(text);
        if (json.title) setBaseTitle(json.title);
        imported = {
          pedigrees: json.pedigree ? [{ familyId: "1", pedigree: json.pedigree }] : [],
          issues: json.issues,
          hasErrors: json.hasErrors,
        };
      } else {
        imported = importPed(text);
      }
      setResult(imported);
      // Default: select all families
      setSelectedFids(new Set(imported.pedigrees.map(p => p.familyId)));
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!result || result.hasErrors) return;

    const selected = result.pedigrees.filter(p => selectedFids.has(p.familyId));
    const pending: PendingImport[] = selected.map(p => ({
      familyId: p.familyId,
      pedigree: p.pedigree,
      title: result.pedigrees.length > 1
        ? `${baseTitle} (${p.familyId})`
        : baseTitle,
    }));
    onImport(pending);
    handleClose();
  }

  function handleOpenText() {
    // Read again: the box reads after a pause, and the click may come inside it.
    const now = readPedText(pedText);
    if (!now.current || !now.pedigree) return;
    onImport([{ familyId: now.familyId ?? "1", pedigree: now.pedigree, title: "Pedigree from PED text" }]);
    handleClose();
  }

  function handleClose() {
    setTextMode(false);
    setPedText("");
    setReading(null);
    setResult(null);
    setSelectedFids(new Set());
    setBaseTitle("Imported pedigree");
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  function toggleFid(fid: string) {
    setSelectedFids(prev => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  }

  const errors = result?.issues.filter(i => i.severity === "error") ?? [];
  const warnings = result?.issues.filter(i => i.severity === "warning") ?? [];
  const infos = result?.issues.filter(i => i.severity === "info") ?? [];
  const canImport = result !== null && !result.hasErrors && selectedFids.size > 0;

  if (textMode) {
    const canOpen = !!reading?.current && !!reading.pedigree;
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-5xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Type or paste PED text</DialogTitle>
          </DialogHeader>
          <PedTextBox text={pedText} onTextChange={setPedText} onReading={setReading} />
          <DialogFooter className="sm:justify-between">
            <button type="button" className="text-xs text-gray-500 underline hover:text-gray-800" onClick={() => setTextMode(false)}>
              or choose a file
            </button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button disabled={!canOpen} onClick={handleOpenText} data-testid="ped-text-open">Open in editor</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Import PED or JSON file</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".ped,.fam,.json"
            onChange={handleFileChange}
            className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:text-xs file:border file:border-gray-300 file:rounded file:bg-white hover:file:bg-gray-50"
          />
          {/* Not on small screens: a box and a chart side by side need the width. */}
          <button
            type="button"
            className="max-lg:hidden text-xs text-gray-500 underline hover:text-gray-800"
            onClick={() => { setResult(null); setTextMode(true); }}
            data-testid="ped-text-link"
          >
            or type or paste PED text
          </button>

          {result && (
            <>
              {/* Errors */}
              {errors.length > 0 && (
                <IssueGroup
                  label="Errors"
                  items={errors}
                  className="border border-red-200 bg-red-50 rounded p-2"
                  labelClass="text-red-700 font-medium"
                  itemClass="text-red-600"
                />
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <IssueGroup
                  label="Warnings"
                  items={warnings}
                  className="border border-amber-200 bg-amber-50 rounded p-2"
                  labelClass="text-amber-700 font-medium"
                  itemClass="text-amber-600"
                />
              )}

              {/* Info */}
              {infos.filter(i => i.code !== ValidationIssueCode.MULTIPLE_FAMILIES).length > 0 && (
                <IssueGroup
                  label="Info"
                  items={infos.filter(i => i.code !== ValidationIssueCode.MULTIPLE_FAMILIES)}
                  className="border border-gray-200 bg-gray-50 rounded p-2"
                  labelClass="text-gray-600 font-medium"
                  itemClass="text-gray-500"
                />
              )}

              {/* Ready badge */}
              {!result.hasErrors && (
                <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
                  Ready to import — {result.pedigrees.reduce((s, p) => s + p.pedigree.individuals.length, 0)} individual(s) across {result.pedigrees.length} family(s)
                </div>
              )}

              {/* Multi-family selector */}
              {!result.hasErrors && result.pedigrees.length > 1 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-gray-700">Select families to import:</div>
                  {result.pedigrees.map(p => (
                    <label key={p.familyId} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFids.has(p.familyId)}
                        onChange={() => toggleFid(p.familyId)}
                      />
                      <span>Family {p.familyId} ({p.pedigree.individuals.length} individuals)</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button disabled={!canImport} onClick={handleImport}>
            Import{selectedFids.size > 1 ? ` (${selectedFids.size} families)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface IssueGroupProps {
  label: string;
  items: Array<{ message: string }>;
  className: string;
  labelClass: string;
  itemClass: string;
}

function IssueGroup({ label, items, className, labelClass, itemClass }: IssueGroupProps) {
  const visible = items.slice(0, 5);
  const overflow = items.length - visible.length;
  return (
    <div className={className}>
      <div className={`text-xs mb-1 ${labelClass}`}>{label} ({items.length})</div>
      <ul className="space-y-0.5">
        {visible.map((issue, i) => (
          <li key={i} className={`text-xs ${itemClass}`}>{issue.message}</li>
        ))}
        {overflow > 0 && (
          <li className={`text-xs ${itemClass} italic`}>…and {overflow} more</li>
        )}
      </ul>
    </div>
  );
}
