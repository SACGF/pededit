import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { GUIDES, guidePath } from "./guides";

const PAGE_TITLE_SUFFIX = " | PedEdit";

/** The frame of every guide page: header, the guide, the other guides, footer. */
export function GuideLayout({ title, intro, current, children }: {
  title: string;
  intro: ReactNode;
  /** The guide's slug, left out of the list of other guides. None on the index. */
  current?: string;
  children: ReactNode;
}) {
  // The prerendered file has its own <title>; this is for arriving by a link in the app.
  useEffect(() => {
    const before = document.title;
    document.title = title + PAGE_TITLE_SUFFIX;
    return () => { document.title = before; };
  }, [title]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="text-lg font-medium tracking-tight">PedEdit</Link>
        <Link to="/guides" className="text-sm text-gray-500 hover:text-black">Guides</Link>
      </header>

      <main className="flex-1 px-4 sm:px-8 py-10">
        <article className="guide w-full max-w-3xl mx-auto text-base text-gray-800 leading-relaxed">
          <h1 className="text-2xl font-medium tracking-tight text-black mb-3">{title}</h1>
          <div className="text-gray-600 mb-8">{intro}</div>
          {children}

          <aside className="mt-12 border-t pt-6">
            <p className="text-base mb-3">
              <Link to="/" className="font-medium text-black underline underline-offset-2">Open PedEdit</Link>
              {" "}to draw a pedigree: free, open source, no account needed.
            </p>
            <p className="text-sm text-gray-400 uppercase tracking-wider mb-2">{current ? "Other guides" : "Guides"}</p>
            <ul className="space-y-1">
              {GUIDES.filter(g => g.slug !== current).map(g => (
                <li key={g.slug}>
                  <Link to={guidePath(g.slug)} className="text-black underline underline-offset-2">{g.title}</Link>
                </li>
              ))}
            </ul>
          </aside>
        </article>
      </main>

      <footer className="border-t px-8 py-4 text-center text-sm text-gray-400">
        <a href="https://github.com/SACGF/pededit" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600">GitHub</a>
        <span className="mx-2 text-gray-300">·</span>
        <Link to="/changelog" className="hover:text-gray-600">Changelog</Link>
      </footer>
    </div>
  );
}

/** A section heading inside a guide. */
export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return <h2 id={id} className="text-lg font-medium text-black mt-10 mb-3">{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-3">{children}</p>;
}

/** A link into the app: the editor, an example. */
export function AppLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="text-black underline underline-offset-2">{children}</Link>;
}

/** The NSGC papers every guide cites. */
export function References() {
  return (
    <>
      <H2>References</H2>
      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
        <li>Bennett RL, French KS, Resta RG, Doyle DL (2008). Standardized human pedigree nomenclature: update and assessment of the recommendations of the National Society of Genetic Counselors. J Genet Couns 17:424-433. <a className="underline" href="https://doi.org/10.1007/s10897-008-9169-9">doi:10.1007/s10897-008-9169-9</a></li>
        <li>Bennett RL, French KS, Resta RG, Austin J (2022). Practice resource-focused revision: Standardized pedigree nomenclature update centered on sex and gender inclusivity. J Genet Couns 31:1238-1248. <a className="underline" href="https://doi.org/10.1002/jgc4.1621">doi:10.1002/jgc4.1621</a></li>
      </ul>
    </>
  );
}
