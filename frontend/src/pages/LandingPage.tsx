import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { ImportPedDialog } from "../components/ImportPedDialog";
import { EXAMPLES } from "../data/examples";
import type { Pedigree } from "@pedigree-editor/layout-engine";

export default function LandingPage() {
  const { isAuthenticated, user, fetchMe, createPedigree, createPedigreeFromData, logout } = useAppStore();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

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
    try {
      const id = await createPedigree("Untitled pedigree");
      navigate(`/p/${id}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImport = async (pending: { title: string; pedigree: Pedigree }[]) => {
    if (!pending.length) return;
    setLoading("import");
    try {
      let lastId: string | null = null;
      for (const { title, pedigree } of pending) {
        lastId = await createPedigreeFromData(title, pedigree);
      }
      if (lastId) navigate(`/p/${lastId}`);
    } finally {
      setLoading(null);
    }
  };

  const handleExample = async (index: number) => {
    const ex = EXAMPLES[index];
    setLoading(`example-${index}`);
    try {
      const id = await createPedigreeFromData(ex.label, ex.data);
      navigate(`/p/${id}`);
    } finally {
      setLoading(null);
    }
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
        <div className="w-full max-w-lg">
          <p className="text-sm text-gray-500 mb-8">
            A pedigree editor for clinical genetics.
            {!isAuthenticated && (
              <> No account required. Each pedigree gets a unique URL you can bookmark or share. Just keep track of your links.{" "}
              <span
                className="text-black underline underline-offset-2 cursor-pointer"
                onClick={() => navigate("/login")}
              >Sign in</span> to manage all your pedigrees in one place.</>
            )}
          </p>

          {/* Primary actions */}
          <div className="flex gap-2 mb-10">
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
              Import from PED file…
            </Button>
          </div>

          {/* Examples */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">
              Start from an example
            </p>
            <div className="grid grid-cols-2 gap-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  className="text-left border rounded p-3 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  onClick={() => handleExample(i)}
                  disabled={loading !== null}
                >
                  <span className="block text-xs font-medium mb-0.5">{ex.label}</span>
                  <span className="block text-[10px] text-gray-400">{ex.description}</span>
                  {loading === `example-${i}` && (
                    <span className="block text-[10px] text-gray-400 mt-1">Loading…</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* My pedigrees (authenticated) */}
          {isAuthenticated && <MyPedigrees />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-8 py-4 text-center">
        <a
          href="https://github.com/SACGF/pededit"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          GitHub
        </a>
      </footer>

      <ImportPedDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
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
      <ul className="space-y-1">
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
