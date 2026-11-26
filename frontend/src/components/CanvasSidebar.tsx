import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { usePedigreeFields } from "@/store/usePedigreeStore";
import type { PedigreeMeta } from "@/api/client";
import { requestErrorMessage } from "@/api/errors";
import { DEFAULT_PEDIGREE_NAME } from "@/pedigree/labels";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** The issue tracker, not the new-issue form, so people can search for an existing report first. */
const ISSUES_URL = "https://github.com/SACGF/pededit/issues";
/**
 * The repository, for self-hosting with clinical data. Clinicians
 * hand this to whoever runs their servers, who finds INSTALL.md from there.
 */
const REPO_URL = "https://github.com/SACGF/pededit";

/**
 * The editor's left sidebar: sign in or out, the signed-in user's pedigrees
 * (new, import, rename by double-click), where an anonymous pedigree is
 * kept, how to use the canvas, feedback links and the Save button. Small
 * screens hide it until `open`, and then it lies over the canvas.
 */
export function CanvasSidebar({ open, onImportClick }: { open: boolean; onImportClick: () => void }) {
  const navigate = useNavigate();
  const {
    isAuthenticated, pedigrees, activePedigreeId, example: openExampleInfo,
    createPedigree, logout, saveActivePedigree, renamePedigree,
  } = useAppStore();
  const { isDirty, setNotice, uShapeView } = usePedigreeFields("isDirty", "setNotice", "uShapeView");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleNew = async () => {
    let newId: string;
    try {
      newId = await createPedigree(DEFAULT_PEDIGREE_NAME);
    } catch (err) {
      setNotice({ kind: "error", text: requestErrorMessage(err, "Could not create the pedigree. Check your connection and try again.") });
      return;
    }
    navigate(`/p/${newId}`);
    setEditingId(newId);
    setEditingName(DEFAULT_PEDIGREE_NAME);
  };

  const startEditing = (p: PedigreeMeta) => {
    setEditingId(p.id);
    setEditingName(p.title);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim() || DEFAULT_PEDIGREE_NAME;
    await renamePedigree(editingId, trimmed);
    setEditingId(null);
  };

  return (
    <div
      className={`${open ? "flex absolute inset-y-0 left-0 z-30" : "hidden"} lg:flex lg:static w-56 border-r bg-white flex-col shrink-0`}
      data-testid="sidebar"
    >
      <div className="p-3 border-b flex items-center justify-between">
        <button
          className="text-xs font-medium hover:underline"
          onClick={() => navigate("/")}
        >
          PedEdit
        </button>
        {isAuthenticated ? (
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={logout}>
            Sign out
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => navigate("/login")}>
            Sign in
          </Button>
        )}
      </div>

      <div className="p-3 flex-1 overflow-y-auto">
        {isAuthenticated ? (
          <>
            <Button size="sm" className="w-full mb-1 h-7 text-xs" onClick={handleNew}>
              New pedigree
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full mb-2 h-7 text-xs"
              onClick={onImportClick}
            >
              Import PED/JSON…
            </Button>
            <ul className="space-y-0.5">
              {pedigrees.map((p) => (
                <li key={p.id}>
                  {editingId === p.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-hidden focus:ring-1 focus:ring-black"
                    />
                  ) : (
                    <button
                      className={`
                        w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100
                        ${activePedigreeId === p.id ? "bg-gray-100 font-medium" : ""}
                      `}
                      onClick={() => navigate(`/p/${p.id}`)}
                      onDoubleClick={(e) => { e.preventDefault(); startEditing(p); }}
                      title={`Created: ${formatDate(p.created)}\nModified: ${formatDate(p.updated)}`}
                    >
                      <span className="block truncate">{p.title}</span>
                      <span className="text-[9px] text-gray-400 font-normal">{relativeTime(p.updated)}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="text-[10px] text-gray-400 leading-relaxed">
            <p className="mb-2">
              {openExampleInfo
                ? "This example is not saved. Change anything and it is saved as your own copy, at a new URL that you can bookmark or share."
                : <>This pedigree is saved at this URL and nowhere else. Bookmark it or copy the link to come back to it.
                  The home page also lists it under "Recent on this device" in this browser.</>}
            </p>
            <p>
              <span
                className="text-black underline underline-offset-1 cursor-pointer"
                onClick={() => navigate("/login")}
              >
                Sign in
              </span>
              {" "}to see all your pedigrees in one place.
            </p>
          </div>
        )}
      </div>

      {/* How to select and move around: there is no select mode (#122), so it is said here, always in view. */}
      <div className="px-3 py-2 border-t text-[11px] text-gray-500 leading-snug" data-testid="canvas-help">
        <p className="text-gray-700 mb-1">{uShapeView ? "Using the U-shape view" : "Using the canvas"}</p>
        {/* By touch, in place of the list below. */}
        <ul className="space-y-0.5 hidden pointer-coarse:block">
          <li>Tap a person to see and edit them</li>
          <li>Add relatives and find more options from the buttons shown for a selected person</li>
          <li>Drag to pan, pinch to zoom</li>
          <li>Selecting several people needs a mouse or keyboard</li>
        </ul>
        {uShapeView ? (
        <ul className="space-y-0.5 pointer-coarse:hidden">
          <li>Click a person to select them and edit them on the Person tab</li>
          <li><b className="font-medium text-gray-700">Shift+click</b> to add or remove from the selection</li>
          <li>Drag to pan, scroll to zoom</li>
          <li>The U is laid out for you: nobody is dragged, and there are no menus on it</li>
        </ul>
        ) : (
        <ul className="space-y-0.5 pointer-coarse:hidden">
          <li>Click a person to select and edit them</li>
          <li><b className="font-medium text-gray-700">Shift+click</b> to add or remove from the selection</li>
          <li><b className="font-medium text-gray-700">Shift+drag</b> to select an area</li>
          <li>Drag the background to pan, scroll to zoom</li>
          <li>Right-click a person or couple line for more</li>
        </ul>
        )}
      </div>

      {/* Feedback and self-hosting */}
      <div className="px-3 py-2 border-t text-[10px] text-gray-400 leading-relaxed" data-testid="feedback-links">
        <p>
          Found a bug or want a feature?{" "}
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-black underline underline-offset-1"
          >
            Tell us on GitHub
          </a>
        </p>
        <p className="mt-1">
          PedEdit is open source. For patient data, you can{" "}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-black underline underline-offset-1"
          >
            host your own copy
          </a>{" "}
          so it stays on your network.
        </p>
      </div>

      {/* Save button */}
      <div className="p-3 border-t">
        <Button
          size="sm"
          variant={isDirty ? "default" : "outline"}
          className="w-full h-7 text-xs"
          onClick={saveActivePedigree}
          disabled={!isDirty}
        >
          {isDirty ? "Save" : openExampleInfo ? "Not saved (example)" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
