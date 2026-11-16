/**
 * Error reporting (#49): the part that is always in the bundle, a few lines.
 * With no DSN in the build it does nothing: no listener, no request, and the
 * reporter chunk (`reporter.ts`, `scrub.ts`) is never fetched. What a report
 * contains is decided in `scrub.ts`, and only there.
 */
import { SENTRY_DSN, SENTRY_ENVIRONMENT } from "../config";
import { BUILD_DATE } from "../utils/buildInfo";

type Extra = { mechanism: "onerror" | "unhandledrejection" | "react"; componentStack?: string | null };
type Send = (thrown: unknown, extra: Extra) => unknown;

export const errorReportingOn = SENTRY_DSN !== "";

/** The build date, never the commit (see `utils/buildInfo.ts`). `vite build` prints it for source map uploads. */
export const RELEASE = `pededit-frontend@${BUILD_DATE ?? "dev"}`;

let reporter: Promise<Send> | null = null;

function load(): Promise<Send> {
  reporter ??= import("./reporter").then((m) =>
    m.createReporter({ dsn: SENTRY_DSN, release: RELEASE, environment: SENTRY_ENVIRONMENT }),
  );
  return reporter;
}

export function reportError(thrown: unknown, extra: Extra): void {
  if (!errorReportingOn) return;
  load().then((send) => send(thrown, extra)).catch(() => {});
}

/** Call once at startup. Uncaught errors and unhandled promise rejections are reported. */
export function initErrorReporting(): void {
  if (!errorReportingOn || reporter) return;
  void load().catch(() => {});
  // Chrome keeps 10 frames by default, which is often all React.
  try { (Error as { stackTraceLimit?: number }).stackTraceLimit = 50; } catch { /* not V8 */ }
  // `error` also fires for failed <img> and <script> loads and for
  // cross-origin "Script error."; those carry no error object and are skipped.
  window.addEventListener("error", (e) => {
    if (e.error != null) reportError(e.error, { mechanism: "onerror" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportError(e.reason, { mechanism: "unhandledrejection" });
  });
}
