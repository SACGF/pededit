import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { GOOGLE_CLIENT_ID, ROLLBAR_ACCESS_TOKEN } from "../config";
import { backupStatement } from "../utils/backupStatement";

export const YOUR_DATA_PATH = "/your-data";
export const YOUR_DATA_TITLE = "What happens to your pedigrees";
export const YOUR_DATA_DESCRIPTION = "What PedEdit stores, where the server is, who can read a pedigree and how to delete it.";

/**
 * /your-data: what happens to a pedigree once it is drawn, linked from the
 * landing page. Not a legal privacy policy, and it must not be called one.
 *
 * Every sentence here states what the code, the deploy config or the
 * maintainer says, so a change to any of these needs the matching sentence
 * changed with it:
 * - where the server is and who runs it, the request logs' 14 days (the
 *   server's logrotate) and Cloudflare in front of it: the maintainer (#203);
 * - access rules: `backend/api/views.py` (`PedigreeViewSet.get_queryset`),
 *   the id is a uuid4 (`backend/api/models.py`), 122 random bits,
 *   pinned by `PedigreeAccessTests` in `backend/api/tests.py`;
 * - deleting: `SettingsPanel` ("Delete this pedigree"), a hard delete;
 *   backups: `backupStatement` from `deploy/backup.sh`'s age limit;
 *   the account: `MeView.destroy` (`DeleteAccountTests`), `DeleteAccountDialog`;
 * - de-identified export: `io/svg/deidentify.ts`;
 * - browser storage: `utils/recentPedigrees.ts`, the tokens in
 *   `store/useAppStore.ts`, `showMinimap` and `compactLayout` in `CanvasPage`;
 * - other sites: `components/GoogleAuthProvider.tsx` wraps the sign-in page
 *   only (`App.tsx`), so Google's script loads there and nowhere else, when
 *   a Google client ID is built in; error reports go to Rollbar when the
 *   build has a token, carrying what `errorReporting/scrub.ts` allows;
 * - logs: `deploy/pededit-nginx.conf`, `deploy/pededit.service` (access logs
 *   on, health check left out) and `manage.py usage_stats`.
 *
 * Still to revisit: #47 (hardening, rate limiting), check the sentence
 * about request logs.
 */
export default function YourDataPage() {
  // The prerendered file has its own <title>; this is for arriving by a link in the app.
  useEffect(() => {
    const before = document.title;
    document.title = `${YOUR_DATA_TITLE} | PedEdit`;
    return () => { document.title = before; };
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="text-lg font-medium tracking-tight">PedEdit</Link>
      </header>
      <main className="flex-1 px-4 sm:px-8 py-10">
        <div className="w-full max-w-3xl mx-auto">
          <YourData />
          <p className="mt-10 text-sm">
            <Link to="/" className="font-medium text-black underline underline-offset-2">Open PedEdit</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

/** Follows `errorReporting/scrub.ts` and `backend/peded/error_reporting.py`: change them together. */
const ERROR_REPORTS = "Errors are reported to Rollbar with the kind of error, where in the code and the kind of page, "
  + "never a pedigree's contents, its link, or who you are.";

const external = "underline underline-offset-2 hover:text-black";

function YourData() {
  // The static copy built for search engines (prerender.tsx) knows no host.
  const host = typeof window === "undefined" ? "this site" : window.location.host;
  const name = "text-gray-700";
  const rows: { term: string; text: ReactNode }[] = [
    {
      term: "What is stored",
      text: (
        <>
          Each pedigree is saved on the server at {host} as you edit it, with everything typed into it: names,
          dates and notes. Imported files and edited examples are saved too.
        </>
      ),
    },
    {
      term: "Where it is",
      text: (
        <>
          On the{" "}
          <a href="https://nectar.org.au" target="_blank" rel="noopener noreferrer" className={external}>
            Nectar Research Cloud
          </a>{" "}
          in Adelaide, Australia, run by SA Pathology and the Centre for Cancer Biology.
        </>
      ),
    },
    {
      term: "Who can read it",
      text: (
        <>
          Made while signed out: anyone with the link can read, change and delete it, even after you sign in.
          The link ends in a random 32-character code with far too many possibilities to guess, and is not listed
          anywhere or indexed by search engines, so share it as carefully as the chart. Made while signed in:
          only your account can open it. Whoever runs the server can read everything on it.
        </>
      ),
    },
    {
      term: "How to delete it",
      text: (
        <>
          <span className={name}>Pedigree settings</span> (the cog in the toolbar), then{" "}
          <span className={name}>Delete this pedigree</span>. No account is needed, and it cannot be undone.{" "}
          {backupStatement()}
        </>
      ),
    },
    {
      term: "Names are optional",
      text: (
        <>
          A chart can be drawn without names, dates or notes. SVG, PNG and PDF exports can{" "}
          <span className={name}>De-identify</span>: pedigree numbers (I-1, II-2) replace names, and dates,
          notes, the chart title and clinical details are left out. CSV, PED, Phenopackets and JSON exports cannot.
        </>
      ),
    },
    {
      term: "In this browser",
      text: (
        <>
          <span className={name}>Recent on this device</span> (links and titles of the last 20 pedigrees opened
          here), two display settings and, while signed in, your sign-in tokens. Anyone using this browser can
          see that list; signing out removes your account&apos;s pedigrees from it.
        </>
      ),
    },
    {
      term: "Signing in",
      text: (
        <>
          Optional. The server stores your Google or GitHub name and email, and anything you save to{" "}
          <span className={name}>My library</span>. <span className={name}>Delete account</span>, on the home
          page, deletes the account, its pedigrees and My library. Pedigrees made while signed out stay.
        </>
      ),
    },
    {
      term: "What is not done",
      text: (
        <>
          No analytics, advertising or tracking. Pedigrees go only to {host}; exports are made in your browser.
          Requests pass through Cloudflare for protection from attacks, which stores no pedigrees.{" "}
          {GOOGLE_CLIENT_ID
            ? "The only script from another site is Google's sign-in, on the Sign in page, and no pedigree is sent to it."
            : "Nothing is loaded from other sites."}{" "}
          {ROLLBAR_ACCESS_TOKEN && ERROR_REPORTS}{" "}
          Request logs (time, address requested including a pedigree&apos;s id, browser, IP address) are kept for
          14 days. Usage figures count pedigrees and accounts, not their contents.
        </>
      ),
    },
    {
      term: "Running your own",
      text: (
        <>
          PedEdit is open source, so a team can{" "}
          <a
            href="https://github.com/SACGF/pededit/blob/main/INSTALL.md"
            target="_blank"
            rel="noopener noreferrer"
            className={external}
          >
            run its own copy
          </a>.
        </>
      ),
    },
  ];

  return (
    <section data-testid="your-data">
      <h1 className="text-2xl font-medium tracking-tight text-black mb-6">{YOUR_DATA_TITLE}</h1>
      <dl className="max-w-2xl grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-x-6 gap-y-1 sm:gap-y-3 text-sm leading-relaxed">
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
