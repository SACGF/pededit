/**
 * When this bundle was built, set by `vite.config.ts`. Production builds run
 * in `deploy.sh`, so this is the deploy date. Only the date is shown, never
 * the commit: the repo is public and a commit tells a scanner which fixes a
 * server lacks (see backend/AGENTS.md, health check).
 */
declare const __PEDEDIT_BUILD_DATE__: string;

// vitest has its own config without the define.
export const BUILD_DATE: string | null =
  typeof __PEDEDIT_BUILD_DATE__ === "undefined" ? null : __PEDEDIT_BUILD_DATE__;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
