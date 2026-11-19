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
const ERROR_REPORTS = "When the app or the server hits an error, a report goes to Rollbar, an error tracking service: "
  + "the kind of error, where in the code it happened and the kind of page (a pedigree page, not which one). A "
  + "report never carries what is in a pedigree, a pedigree's link, or who you are.";

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
          Each pedigree is saved on the server at {host}: the chart, its title and everything typed into it,
          including names, dates and notes. Changes are saved as you make them. Importing a file saves a new
          pedigree there too, and so does the first change to an example.
        </>
      ),
    },
    {
      term: "Where it is",
      text: (
        <>
          The server is on the{" "}
          <a href="https://nectar.org.au" target="_blank" rel="noopener noreferrer" className={external}>
            Nectar Research Cloud
          </a>
          , at its Adelaide node in Australia. It is run by SA Pathology and the Centre for Cancer Biology.
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
          server&apos;s database at once and cannot be undone. {backupStatement()}
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
          tokens. Signing out takes your account&apos;s pedigrees off that list. On a shared computer, anyone
          using this browser can see the rest of it and follow its links.
        </>
      ),
    },
    {
      term: "Signing in",
      text: (
        <>
          Optional. Signing in with Google or GitHub stores the name and email address of that account on the
          server, along with any conditions and tags you save to <span className={name}>My library</span>.{" "}
          <span className={name}>Delete account</span>, at the top of the home page while signed in, deletes the
          account, the pedigrees created while signed in and My library at once. Pedigrees created while signed
          out are not part of the account and stay.
        </>
      ),
    },
    {
      term: "What is not done",
      text: (
        <>
          No analytics, advertising or tracking scripts. The app sends a pedigree only to {host}, and exports
          are made in your browser. The site is served through Cloudflare, which protects it from attacks:
          requests pass through Cloudflare on the way to the server, and it does not store pedigrees.{" "}
          {GOOGLE_CLIENT_ID
            ? "One script comes from another site, on the Sign in page only: Google's sign-in script. No pedigree is sent to it."
            : "No scripts, fonts or other files are loaded from other sites."}{" "}
          {ROLLBAR_ACCESS_TOKEN && ERROR_REPORTS}{" "}
          The server&apos;s request logs record the time, the address requested (which includes a
          pedigree&apos;s id, not its contents), the browser and the IP address, and are kept for 14 days. The
          server&apos;s usage figures count pedigrees and accounts, not what is in them.
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
