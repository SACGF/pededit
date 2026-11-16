import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BUILD_DATE, formatDate } from "../utils/buildInfo";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { ImportPedDialog } from "../components/ImportPedDialog";
import { EXAMPLES, EXAMPLE_GROUPS } from "../data/examples";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { listRecentPedigrees, forgetRecentPedigree, type RecentPedigree } from "../utils/recentPedigrees";
import { GOOGLE_CLIENT_ID } from "../config";
import { requestErrorMessage } from "../api/errors";
import type { ReactNode } from "react";

export default function LandingPage() {
  const { isAuthenticated, user, fetchMe, createPedigree, createPedigreeFromData, logout } = useAppStore();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  // Why the last create or import failed: the rate limit's wait (#184), or a plain failure.
  const [createError, setCreateError] = useState<string | null>(null);

  // Populate user state after a page reload. fetchMe will trigger the token
  // refresh interceptor if the access token is expired, so this also warms up
  // the auth state before MyPedigrees fires loadPedigrees.
  useEffect(() => {
    if (isAuthenticated && !user) {
      fetchMe().catch(() => { /* interceptor handles auth failures */ });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateBlank = async () => {
    setLoading("blank");
    setCreateError(null);
    try {
      const id = await createPedigree("Untitled pedigree");
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
        <h1 className="text-base font-medium tracking-tight">PedEdit</h1>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <span className="text-xs text-gray-500">
                {user?.first_name
                  ? `${user.first_name} ${user.last_name}`.trim()
                  : user?.email || user?.username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-3"
                onClick={logout}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-3"
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
          <p className="text-sm text-gray-500 mb-3 max-w-xl">
            Automatic layout from <a href="https://cran.r-project.org/package=kinship2" target="_blank" rel="noopener noreferrer" className="text-black underline underline-offset-2">kinship2</a>, handling consanguinity and complex families. Drag-and-drop repositioning. <a href="https://github.com/SACGF/pededit" target="_blank" rel="noopener noreferrer" className="text-black underline underline-offset-2">Open source</a>.
          </p>
          {!isAuthenticated && (
            <p className="text-sm text-gray-500 mb-8 max-w-xl">
              <span className="text-black font-medium">No account required.</span>{" "}
              Click a button below to start drawing. Each pedigree is saved at its own private URL, so bookmark the link to come back to it or share it with a colleague.{" "}
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
              className="h-8 text-xs px-4"
              onClick={handleCreateBlank}
              disabled={loading !== null}
            >
              {loading === "blank" ? "Creating…" : "Create blank pedigree"}
            </Button>
            <Button
              variant="outline"
              className="h-8 text-xs px-4"
              onClick={() => setImportOpen(true)}
              disabled={loading !== null}
            >
              Import from PED or JSON file…
            </Button>
          </div>
          {createError && (
            <p role="alert" data-testid="create-error" className="-mt-8 mb-10 text-xs text-red-600 max-w-xl">{createError}</p>
          )}
          {/* Pointer to the "Your data" section at the foot of the page (#178) */}
          <p className="-mt-7 mb-10 text-[10px] text-gray-400">
            Pedigrees are saved on this server.{" "}
            <a href="#your-data" className="underline underline-offset-2 hover:text-gray-600">
              What is stored and who can read it
            </a>
          </p>

          {/* Recent on this device (#16): per browser, no account needed */}
          <RecentOnThisDevice disabled={loading !== null} />

          {/* Examples */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">
              Start from an example
            </p>
            {EXAMPLE_GROUPS.map(group => (
              <div key={group} className="mb-4">
                {group && (
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">{group}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {EXAMPLES.map(ex => (ex.group ?? "") === group && (
                    // A link, so it can be copied or opened in a new tab; ExamplePage makes the copy (#150).
                    <Link
                      key={ex.slug}
                      to={`/example/${ex.slug}`}
                      className="block text-left border rounded p-3 hover:bg-gray-50 transition-colors"
                    >
                      <span className="block text-xs font-medium mb-0.5">{ex.label}</span>
                      <span className="block text-[10px] text-gray-400">{ex.description}</span>
                      {ex.citation && (
                        <span className="block text-[10px] text-gray-400 mt-0.5">{ex.citation}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* My pedigrees (authenticated) */}
          {isAuthenticated && <MyPedigrees />}

          {/* What is stored, who can read it, how to delete it (#178) */}
          <YourData />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-8 py-4 text-center text-xs text-gray-400">
        <a
          href="https://github.com/SACGF/pededit"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          GitHub
        </a>
        <span className="mx-2 text-gray-300">·</span>
        <Link to="/changelog" className="hover:text-gray-600 transition-colors" title="Changelog">
          {BUILD_DATE ? `Updated ${formatDate(BUILD_DATE)}` : "Changelog"}
        </Link>
      </footer>

      <ImportPedDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  );
}

function RecentOnThisDevice({ disabled }: { disabled: boolean }) {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<RecentPedigree[]>(() => listRecentPedigrees());

  if (!recent.length) return null;

  const forget = (id: string) => {
    forgetRecentPedigree(id);
    setRecent(listRecentPedigrees());
  };

  return (
    <div className="mb-10" data-testid="recent-on-this-device">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
        Recent on this device
      </p>
      <p className="text-[10px] text-gray-400 mb-3">
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
              <span className="block text-xs font-medium truncate">{p.title || "Untitled pedigree"}</span>
              <span className="block text-[10px] text-gray-400">
                Opened {new Date(p.openedAt).toLocaleDateString()}
              </span>
            </button>
            <button
              className="px-2 text-xs text-gray-400 hover:text-black rounded border hover:bg-gray-50 transition-colors"
              onClick={() => forget(p.id)}
              aria-label={`Remove ${p.title || "Untitled pedigree"} from recent`}
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

function MyPedigrees() {
  const { pedigrees, loadPedigrees } = useAppStore();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadPedigrees().then(() => setLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded || !pedigrees.length) return null;

  return (
    <div className="mt-10">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">
        Your pedigrees
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        {pedigrees.map((p) => (
          <li key={p.id}>
            <button
              className="w-full text-left px-3 py-2 rounded border hover:bg-gray-50 transition-colors"
              onClick={() => navigate(`/p/${p.id}`)}
            >
              <span className="block text-xs font-medium">{p.title}</span>
              <span className="block text-[10px] text-gray-400">
                {new Date(p.updated).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What happens to a pedigree once it is drawn (#178). Not a legal privacy
 * policy, and it must not be called one.
 *
 * Every sentence here states what the code and the deploy config do, so a
 * change to any of these needs the matching sentence changed with it:
 * - access rules: `backend/api/views.py` (`PedigreeViewSet.get_queryset`),
 *   pinned by `PedigreeAccessTests` in `backend/api/tests.py`;
 * - deleting: `SettingsPanel` ("Delete this pedigree"), a hard delete;
 * - de-identified export: `io/svg/deidentify.ts`;
 * - browser storage: `utils/recentPedigrees.ts`, the tokens in
 *   `store/useAppStore.ts`, `showMinimap` and `compactLayout` in `CanvasPage`;
 * - other sites: `components/GoogleAuthProvider.tsx` wraps the whole app, so
 *   Google's script loads on every page when a Google client ID is built in;
 * - logs: `deploy/pededit-nginx.conf`, `deploy/pededit.service` (access logs
 *   on, health check left out) and `manage.py usage_stats`.
 *
 * Still to revisit:
 * - #48 (database backups): once backups run on the server, "How to delete
 *   it" must say how long a deleted pedigree stays in them.
 * - #49 (error reporting): once errors are reported to an outside service,
 *   "What is not done" must name it and say what a report carries.
 * - #47 (hardening, rate limiting): check the sentence about request logs.
 * - Where the server is and who runs it is not said, because the repository
 *   does not say. Add it under its own heading once the maintainer has.
 */
function YourData() {
  const host = window.location.host;
  const name = "text-gray-700";
  const rows: { term: string; text: ReactNode }[] = [
    {
      term: "What is stored",
      text: (
        <>
          Each pedigree is saved on the server at {host}: the chart, its title and everything typed into it,
          including names, dates and notes. Changes are saved as you make them. Opening an example or importing
          a file saves a new pedigree there too.
        </>
      ),
    },
    {
      term: "Who can read it",
      text: (
        <>
          A pedigree created while signed out is open to anyone who has its link: they can read it, change it
          and delete it. The server does not list it anywhere and search engines are asked not to index it, so
          the link is the key. Share it as carefully as the chart itself. It stays that way if you sign in
          later. A pedigree created while signed in opens only in your account, and its link does not work for
          anyone else. Whoever runs the server can read everything stored on it.
        </>
      ),
    },
    {
      term: "How to delete it",
      text: (
        <>
          Open the pedigree, then <span className={name}>Pedigree settings</span> (the cog in the toolbar) and{" "}
          <span className={name}>Delete this pedigree</span>. No account is needed. This removes it from the
          server&apos;s database at once and cannot be undone. A backup of the database made before then would
          still hold it.
        </>
      ),
    },
    {
      term: "Names are optional",
      text: (
        <>
          Names, dates and notes are optional: a chart can be drawn with none. The SVG, PNG and PDF exports have
          a <span className={name}>De-identify</span> option, which replaces names with pedigree numbers (I-1,
          II-2) and leaves out dates, notes, the chart title and the clinical details. The CSV, PED and JSON
          exports have no such option.
        </>
      ),
    },
    {
      term: "In this browser",
      text: (
        <>
          This browser keeps the <span className={name}>Recent on this device</span> list (the links and titles
          of the last 20 pedigrees opened here), two display settings and, while you are signed in, your sign-in
          tokens. On a shared computer, anyone using this browser can see that list and follow its links.
        </>
      ),
    },
    {
      term: "Signing in",
      text: (
        <>
          Optional. Signing in with Google or GitHub stores the name and email address of that account on the
          server, along with any conditions and tags you save to <span className={name}>My library</span>.
        </>
      ),
    },
    {
      term: "What is not done",
      text: (
        <>
          No analytics, advertising or tracking scripts. The app sends a pedigree only to {host}, and exports
          are made in your browser.{" "}
          {GOOGLE_CLIENT_ID
            ? "One script comes from another site: Google's sign-in script, which loads with every page so that Sign in works. No pedigree is sent to it."
            : "No scripts, fonts or other files are loaded from other sites."}{" "}
          The server&apos;s request logs record the time, the address requested (which includes a
          pedigree&apos;s id, not its contents), the browser and the IP address. The server&apos;s usage
          figures count pedigrees and accounts, not what is in them.
        </>
      ),
    },
    {
      term: "Running your own",
      text: (
        <>
          PedEdit is open source. A team that has to keep pedigrees on its own systems can{" "}
          <a
            href="https://github.com/SACGF/pededit/blob/main/INSTALL.md"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-black"
          >
            run its own copy
          </a>.
        </>
      ),
    },
  ];

  return (
    <section id="your-data" className="mt-12 border-t pt-8" data-testid="your-data">
      <h2 className="text-xs text-gray-400 uppercase tracking-wider mb-4">
        What happens to your pedigrees
      </h2>
      <dl className="max-w-2xl grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-x-6 gap-y-1 sm:gap-y-3 text-xs leading-relaxed">
        {rows.map(({ term, text }) => (
          <div key={term} className="contents">
            <dt className="font-medium text-black mt-3 sm:mt-0">{term}</dt>
            <dd className="text-gray-500">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
