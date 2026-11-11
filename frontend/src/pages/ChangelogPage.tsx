import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BUILD_DATE, formatDate } from "../utils/buildInfo";

/**
 * Release notes (#79). The data is `public/changelog.json`, written from the
 * GitHub milestones by `scripts/changelog.mjs` at deploy time, so it is served
 * from our own origin and visitors never call GitHub.
 */
interface ChangelogIssue { number: number; title: string; url: string }
interface ChangelogRelease {
  title: string;
  description: string;
  url: string;
  released: boolean;
  date: string | null;
  issues: ChangelogIssue[];
}

const MILESTONES_URL = "https://github.com/SACGF/pededit/milestones?state=closed";

export default function ChangelogPage() {
  const [releases, setReleases] = useState<ChangelogRelease[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/changelog.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { releases: ChangelogRelease[] }) => setReleases(j.releases))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b px-8 py-4 flex items-center justify-between">
        <Link to="/" className="text-base font-medium tracking-tight">PedEdit</Link>
      </header>

      <main className="flex-1 px-8 py-12">
        <div className="w-full max-w-lg mx-auto">
          <h2 className="text-sm font-medium mb-1">Changelog</h2>
          <p className="text-xs text-gray-400 mb-8">{BUILD_DATE && `Last deployed ${formatDate(BUILD_DATE)}`}</p>

          {failed && (
            <p className="text-xs text-gray-500">
              The changelog is not available here. See the{" "}
              <a href={MILESTONES_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                milestones on GitHub
              </a>.
            </p>
          )}
          {!failed && releases === null && <p className="text-xs text-gray-400">Loading…</p>}

          {releases?.map((r) => (
            <section key={r.url} className="mb-10" data-release={r.title}>
              <div className="flex items-baseline justify-between gap-4 mb-1">
                <h3 className="text-xs font-medium">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-2">
                    {r.title}
                  </a>
                </h3>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                  {r.released ? formatDate(r.date) : "In progress"}
                </span>
              </div>
              {r.description && <p className="text-xs text-gray-500 mb-2">{r.description}</p>}
              <ul className="text-xs text-gray-700 list-disc pl-4 space-y-0.5">
                {r.issues.map((i) => (
                  <li key={i.number}>
                    {i.title}{" "}
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600">
                      #{i.number}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
