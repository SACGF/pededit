import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BUILD_DATE, formatDate } from "../utils/buildInfo";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { ImportPedDialog } from "../components/ImportPedDialog";
import { DeleteAccountDialog } from "../components/DeleteAccountDialog";
import { EXAMPLES, EXAMPLE_GROUPS } from "../data/examples";
import { GUIDES, guidePath } from "../guides/guides";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { listRecentPedigrees, forgetRecentPedigree, type RecentPedigree } from "../utils/recentPedigrees";
import { requestErrorMessage } from "../api/errors";
import { YOUR_DATA_PATH } from "./YourDataPage";
import type { PedigreeMeta } from "../api/client";
import { DEFAULT_PEDIGREE_NAME } from "../pedigree/labels";

export default function LandingPage() {
  const { isAuthenticated, user, fetchMe, createPedigree, createPedigreeFromData, logout, pedigrees, loadPedigrees } = useAppStore();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  // Signed in, the account's pedigrees are listed first and left out of
  // Recent on this device, so both lists wait for them: a failed fetch shows
  // Recent in full and no account list.
  const [ownedLoaded, setOwnedLoaded] = useState(false);
  const [ownedFailed, setOwnedFailed] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let live = true;
    loadPedigrees()
      .catch(() => { if (live) setOwnedFailed(true); })
      .finally(() => { if (live) setOwnedLoaded(true); });
    return () => { live = false; };
  }, [isAuthenticated, loadPedigrees]);
  const listsReady = !isAuthenticated || ownedLoaded;
  const owned = isAuthenticated && !ownedFailed ? pedigrees : [];
  // Why the last create or import failed: the rate limit's wait, or a plain failure.
  const [createError, setCreateError] = useState<string | null>(null);

  // Populate user state after a page reload. fetchMe will trigger the token
  // refresh interceptor if the access token is expired, so this also warms up
  // the auth state before loadPedigrees runs.
  useEffect(() => {
    if (isAuthenticated && !user) {
      fetchMe().catch(() => { /* interceptor handles auth failures */ });
    }
  }, [isAuthenticated, user, fetchMe]);

  const handleCreateBlank = async () => {
    setLoading("blank");
    setCreateError(null);
    try {
      const id = await createPedigree(DEFAULT_PEDIGREE_NAME);
      navigate(`/p/${id}`);
    } catch (err) {
      setCreateError(requestErrorMessage(err, "Could not create the pedigree. Check your connection and try again."));
    } finally {
      setLoading(null);
    }
  };

  const handleImport = async (pending: { title: string; pedigree: Pedigree }[]) => {
    if (!pending.length) return;
    setLoading("import");
    setCreateError(null);
    let lastId: string | null = null;
    try {
      for (const { title, pedigree } of pending) {
        lastId = await createPedigreeFromData(title, pedigree);
      }
    } catch (err) {
      setCreateError(requestErrorMessage(err, "Could not save the imported pedigree. Check your connection and try again."));
      lastId = null;
    } finally {
      setLoading(null);
    }
    if (lastId) navigate(`/p/${lastId}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b px-8 py-4 flex items-center justify-between">
        <h1 className="text-lg font-medium tracking-tight">PedEdit</h1>
        <div className="flex items-center gap-1 sm:gap-3">
          {isAuthenticated ? (
            <>
              {/* Left out on a phone, where it squeezes against the name of the app. */}
              <span className="hidden sm:inline text-sm text-gray-500">
                {user?.first_name
                  ? `${user.first_name} ${user.last_name}`.trim()
                  : user?.email || user?.username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-sm px-3"
                onClick={logout}
              >
                Sign out
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-sm px-3 text-gray-400 hover:text-red-600"
                onClick={() => setDeleteAccountOpen(true)}
              >
                Delete account
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-sm px-3"
                onClick={() => navigate("/login")}
              >
                Sign in
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-16">
        <div className="w-full max-w-4xl">
          <p className="text-base text-gray-500 mb-3 max-w-xl">
            Automatic layout from <a href="https://cran.r-project.org/package=kinship2" target="_blank" rel="noopener noreferrer" className="text-black underline underline-offset-2">kinship2</a>, handling consanguinity and complex families. Drag-and-drop repositioning. <a href="https://github.com/SACGF/pededit" target="_blank" rel="noopener noreferrer" className="text-black underline underline-offset-2">Open source</a>.
          </p>
          {!isAuthenticated && (
            <p className="text-base text-gray-500 mb-8 max-w-xl">
              <span className="text-black font-medium">No account required.</span>{" "}
              Click a button below to start drawing. Each pedigree is saved at its own link, which is not listed anywhere: bookmark it to come back, or send it to a colleague. Anyone who has the link can open the pedigree.{" "}
              <span
                className="text-black underline underline-offset-2 cursor-pointer"
                onClick={() => navigate("/login")}
              >Sign in</span> to manage all your pedigrees in one place.
            </p>
          )}
          {isAuthenticated && <div className="mb-8" />}

          {/* Primary actions */}
          <div className="flex flex-wrap gap-2 mb-10">
            <Button
              className="h-8 text-sm px-4"
              onClick={handleCreateBlank}
              disabled={loading !== null}
            >
              {loading === "blank" ? "Creating…" : "Create blank pedigree"}
            </Button>
            <Button
              variant="outline"
              className="h-8 text-sm px-4"
              onClick={() => setImportOpen(true)}
              disabled={loading !== null}
            >
              Import from PED or JSON file…
            </Button>
          </div>
          {createError && (
            <p role="alert" data-testid="create-error" className="-mt-8 mb-10 text-sm text-red-600 max-w-xl">{createError}</p>
          )}
          {/* Pointer to /your-data */}
          <p className="-mt-7 mb-10 text-xs text-gray-400">
            Pedigrees are saved on this server.{" "}
            <Link to={YOUR_DATA_PATH} className="underline underline-offset-2 hover:text-gray-600">
              What is stored and who can read it
            </Link>
          </p>

          {listsReady && <MyPedigrees pedigrees={owned} />}

          {/* Recent on this device: per browser, no account needed */}
          {/* Keyed on sign-in so Delete account's forgotten pedigrees leave the list. */}
          {listsReady && (
            <RecentOnThisDevice
              key={String(isAuthenticated)}
              disabled={loading !== null}
              hiddenIds={new Set(owned.map(p => p.id))}
            />
          )}

          {/* Examples */}
          <div>
            <p className="text-sm text-gray-400 uppercase tracking-wider mb-3">
              Start from an example
            </p>
            {EXAMPLE_GROUPS.map(group => (
              <div key={group} className="mb-4">
                {group && (
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{group}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {EXAMPLES.map(ex => (ex.group ?? "") === group && (
                    // A link, so it can be copied or opened in a new tab; the copy is saved on its first edit.
                    <Link
                      key={ex.slug}
                      to={`/example/${ex.slug}`}
                      className="block text-left border rounded p-3 hover:bg-gray-50 transition-colors"
                    >
                      <span className="block text-sm font-medium mb-0.5">{ex.label}</span>
                      <span className="block text-xs text-gray-400">{ex.description}</span>
                      {ex.citation && (
                        <span className="block text-xs text-gray-400 mt-0.5">{ex.citation}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Guides (#202) */}
          <div className="mt-6" data-testid="guides">
            <p className="text-sm text-gray-400 uppercase tracking-wider mb-3">
              Guides
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {GUIDES.map(g => (
                <li key={g.slug}>
                  <Link to={guidePath(g.slug)} className="text-sm text-black underline underline-offset-2">{g.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-8 py-4 text-center text-sm text-gray-400">
        <a
          href="https://github.com/SACGF/pededit"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          GitHub
        </a>
        <span className="mx-2 text-gray-300">·</span>
        <Link to="/guides" className="hover:text-gray-600 transition-colors">Guides</Link>
        <span className="mx-2 text-gray-300">·</span>
        <Link to={YOUR_DATA_PATH} className="hover:text-gray-600 transition-colors">Your data</Link>
        <span className="mx-2 text-gray-300">·</span>
        <Link to="/changelog" className="hover:text-gray-600 transition-colors" title="Changelog">
          {BUILD_DATE ? `Updated ${formatDate(BUILD_DATE)}` : "Changelog"}
        </Link>
      </footer>

      <DeleteAccountDialog open={deleteAccountOpen} onClose={() => setDeleteAccountOpen(false)} />

      <ImportPedDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  );
}

/** hiddenIds: pedigrees listed under Your pedigrees, left out here. */
function RecentOnThisDevice({ disabled, hiddenIds }: { disabled: boolean; hiddenIds: Set<string> }) {
  const navigate = useNavigate();
  const [stored, setRecent] = useState<RecentPedigree[]>(() => listRecentPedigrees());
  const recent = stored.filter(p => !hiddenIds.has(p.id));

  if (!recent.length) return null;

  const forget = (id: string) => {
    forgetRecentPedigree(id);
    setRecent(listRecentPedigrees());
  };

  return (
    <div className="mb-10" data-testid="recent-on-this-device">
      <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">
        Recent on this device
      </p>
      <p className="text-xs text-gray-400 mb-3">
        Pedigrees opened in this browser. The list is stored here only, so it does not follow you to another device or browser.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        {recent.map(p => (
          <li key={p.id} className="flex items-stretch gap-1">
            <button
              className="flex-1 min-w-0 text-left px-3 py-2 rounded border hover:bg-gray-50 transition-colors disabled:opacity-50"
              onClick={() => navigate(`/p/${p.id}`)}
              disabled={disabled}
              title={`/p/${p.id}`}
            >
              <span className="block text-sm font-medium truncate">{p.title || DEFAULT_PEDIGREE_NAME}</span>
              <span className="block text-xs text-gray-400">
                Opened {new Date(p.openedAt).toLocaleDateString()}
              </span>
            </button>
            <button
              className="px-2 text-sm text-gray-400 hover:text-black rounded border hover:bg-gray-50 transition-colors"
              onClick={() => forget(p.id)}
              aria-label={`Remove ${p.title || DEFAULT_PEDIGREE_NAME} from recent`}
              title="Remove from this list (the pedigree itself is not deleted)"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyPedigrees({ pedigrees }: { pedigrees: PedigreeMeta[] }) {
  const navigate = useNavigate();

  if (!pedigrees.length) return null;

  return (
    <div className="mb-10" data-testid="your-pedigrees">
      <p className="text-sm text-gray-400 uppercase tracking-wider mb-3">
        Your pedigrees
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        {pedigrees.map((p) => (
          <li key={p.id}>
            <button
              className="w-full text-left px-3 py-2 rounded border hover:bg-gray-50 transition-colors"
              onClick={() => navigate(`/p/${p.id}`)}
            >
              <span className="block text-sm font-medium">{p.title}</span>
              <span className="block text-xs text-gray-400">
                {new Date(p.updated).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
