import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { pedigreeApi, tagPresetApi } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import { requestErrorMessage } from "../api/errors";
import { backupStatement } from "../utils/backupStatement";

/**
 * "Delete account". Says what goes before it goes: the account, every
 * pedigree it owns and its My library, all at once (`DELETE /api/auth/me/`).
 * Pedigrees made while signed out belong to no account and are kept.
 */
export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const deleteAccount = useAppStore(s => s.deleteAccount);
  const [counts, setCounts] = useState<{ pedigrees: number; library: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCounts(null);
    setError(null);
    let live = true;
    Promise.all([pedigreeApi.list(), tagPresetApi.list()])
      .then(([p, t]) => { if (live) setCounts({ pedigrees: p.data.length, library: t.data.length }); })
      .catch(err => { if (live) setError(requestErrorMessage(err, "Could not read your account. Check your connection and try again.")); });
    return () => { live = false; };
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      onClose();
    } catch (err) {
      setError(requestErrorMessage(err, "Could not delete the account. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md" aria-describedby={undefined} data-testid="delete-account-dialog">
        <DialogHeader>
          <DialogTitle>Delete your account</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-xs text-gray-600">
          <p>
            This deletes from the server, at once:
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>your account: the name and email address from Google or GitHub</li>
            <li>
              {counts ? plural(counts.pedigrees, "pedigree", "pedigrees") : "the pedigrees"} you created while
              signed in
            </li>
            <li>
              {counts ? plural(counts.library, "entry", "entries") : "the entries"} in My library
            </li>
          </ul>
          <p>
            It cannot be undone. Export any pedigree you want to keep first. Pedigrees created while signed out
            are not part of an account and are not deleted.
          </p>
          <p>{backupStatement()}</p>
          <p>Signing in again later makes a new, empty account.</p>
          {error && <p className="text-red-600" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-8 text-xs" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
            onClick={confirm}
            disabled={busy || !counts}
          >
            {busy ? "Deleting…" : "Delete account permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
